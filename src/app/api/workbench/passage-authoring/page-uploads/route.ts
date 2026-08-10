import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import {
  PASSAGE_AUTHORING_PATH_SEGMENT,
  createUploadTarget,
} from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ============================================================================
// POST /api/workbench/passage-authoring/page-uploads — 원본 페이지 업로드 티켓
//
// 하이브리드 멀티모달(MULTIMODAL 확정안 B)의 유일한 전달 경로다. 자료의 판독
// **텍스트**는 지금처럼 요청 본문에 실어 보내고, 표·도식·밑줄이 살아 있는 **원본
// 페이지 이미지**는 여기서 받은 서명 URL 로 클라이언트가 스토리지에 직접 PUT 한다.
// 생성 잡(run-job.procurePageImages)이 나중에 그 프리픽스를 읽어 모델 콜에 인라인한다.
//
// 왜 이미지를 이 라우트 본문으로 받지 않는가:
//   Vercel API Route 의 요청 본문 예산은 약 4.5MB 다(next.config 의 bodySizeLimit
//   10mb 는 Server Actions 전용이라 여기 적용되지 않는다). 20쪽 스캔본은 그 벽에
//   직행한다. 서명 URL 을 끊어 주면 큰 바이트가 서버리스 함수를 아예 통과하지 않는다
//   — 자료추출 파이프라인이 이미 같은 방식이다(supabase-storage.createUploadTarget).
//
// 설계 계약(회귀 방지)
//  · **무료**: 크레딧을 차감하지 않는다. 모델 호출이 0회다(티켓만 끊는다).
//  · **경로는 서버가 정한다.** 클라이언트가 준 materialId 를 경로에 절대 끼우지
//    않는다 — 그 값은 사용자 입력이라 "../" 나 다른 학원 프리픽스를 심을 수 있다.
//    경로는 `{academyId}/passage-authoring/{서버 UUID}/{0000.jpg}` 로만 만든다.
//    run-job.safeStoragePath 가 "academyId/ 로 시작하고 .. 가 없을 것"을 다시
//    검사하므로 이중 방어가 되고, 여기서 이미 그 형태만 발급하므로 통과가 보장된다.
//  · **파일명은 4자리 0패딩**이다. run-job.listPageObjects 가 이름 오름차순으로
//    정렬해 쪽 순서를 정하므로, `10.jpg` 같은 이름을 쓰면 `2.jpg` 뒤에 `10.jpg` 가
//    오지 않고 쪽 순서가 뒤집힌다.
//  · **쪽 수 상한은 서버가 강제한다**(MAX_PAGES). 클라이언트 상한(material-readers
//    의 MAX_SEND_PAGES)과 같은 값이지만, 클라이언트를 믿고 티켓을 무제한 끊으면
//    스토리지가 곧 비용이 된다.
//  · 티켓을 끊었다고 업로드가 됐다는 뜻이 아니다. 실제로 몇 장이 실렸는지는
//    run-job 이 프리픽스를 list 해서 판정한다 — 이 라우트는 약속을 하지 않는다.
// ============================================================================

/**
 * 한 자료에서 올릴 수 있는 페이지 수. material-readers.MAX_SEND_PAGES 와 같은 값.
 *
 * ⚠️ 이것은 **스토리지 상한**이지 모델이 보는 쪽 수가 아니다(26-08-04 분리).
 * 실제 전송 상한은 page-images.maxPageImagesFor(count) 가 정한다 — 1편 20쪽 /
 * 2편 이상 4쪽. 여기를 4 로 되돌리면 1편 발주가 20쪽을 볼 방법이 사라진다.
 */
const MAX_PAGES = 20;

/** 발급 남용 가드(학원당 슬라이딩 윈도우). read-material 라우트와 같은 계열의 안전핀. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_TICKETS_PER_WINDOW = 80;

/**
 * 확장자 매핑. run-job.PAGE_IMAGE_EXT(`\.(jpe?g|png|webp)$`)가 인식하는 것만
 * 허용한다 — 인식 못 하는 확장자로 올리면 list 단계에서 조용히 걸러져
 * "올렸는데 안 실린다"가 된다.
 */
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const requestSchema = z.object({
  /** 상관관계 로깅 전용. **경로에 쓰지 않는다**(위 계약). */
  materialId: z.string().min(1).max(64),
  pages: z
    .array(
      z.object({
        index: z.number().int().min(0).max(MAX_PAGES - 1),
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      }),
    )
    .min(1)
    .max(MAX_PAGES),
});

// ── 남용 가드 ───────────────────────────────────────────────────────────────
// ⚠️ 모듈 스코프 Map 이라 서버리스 **인스턴스별 근사치**다. 정밀 쿼터가 아니라
// "실수로 수십 개 자료를 연달아 던지는" 사고를 막는 안전핀이 목적이다(DB 왕복 0ms).

const rateWindow = new Map<string, number[]>();

function consumeRateBudget(academyId: string, tickets: number): boolean {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;

  // 만료 버킷은 훑는 김에 버린다 — 장수 인스턴스에서 Map 이 무한히 자라지 않게.
  for (const [key, stamps] of rateWindow) {
    const alive = stamps.filter((stamp) => stamp > cutoff);
    if (alive.length === 0) rateWindow.delete(key);
    else rateWindow.set(key, alive);
  }

  const current = rateWindow.get(academyId) ?? [];
  if (current.length + tickets > RATE_MAX_TICKETS_PER_WINDOW) return false;
  for (let i = 0; i < tickets; i += 1) current.push(now);
  rateWindow.set(academyId, current);
  return true;
}

// ── 핸들러 ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  // getStaffSession 은 클레임이 비면 academyId 를 빈 문자열로 돌려준다. 그대로
  // 진행하면 프리픽스가 `/passage-authoring/…` 이 되어, 업로드는 성공하는데
  // run-job.safeStoragePath 가 그 경로를 **반드시** 거절한다(academyId/ 로 시작하지
  // 않는다) — 화면은 "원본도 함께 보내요"라고 적혀 있는데 한 장도 안 실리는 거짓
  // 스위치가 된다. 조용한 무동작보다 명시적 실패가 낫다.
  if (!staff.academyId) {
    return NextResponse.json(
      { error: "학원 정보를 확인하지 못했어요. 다시 로그인해 주세요." },
      { status: 403 },
    );
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "원본 페이지 업로드 요청이 올바르지 않아요." },
      { status: 400 },
    );
  }
  const { materialId, pages } = parsed.data;

  // 같은 index 가 두 번 오면 뒤엣것이 앞엣것을 덮어써 쪽이 조용히 사라진다.
  const seen = new Set<number>();
  for (const page of pages) {
    if (seen.has(page.index)) {
      return NextResponse.json(
        { error: "원본 페이지 번호가 중복됐어요." },
        { status: 400 },
      );
    }
    seen.add(page.index);
  }

  if (!consumeRateBudget(staff.academyId, pages.length)) {
    return NextResponse.json(
      { error: "원본 페이지 업로드 요청이 너무 많아요. 1분 뒤에 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  // 경로는 전적으로 서버가 만든다(위 계약). academyId 로 시작하므로 run-job 의
  // safeStoragePath 검사를 구조적으로 통과한다.
  //
  // 네임스페이스 칸은 리터럴이 아니라 supabase-storage 의 공유 상수다. 여기와
  // extraction-daily-cleanup §4(나이 기준 청소)가 같은 이름을 봐야 하는데, 한쪽만
  // 바꾸면 업로드는 계속 성공하면서 청소만 조용히 대상 0건이 되기 때문이다.
  const prefix = `${staff.academyId}/${PASSAGE_AUTHORING_PATH_SEGMENT}/${randomUUID()}`;

  try {
    const targets = await Promise.all(
      pages.map(async (page) => {
        const ext = EXT_BY_CONTENT_TYPE[page.contentType] ?? "jpg";
        const path = `${prefix}/${page.index.toString().padStart(4, "0")}.${ext}`;
        const target = await createUploadTarget(path);
        return { index: page.index, uploadUrl: target.uploadUrl, path: target.uploadPath };
      }),
    );

    console.log(
      `[PASSAGE-AUTHORING] page upload tickets issued (academy=${staff.academyId}, material=${materialId}, pages=${targets.length})`,
    );

    return NextResponse.json({ prefix, targets });
  } catch (error) {
    // 서명 URL 발급 실패는 스토리지 설정 문제다. 사용자에게는 인프라를 노출하지
    // 않고, 하이브리드가 꺼진 채로도 생성은 정상 동작한다는 사실만 남긴다.
    console.error("[PASSAGE-AUTHORING] page upload ticket failed", error);
    return NextResponse.json(
      { error: "원본 페이지를 올릴 준비에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}
