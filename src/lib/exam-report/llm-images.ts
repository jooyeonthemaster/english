// ============================================================================
// 학생 시험 리포트 — LLM 전송용 이미지 준비 (서버 전용)
//
// 왜: 클라 업로드 상한(장당 5MB, 최대 20장) 그대로면 최악 100MB — 실측에서 원본
// 카메라 사진 8장(~28MB)만으로도 OpenRouter 게이트웨이 502 가 재현됐다. 여기서
// "한 콜에 실리는 최대 장수" 기준 총량 예산으로 초과분만 sharp 재압축해 콜
// 페이로드를 안전 범위로 보장한다.
//
// v4(26-09-02, docs/exam-analysis-v4-spec.md §3 U1-5): E1a 는 6장 청크, E1b 는 페이지
// 국소 배치(최대 6장)라 어떤 콜도 6장을 넘지 않는다. 종전엔 분모가 "전체 페이지
// 수"라 20장이면 장당 600KB 로 압착돼 활자가 뭉개졌다 — 분모를
// min(페이지 수, pagesPerCall) 로 바꿔 20장짜리도 장당 1.5MB 상한을 유지한다.
// 전 페이지를 한 콜에 싣는 호출부(read-material 4장 이하·은퇴한 E2 read)는
// pagesPerCall 을 명시하지 않아도 6장 이하면 종전과 동일 예산이다.
// 주의: pagesPerCall 6 으로 준비한 세트는 「콜당 6장」 전제에서만 안전하다 — 그 세트를
// 전 페이지 한 콜에 실으면 12장 18MB·20장 30MB 로 총량 예산을 넘긴다(8장 원본 28MB
// 에서 502 재현). 전 페이지 콜(E1b pages:null 폴백)은 pagesPerCall = buffers.length
// 로 따로 준비한 세트를 써야 한다(route-run loadExamImages.loadFallbackImages).
// ============================================================================

import type { AtlasChatImageInput } from "@/lib/atlas-chat-rest";

/** 한 콜에 싣는 원시 바이트 총예산 (base64 +33% 감안해 전송 ~16MB 이하로 유지) */
const TOTAL_BUDGET_BYTES = 12 * 1024 * 1024;
/** 페이지 수가 적어도 장당 이 이상은 쓰지 않는다 */
const PAGE_CAP_BYTES = Math.floor(1.5 * 1024 * 1024);
/** 한 콜에 실리는 최대 장수 기본값 — E1a 청크·E1b 국소 배치 상한(exam-page-batching)과 동일 */
export const DEFAULT_PAGES_PER_CALL = 6;

export interface PrepareLlmImagesOptions {
  /**
   * 한 콜에 실리는 최대 장수 — 장당 예산 분모 = min(페이지 수, 이 값). 전 페이지를
   * 한 콜에 싣는 호출부는 buffers.length 를 넘겨 종전 총량 예산을 유지한다.
   */
  pagesPerCall?: number;
}
/** 재압축 사다리 — 시험지 활자 가독을 위해 폭은 1400px 아래로 내리지 않는다 */
const REENCODE_LADDER: { width: number; quality: number }[] = [
  { width: 2000, quality: 80 },
  { width: 1700, quality: 72 },
  { width: 1400, quality: 64 },
];

function detectMime(buf: Buffer): string {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "image/jpeg";
}

/** 장당 예산 = min(1.5MB, 12MB / min(페이지 수, pagesPerCall)) — 순수(테스트 대상). */
export function computePerPageBudgetBytes(pageCount: number, pagesPerCall: number): number {
  const perCall = Math.max(1, Math.min(Math.max(1, pageCount), Math.floor(pagesPerCall)));
  return Math.min(PAGE_CAP_BYTES, Math.floor(TOTAL_BUDGET_BYTES / perCall));
}

/**
 * 버퍼 배열을 LLM 이미지 입력으로 변환. 장당 예산(computePerPageBudgetBytes)을
 * 넘는 페이지만 사다리로 재압축한다. sharp 실패(비이미지 등) 시 원본 유지 —
 * 전송 실패는 상위 콜러의 일시오류 재시도가 흡수한다. opts 생략 = pagesPerCall 6.
 */
export async function prepareLlmImages(
  buffers: Buffer[],
  opts?: PrepareLlmImagesOptions,
): Promise<AtlasChatImageInput[]> {
  const pagesPerCall =
    opts?.pagesPerCall != null && Number.isFinite(opts.pagesPerCall) && opts.pagesPerCall >= 1
      ? opts.pagesPerCall
      : DEFAULT_PAGES_PER_CALL;
  const perPageBudget = computePerPageBudgetBytes(buffers.length, pagesPerCall);
  let sharpMod: typeof import("sharp") | null = null;
  const out: AtlasChatImageInput[] = [];
  for (const buf of buffers) {
    let cur = buf;
    let reencoded = false;
    if (cur.byteLength > perPageBudget) {
      try {
        sharpMod ??= (await import("sharp")).default as unknown as typeof import("sharp");
        for (const step of REENCODE_LADDER) {
          const next = await sharpMod(buf)
            .rotate()
            .resize({ width: step.width, withoutEnlargement: true })
            .jpeg({ quality: step.quality })
            .toBuffer();
          if (next.byteLength < cur.byteLength) {
            cur = next;
            reencoded = true;
          }
          if (cur.byteLength <= perPageBudget) break;
        }
      } catch {
        // 디코드/재압축 실패 — 원본 그대로 전송
      }
    }
    out.push({
      mimeType: reencoded ? "image/jpeg" : detectMime(cur),
      base64: cur.toString("base64"),
    });
  }
  return out;
}
