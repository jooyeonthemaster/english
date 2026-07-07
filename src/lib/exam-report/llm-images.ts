// ============================================================================
// 학생 시험 리포트 — LLM 전송용 이미지 준비 (서버 전용)
//
// 왜: E1a/E2 는 시험지 전 페이지를 한 콜에 싣는다. 클라 업로드 상한(장당 5MB,
// 최대 12장) 그대로면 최악 60MB — 실측에서 원본 카메라 사진 8장(~28MB)만으로도
// OpenRouter 게이트웨이 502 가 재현됐다. 여기서 페이지 수에 따른 총량 예산으로
// 초과분만 sharp 재압축해 한 콜 페이로드를 안전 범위로 보장한다.
// ============================================================================

import type { AtlasChatImageInput } from "@/lib/atlas-chat-rest";

/** 한 콜에 싣는 원시 바이트 총예산 (base64 +33% 감안해 전송 ~16MB 이하로 유지) */
const TOTAL_BUDGET_BYTES = 12 * 1024 * 1024;
/** 페이지 수가 적어도 장당 이 이상은 쓰지 않는다 */
const PAGE_CAP_BYTES = Math.floor(1.5 * 1024 * 1024);
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

/**
 * 버퍼 배열을 LLM 이미지 입력으로 변환. 장당 예산(= min(1.5MB, 12MB/페이지수))을
 * 넘는 페이지만 사다리로 재압축한다. sharp 실패(비이미지 등) 시 원본 유지 —
 * 전송 실패는 상위 콜러의 일시오류 재시도가 흡수한다.
 */
export async function prepareLlmImages(buffers: Buffer[]): Promise<AtlasChatImageInput[]> {
  const perPageBudget = Math.min(
    PAGE_CAP_BYTES,
    Math.floor(TOTAL_BUDGET_BYTES / Math.max(1, buffers.length)),
  );
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
