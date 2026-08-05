// ============================================================================
// AI 지문 생성 — 원본 페이지 이미지 조달 (서버 전용)
//
// 왜 이 파일이 따로 있나(26-08-04):
//   이 로직은 run-job.ts 안의 module-private 함수였다. 그래서 **생중계 레인
//   (stream/route.ts)이 이미지를 실을 방법이 없었고**, 그 레인은 "원본 페이지를
//   보내는 자료가 있으면 나는 부적격"이라고 스스로를 배제하는 것으로 대응했다.
//   결과적으로 자료 검토 모달에서 '원본 페이지도 함께 보냄' 스위치를 켜는 순간
//   1편 발주가 조용히 실시간 미리보기를 잃었다 — 사용자가 예측할 수 없는 동작이다.
//   조달을 여기로 빼서 **두 레인이 같은 한 벌**을 쓰게 한다.
//
// 왜 클라이언트가 바이트를 직접 보내지 않나: 이미지 바이트를 요청 본문에 실으면
// Vercel 4.5MB 벽에 직행한다(next.config 의 bodySizeLimit 10mb 는 Server Actions
// 전용이라 API Route 에는 적용되지 않는다). 그래서 클라이언트는 서명 업로드로
// 스토리지에 올리고 **경로 문자열만** 요청에 싣는다. 실제 바이트는 여기서 읽는다.
//
// 회귀 방지 계약
//  · **어떤 실패도 밖으로 던지지 않는다**(run-job 계약 7). 스토리지가 흔들려도
//    이미지 0장으로 생성을 계속하는 편이 전편 실패보다 언제나 낫다.
//  · **런에 1회만 부른다.** 배치 6편이 같은 묶음을 공유하므로 편마다 부르면 같은
//    바이트를 6번 내려받는다.
//  · storagePath 는 **사용자 입력**이다. 반드시 safeStoragePath 로 학원 프리픽스를
//    검증한다 — 검증 없이 download 하면 다른 학원의 오브젝트를 읽어 모델 프롬프트에
//    인라인하는 경로가 열린다.
// ============================================================================

import { STORAGE_BUCKET } from "@/lib/extraction/constants";
import type { AuthoringPageImage } from "@/lib/passage-authoring/generate";
import type { AuthoringMaterial } from "@/lib/passage-authoring/schema";
import { downloadAsBuffer, getServiceSupabase } from "@/lib/supabase-storage";

// ── 전송 쪽 수 상한 — **편수에 따라 갈린다** (26-08-04) ─────────────────────
//
// 왜 갈리는가(예전 주석 두 개가 서로 반대로 말하고 있었고, 한쪽이 틀렸다):
//   · 조달(스토리지 다운로드)은 **런에 1회**다. 여기까지는 옛 run-job 주석이 맞다.
//   · 그러나 **모델 입력 토큰은 편수만큼 곱해진다** — run-job.runOne(index) 가 편마다
//     돌면서 매 호출에 같은 paged.images 를 싣기 때문이다. 옛 run-job 주석의
//     "(원가가 편수만큼 곱해지지 않는 이유)" 는 틀린 문장이었고, material-readers 의
//     "배치 6편이면 같은 이미지가 6번 재전송된다" 가 맞는 문장이다.
// 즉 상한 4 의 진짜 근거는 **배치**에만 있다. 1편 발주에는 곱셈이 아예 없다.
//
// 쪽당 토큰(코드가 이미 측정해 둔 값 — material-readers.ts:105-109): Gemini 는
// 768×768 타일당 258토큰이고 긴 변 1800px 이미지가 약 1,500토큰이다. PDF 는
// scale 2.2(158 DPI)로 굽는 탓에 A4 한 쪽의 긴 변이 ~1,700px 라 딱 그 구간이다.
//   4쪽  ≈  6,000 토큰   → 6편이면 36,000
//  20쪽  ≈ 30,000 토큰   → 6편이면 180,000  ← 이건 못 낸다
// 그래서 1편만 20쪽으로 연다.

/** 1편 발주 — 이미지가 정확히 한 번만 실린다. PDF 앞 20쪽(판독 상한과 같은 값). */
export const MAX_PAGE_IMAGES_SINGLE = 20;

/** 2편 이상 — 같은 이미지가 편수만큼 재전송되므로 조인다. */
export const MAX_PAGE_IMAGES_BATCH = 4;

/**
 * 이번 실행이 모델에 보여 줄 원본 쪽 수의 총량.
 *
 * **여기가 유일한 판정점이다.** 호출부가 count 를 보고 직접 고르게 두면 잡 레인과
 * 생중계 레인이 조용히 다른 값을 쓰게 된다(두 레인은 이미 한 번 그렇게 갈렸다 —
 * 조달 자체가 한쪽에만 있었다).
 */
export function maxPageImagesFor(count: number): number {
  return count <= 1 ? MAX_PAGE_IMAGES_SINGLE : MAX_PAGE_IMAGES_BATCH;
}

/**
 * 조달 총 바이트 상한 — 쪽 수 상한과 함께 움직인다.
 *
 * 12MB 는 취향이 아니라 **실측 천장**이다: exam-report/llm-images.ts 가 같은
 * 게이트웨이에서 "원본 카메라 사진 8장(~28MB)이면 502" 를 재현하고 총예산을 12MB 로
 * 잡았다. 20쪽을 열더라도 그 위로는 올리지 않는다 — 넘치는 쪽은 건너뛰고 경고가
 * 나가는 편이, 요청 전체가 502 로 죽는 것보다 낫다.
 */
function maxPageImageBytesFor(maxPages: number): number {
  return maxPages > MAX_PAGE_IMAGES_BATCH ? 12 * 1024 * 1024 : 8 * 1024 * 1024;
}

const PAGE_IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

function pageMediaType(path: string): string {
  const ext = path.toLowerCase().match(PAGE_IMAGE_EXT)?.[1] ?? "jpg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * 클라이언트가 준 경로를 그대로 믿지 않는다. storagePath 는 요청 본문으로 들어오는
 * **사용자 입력**이라, 검증 없이 download 하면 다른 학원의 오브젝트를 읽어 모델
 * 프롬프트에 인라인하는 경로가 열린다. 학원 프리픽스 밖·상위 이동은 전부 버린다.
 */
function safeStoragePath(raw: string | undefined, academyId: string): string | null {
  const path = (raw ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!path || path.length > 500) return null;
  if (path.includes("..")) return null;
  if (!path.startsWith(`${academyId}/`)) return null;
  return path;
}

/**
 * storagePath 는 한 장(오브젝트 경로)일 수도, 여러 장이 든 묶음(프리픽스)일 수도
 * 있다 — 업로드 단계가 쪽 수만큼 올리기 때문이다. 확장자로 갈라 처리한다.
 */
async function listPageObjects(path: string, limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  if (PAGE_IMAGE_EXT.test(path)) return [path];
  const { data, error } = await getServiceSupabase()
    .storage.from(STORAGE_BUCKET)
    .list(path, { limit: 100, sortBy: { column: "name", order: "asc" } });
  if (error || !data) return [];
  return data
    .filter((entry) => entry.name && PAGE_IMAGE_EXT.test(entry.name))
    .map((entry) => `${path}/${entry.name}`)
    .slice(0, limit);
}

export interface ProcuredPageImages {
  images: AuthoringPageImage[];
  /** 실제로 한 장이라도 실린 자료 id — 요청 스냅샷의 sendPages 표시가 이 집합을 쓴다. */
  pagedMaterialIds: Set<string>;
  /**
   * 결과에 그대로 실을 한국어 안내(해요체). "켰는데 0장 실린 자료"가 생겼다는
   * 사실은 스냅샷의 sendPages:false 만으로는 화면에 드러나지 않는다 — 스위치는
   * 켜진 채 남아 "원본도 함께 보내요"라고 말하기 때문이다. 그래서 결과 카드가
   * 이미 그리는 item.warnings 로 사실을 올려보낸다(차단하지 않는다).
   */
  warnings: string[];
}

/** 조달을 한 번도 시도하지 않은(또는 실패한) 호출부가 쓰는 빈 결과. */
export function emptyProcuredPageImages(): ProcuredPageImages {
  return { images: [], pagedMaterialIds: new Set(), warnings: [] };
}

/**
 * 페이지 예산의 **자료 간 공정 배분**.
 *
 * 왜 필요한가: 예전엔 자료를 순서대로 돌며 총량이 찰 때까지 담았다(선착순).
 * 자료 2건에 sendPages 를 켜면 첫 자료가 4장을 다 먹고 두 번째 자료는 통째로
 * 0장이 됐다 — 선생님은 두 자료를 다 켰는데 모델은 한쪽만 봤다.
 *
 * 규칙: 켜진 자료가 k 건이면 각 자료에 floor(총량/k)장(최소 1장)을 먼저 깔고,
 * 남은 자리를 앞에서부터 **한 바퀴에 한 장씩** 채운다. 총합은 절대 total 을
 * 넘지 않는다(원가 불변). k > total 이면 뒤쪽 자료는 0장이고, 그 사실은 호출부가
 * 경고로 알린다 — 상한을 늘려 조용히 원가를 올리지 않는다.
 */
export function allocatePageQuota(
  available: ReadonlyArray<number>,
  total: number,
): number[] {
  const alloc = available.map(() => 0);
  const k = available.length;
  if (k === 0 || total <= 0) return alloc;

  let remaining = total;
  const base = Math.max(1, Math.floor(total / k));
  for (let i = 0; i < k && remaining > 0; i += 1) {
    const take = Math.min(base, available[i] ?? 0, remaining);
    alloc[i] = take;
    remaining -= take;
  }
  // 남은 자리(예: 자료 1건이 base 만큼 못 채웠을 때)를 한 장씩 돌려 채운다.
  // progressed 가 없으면 모든 자료가 가진 쪽을 다 쓴 뒤 무한 루프가 된다.
  let progressed = true;
  while (remaining > 0 && progressed) {
    progressed = false;
    for (let i = 0; i < k && remaining > 0; i += 1) {
      if ((alloc[i] ?? 0) >= (available[i] ?? 0)) continue;
      alloc[i] = (alloc[i] ?? 0) + 1;
      remaining -= 1;
      progressed = true;
    }
  }
  return alloc;
}

/** 경고 문구에 담을 자료 이름 — 길어지지 않게 3건까지만 적고 나머지는 센다. */
function materialNameList(names: ReadonlyArray<string>): string {
  const head = names.slice(0, 3).join("·");
  return names.length > 3 ? `${head} 외 ${names.length - 3}건` : head;
}

/**
 * sendPages 가 켜진 자료의 페이지 JPEG 를 읽어 온다. **런에 1회**만 돈다 —
 * 배치 6편이 같은 묶음을 공유하므로 편마다 받으면 같은 바이트를 6번 내려받는다.
 *
 * 예산은 자료 간 공정 배분이다(allocatePageQuota). 총 쪽 수 상한과 바이트 상한은
 * 그대로라 원가는 오르지 않고, 배분만 "선착순"에서 "돌아가며"로 바뀐다.
 * 그래도 0장이 된 자료가 있으면 out.warnings 에 사실을 남긴다.
 *
 * 어떤 실패도 밖으로 던지지 않는다(계약 7). 스토리지가 흔들려도 판독본이 있으면
 * 그대로 있으니, 이미지 0장으로 생성을 계속하는 편이 전편 실패보다 언제나 낫다.
 *
 * logTag 는 로그 접두사다 — 잡 레인은 jobId 를, 생중계 레인은 자기 식별자를 준다
 * (두 레인이 같은 함수를 쓰므로 로그에서 어느 쪽인지 구분할 수 있어야 한다).
 */
export async function procurePageImages(args: {
  logTag: string;
  academyId: string;
  materials: AuthoringMaterial[];
  /**
   * 이번 실행의 편수. **반드시 넘긴다** — 상한이 여기서 갈리기 때문이다
   * (maxPageImagesFor). 안 넘기면 배치가 20쪽을 싣고 원가가 5배가 된다.
   */
  count: number;
}): Promise<ProcuredPageImages> {
  const { logTag, academyId } = args;
  const maxPages = maxPageImagesFor(args.count);
  const maxBytes = maxPageImageBytesFor(maxPages);
  const out = emptyProcuredPageImages();

  // 사용자가 켠 자료만 본다(숨은 자동 결정 금지). 이 한 줄은 문자열 그대로
  // tests/unit/passage-authoring-page-uploads.test.mjs 가 대조하는 배선 계약이다.
  const requested: AuthoringMaterial[] = [];
  for (const material of args.materials) {
    if (!material.sendPages) continue;
    requested.push(material);
  }
  if (requested.length === 0) return out;

  const displayName = (material: AuthoringMaterial): string =>
    material.name.trim() ||
    `자료 ${args.materials.findIndex((m) => m.id === material.id) + 1}`;

  // ── ① 후보 수집: 경로 검증 + 목록 조회 ─────────────────────────────────
  // 여기서 실패한 자료(경로 거절·빈 프리픽스·목록 오류)는 예산 문제가 아니라
  // 조달 문제다. 원인이 다르면 안내 문구도 달라야 해서 따로 센다.
  const candidates: Array<{ material: AuthoringMaterial; objects: string[] }> = [];
  const unreadable: string[] = [];

  for (const material of requested) {
    const path = safeStoragePath(material.storagePath, academyId);
    if (!path) {
      if (material.storagePath) {
        console.warn(
          `[PASSAGE-AUTHORING] page image path rejected (${logTag}, material=${material.id})`,
        );
      }
      unreadable.push(displayName(material));
      continue;
    }
    try {
      // 자료 하나가 아무리 많은 쪽을 갖고 있어도 런 총량 이상은 쓸 수 없다.
      const objects = await listPageObjects(path, maxPages);
      if (objects.length === 0) {
        unreadable.push(displayName(material));
        continue;
      }
      candidates.push({ material, objects });
    } catch (err) {
      console.error(
        `[PASSAGE-AUTHORING] page image list failed (${logTag}, material=${material.id}):`,
        err instanceof Error ? err.message : err,
      );
      unreadable.push(displayName(material));
    }
  }

  // ── ② 공정 배분 → 라운드로빈 내려받기 ──────────────────────────────────
  // 받는 순서를 "자료별 1쪽 → 자료별 2쪽 …"으로 짜는 이유는 바이트 상한 때문이다.
  // 자료 순서대로 받으면 앞 자료의 큰 스캔 몇 장이 8MB 를 먹어 뒤 자료가 다시
  // 굶는다. 첫 쪽부터 돌아가며 받으면 그 굶주림이 생기지 않는다.
  const alloc = allocatePageQuota(
    candidates.map((entry) => entry.objects.length),
    maxPages,
  );
  const plan: Array<{ slot: number; page: number; object: string }> = [];
  const deepest = alloc.reduce((max, value) => Math.max(max, value), 0);
  for (let page = 0; page < deepest; page += 1) {
    for (let slot = 0; slot < candidates.length; slot += 1) {
      if (page >= (alloc[slot] ?? 0)) continue;
      const object = candidates[slot]?.objects[page];
      if (object) plan.push({ slot, page, object });
    }
  }

  const fetched: Array<{ slot: number; page: number; image: AuthoringPageImage }> =
    [];
  let bytes = 0;
  for (const step of plan) {
    try {
      const buffer = await downloadAsBuffer(step.object);
      if (!buffer.length) continue;
      // 상한을 넘기는 한 장은 건너뛰고 계속한다(중단하지 않는다) — 계획은 최대
      // 4장이라 순회가 싸고, 뒤에 올 작은 쪽이 실릴 자리를 남겨 둔다.
      if (bytes + buffer.length > maxBytes) continue;
      bytes += buffer.length;
      fetched.push({
        slot: step.slot,
        page: step.page,
        image: { data: buffer, mediaType: pageMediaType(step.object) },
      });
      const material = candidates[step.slot]?.material;
      if (material) out.pagedMaterialIds.add(material.id);
    } catch (err) {
      console.error(
        `[PASSAGE-AUTHORING] page image fetch failed (${logTag}, object=${step.object}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 받는 순서는 공정성 때문에 라운드로빈이지만, **모델에 실을 순서**는 자료 순서
  // → 쪽 순서로 되돌린다. 같은 자료의 쪽이 흩어져 붙으면 표·박스가 쪽 경계에서
  // 끊긴 채 다른 자료 사이에 끼어 읽힌다.
  fetched.sort((a, b) => a.slot - b.slot || a.page - b.page);
  out.images = fetched.map((entry) => entry.image);

  // ── ③ 0장이 된 자료를 사실대로 알린다 ──────────────────────────────────
  // 원인을 섞지 않는다: 자리를 못 받은 것(예산)과 자리를 받고도 못 받아온 것
  // (다운로드 실패·바이트 상한)은 선생님이 취할 다음 행동이 다르다 — 앞은
  // "자료를 줄이거나 나눠 돌려요", 뒤는 "다시 시도해요"다.
  const starved: string[] = [];
  for (let slot = 0; slot < candidates.length; slot += 1) {
    const entry = candidates[slot];
    if (!entry || out.pagedMaterialIds.has(entry.material.id)) continue;
    if ((alloc[slot] ?? 0) > 0) unreadable.push(displayName(entry.material));
    else starved.push(displayName(entry.material));
  }
  if (starved.length > 0) {
    out.warnings.push(
      `원본 페이지는 한 번에 총 ${maxPages}쪽까지만 실려요 — ${materialNameList(starved)}의 원본 페이지는 이번에 함께 보내지 못했어요(판독 텍스트는 그대로 실렸어요)`,
    );
  }
  if (unreadable.length > 0) {
    out.warnings.push(
      `${materialNameList(unreadable)}의 원본 페이지를 불러오지 못해 판독 텍스트만 실었어요`,
    );
  }

  console.log(
    `[PASSAGE-AUTHORING] page images ready (${logTag}): ${out.images.length}p / ${Math.round(bytes / 1024)}KB from ${out.pagedMaterialIds.size}/${requested.length} material(s)`,
  );
  return out;
}
