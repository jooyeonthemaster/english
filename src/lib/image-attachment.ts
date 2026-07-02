// 헬프센터(피드백·고객지원) 이미지 첨부 공통 유틸.
// 글 본문·답변·댓글 어디서든 동일한 압축/제약을 쓰도록 한 곳에 모은다.
// 원본은 브라우저 canvas로 축소·webp 재인코딩하여 data URL 로 만든 뒤 서버 액션에
// 실어 보낸다(스토리지 대신 DB Json 저장). 서버 액션 본문 한도(10MB)와 DB 부담을
// 넘기지 않도록 "웬만하면 한도에 안 걸리게" 목표 용량까지 자동으로 더 줄인다.

export interface Attachment {
  name: string;
  url: string; // data URL
  size?: number;
  type?: string;
}

export const MAX_ATTACHMENTS = 3;
// 원본 허용 한도(이 이하는 모두 받아서 자동 리사이즈). 4K 스크린샷(보통 5~15MB) 무난.
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024; // 25MB
// 리사이즈 후 긴 변 최대 픽셀(4K 캡처도 텍스트 가독성 충분).
const MAX_DIMENSION = 2560;
// 첨부 1개당 목표 용량. 3개를 붙여도 서버 액션 10MB 한도에 여유가 남는 값.
const TARGET_BYTES = 1.5 * 1024 * 1024; // ~1.5MB
// 목표 초과 시 순차적으로 낮춰가며 재인코딩할 (긴 변, 품질) 조합.
const SHRINK_STEPS: { dimension: number; quality: number }[] = [
  { dimension: MAX_DIMENSION, quality: 0.9 },
  { dimension: MAX_DIMENSION, quality: 0.8 },
  { dimension: 2048, quality: 0.8 },
  { dimension: 2048, quality: 0.7 },
  { dimension: 1600, quality: 0.7 },
  { dimension: 1280, quality: 0.65 },
];

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.round(b64.length * 0.75);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode failed"));
    el.src = url;
  });
}

function encodeWebp(
  img: HTMLImageElement,
  maxDimension: number,
  quality: number,
): string | null {
  const longest = Math.max(img.width, img.height);
  const scale = longest > maxDimension ? maxDimension / longest : 1;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);

  const out = canvas.toDataURL("image/webp", quality);
  // webp 미지원 브라우저는 image/png 로 폴백 → 채택하지 않는다.
  return out.startsWith("data:image/webp") ? out : null;
}

/**
 * 큰 이미지를 긴 변 축소 + webp 재인코딩으로 압축한다. 목표 용량(TARGET_BYTES)을
 * 넘으면 품질·해상도를 단계적으로 더 낮춰 웬만하면 한도에 안 걸리게 한다.
 * 압축이 불필요하거나(더 커지거나) webp 인코딩이 안 되면 원본을 그대로 반환한다.
 * GIF는 애니메이션이 깨지므로 원본 유지.
 */
export async function compressImage(file: File): Promise<Attachment> {
  const originalUrl = await readAsDataUrl(file);
  const fallback: Attachment = {
    name: file.name,
    url: originalUrl,
    size: file.size,
    type: file.type,
  };

  if (file.type === "image/gif") return fallback;

  try {
    const img = await decodeImage(originalUrl);

    let best: string | null = null;
    for (const step of SHRINK_STEPS) {
      const out = encodeWebp(img, step.dimension, step.quality);
      if (!out) continue;
      best = out;
      if (dataUrlBytes(out) <= TARGET_BYTES) break; // 목표 이내면 더 안 줄임
    }

    // 압축 결과가 없거나 원본보다 크면 원본 채택.
    if (!best || best.length >= originalUrl.length) return fallback;

    const baseName = file.name.replace(/\.[^./\\]+$/, "");
    return {
      name: `${baseName}.webp`,
      url: best,
      size: dataUrlBytes(best),
      type: "image/webp",
    };
  } catch {
    return fallback;
  }
}
