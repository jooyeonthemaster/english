// ============================================================================
// Crop utilities — normalized (0~1) coordinate math + canvas cropping.
// Coordinate system is ALWAYS normalized 0~1 relative to the (EXIF-corrected)
// source image, so a crop box is resolution- and render-scale-independent.
// (adaptive-intake D-G2)
// ============================================================================

import { MAX_PAGE_IMAGE_BYTES } from "@/lib/extraction/constants";
import type { CropBox } from "@/lib/extraction/types";

/**
 * canvas를 MAX_PAGE_IMAGE_BYTES(5MB) 이하가 되도록 품질을 낮춰가며 인코딩한다.
 * 못 맞추면 최선치를 반환(호출부/추출 직전 가드가 최종 차단). 합친 이미지가 5MB를
 * 넘어 추출 단계에서 서버에 거부당하던 문제(HIGH-1) 완화.
 */
async function encodeCanvasUnderLimit(
  canvas: HTMLCanvasElement,
  mime: string,
  startQuality: number,
): Promise<Blob> {
  const qualities = [startQuality, 0.85, 0.78, 0.7, 0.62, 0.5];
  let last: Blob | null = null;
  for (const q of qualities) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), mime, q),
    );
    if (!blob) continue;
    last = blob;
    if (blob.size <= MAX_PAGE_IMAGE_BYTES) return blob;
  }
  if (last) return last;
  throw new Error("이미지 인코딩에 실패했습니다.");
}

/** 최소 크롭 변 길이 (정규화) — 너무 작은 영역 방지. */
export const MIN_CROP_SIZE = 0.03;

export type ResizeHandle =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w";

export const RESIZE_HANDLES: ResizeHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 두 점(정규화)으로부터 좌상단 기준 박스 생성. */
export function rectFromPoints(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): CropBox {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  };
}

/** 박스를 0~1 안으로, 그리고 최소 크기 이상으로 보정. */
export function clampCropBox(box: CropBox, minSize = MIN_CROP_SIZE): CropBox {
  const w = Math.max(minSize, Math.min(1, box.w));
  const h = Math.max(minSize, Math.min(1, box.h));
  const x = clamp01(Math.min(box.x, 1 - w));
  const y = clamp01(Math.min(box.y, 1 - h));
  return { x, y, w, h };
}

/** 핸들 드래그로 박스 리사이즈. (nx, ny)는 포인터의 정규화 좌표. */
export function resizeCropBox(
  box: CropBox,
  handle: ResizeHandle,
  nx: number,
  ny: number,
  minSize = MIN_CROP_SIZE,
): CropBox {
  let { x, y, w, h } = box;
  const right = x + w;
  const bottom = y + h;

  if (handle.includes("w")) {
    const nextX = Math.min(clamp01(nx), right - minSize);
    w = right - nextX;
    x = nextX;
  }
  if (handle.includes("e")) {
    w = Math.max(minSize, clamp01(nx) - x);
  }
  if (handle.includes("n")) {
    const nextY = Math.min(clamp01(ny), bottom - minSize);
    h = bottom - nextY;
    y = nextY;
  }
  if (handle.includes("s")) {
    h = Math.max(minSize, clamp01(ny) - y);
  }
  return clampCropBox({ x, y, w, h }, minSize);
}

/** 박스를 (dx, dy)만큼 이동(정규화). 경계 밖으로 안 나가게 보정. */
export function moveCropBox(box: CropBox, dx: number, dy: number): CropBox {
  return {
    x: clamp01(Math.min(box.x + dx, 1 - box.w)),
    y: clamp01(Math.min(box.y + dy, 1 - box.h)),
    w: box.w,
    h: box.h,
  };
}

/** 화면(px) 좌표 → 이미지 박스 기준 정규화 좌표. */
export function toNormalized(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  return {
    x: clamp01((clientX - rect.left) / Math.max(1, rect.width)),
    y: clamp01((clientY - rect.top) / Math.max(1, rect.height)),
  };
}

/** 정규화 박스를 CSS percent 스타일로. */
export function cropBoxToStyle(box: CropBox): React.CSSProperties {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
  };
}

/** 정규화 박스를 사람이 읽는 라벨로 ("x12 y34 w60 h20"). */
export function cropBoxLabel(box: CropBox): string {
  const p = (n: number) => Math.round(n * 100);
  return `x${p(box.x)} y${p(box.y)} w${p(box.w)} h${p(box.h)}`;
}

/**
 * 원본 이미지(blob)를 정규화 박스로 잘라 새 JPEG blob 생성.
 * `imageOrientation: "from-image"`로 EXIF 회전을 먼저 보정한 뒤 자른다.
 */
export async function cropImageToBlob(
  source: Blob,
  box: CropBox,
  opts?: { quality?: number; mime?: string },
): Promise<{ blob: Blob; width: number; height: number; previewUrl: string }> {
  const bitmap = await createImageBitmap(source, {
    imageOrientation: "from-image",
  });
  try {
    const sx = Math.round(clamp01(box.x) * bitmap.width);
    const sy = Math.round(clamp01(box.y) * bitmap.height);
    const sw = Math.max(1, Math.round(box.w * bitmap.width));
    const sh = Math.max(1, Math.round(box.h * bitmap.height));

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d 컨텍스트를 사용할 수 없습니다.");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

    const mime = opts?.mime ?? "image/jpeg";
    const quality = opts?.quality ?? 0.92;
    const blob = await encodeCanvasUnderLimit(canvas, mime, quality);
    return {
      blob,
      width: sw,
      height: sh,
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    bitmap.close?.();
  }
}

/**
 * 여러 정규화 박스를 순서대로 세로로 이어붙여 단일 이미지(=한 지문)로 만든다.
 * 한 지문이 여러 칼럼/페이지 영역에 나뉜 경우(C4/C5) 1개 지문으로 추출하기 위함.
 * 박스 순서 = 읽기 순서(1→2→…). 폭이 다르면 좌측 정렬, 최대 폭 기준 캔버스.
 */
export async function stitchCropsToBlob(
  source: Blob,
  boxes: CropBox[],
  opts?: { quality?: number; mime?: string; gap?: number },
): Promise<{ blob: Blob; width: number; height: number; previewUrl: string }> {
  if (boxes.length === 0) throw new Error("이어붙일 영역이 없습니다.");
  const bitmap = await createImageBitmap(source, {
    imageOrientation: "from-image",
  });
  try {
    const gap = Math.max(0, opts?.gap ?? 0);
    const px = boxes.map((b) => ({
      sx: Math.round(clamp01(b.x) * bitmap.width),
      sy: Math.round(clamp01(b.y) * bitmap.height),
      sw: Math.max(1, Math.round(b.w * bitmap.width)),
      sh: Math.max(1, Math.round(b.h * bitmap.height)),
    }));
    const width = Math.max(1, ...px.map((p) => p.sw));
    const height =
      px.reduce((sum, p) => sum + p.sh, 0) + gap * Math.max(0, px.length - 1);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d 컨텍스트를 사용할 수 없습니다.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    let y = 0;
    for (const p of px) {
      ctx.drawImage(bitmap, p.sx, p.sy, p.sw, p.sh, 0, y, p.sw, p.sh);
      y += p.sh + gap;
    }

    const mime = opts?.mime ?? "image/jpeg";
    const quality = opts?.quality ?? 0.92;
    const blob = await encodeCanvasUnderLimit(canvas, mime, quality);
    return { blob, width, height, previewUrl: URL.createObjectURL(blob) };
  } finally {
    bitmap.close?.();
  }
}

/**
 * 여러 독립 이미지(blob)를 순서대로 세로로 이어붙여 단일 이미지(=한 지문)로 만든다.
 * 페이지/장 경계를 넘는 "한 지문"을 1개 슬롯=1 OCR로 추출하기 위함 (접근 A).
 * blob 순서 = 읽기 순서(1→2→…). 폭이 다르면 좌측 정렬, 최대 폭 기준 캔버스.
 * maxWidth 초과 시 비율 유지 다운스케일(긴 이미지 OCR 글자 뭉개짐 가드).
 */
export async function stitchSlotsToBlob(
  blobs: Blob[],
  opts?: { quality?: number; mime?: string; gap?: number; maxWidth?: number },
): Promise<{ blob: Blob; width: number; height: number; previewUrl: string }> {
  if (blobs.length === 0) throw new Error("이어붙일 이미지가 없습니다.");
  const gap = Math.max(0, opts?.gap ?? 0);
  const bitmaps = await Promise.all(
    blobs.map((b) => createImageBitmap(b, { imageOrientation: "from-image" })),
  );
  try {
    const rawWidth = Math.max(1, ...bitmaps.map((b) => b.width));
    const scale =
      opts?.maxWidth && rawWidth > opts.maxWidth ? opts.maxWidth / rawWidth : 1;
    const width = Math.round(rawWidth * scale);
    const heights = bitmaps.map((b) => Math.max(1, Math.round(b.height * scale)));
    const height =
      heights.reduce((s, h) => s + h, 0) + gap * Math.max(0, bitmaps.length - 1);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d 컨텍스트를 사용할 수 없습니다.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    let y = 0;
    bitmaps.forEach((b, i) => {
      const w = Math.max(1, Math.round(b.width * scale));
      const h = heights[i];
      ctx.drawImage(b, 0, 0, b.width, b.height, 0, y, w, h); // 좌측 정렬
      y += h + gap;
    });

    const mime = opts?.mime ?? "image/jpeg";
    const quality = opts?.quality ?? 0.92;
    const blob = await encodeCanvasUnderLimit(canvas, mime, quality);
    return { blob, width, height, previewUrl: URL.createObjectURL(blob) };
  } finally {
    bitmaps.forEach((b) => b.close?.());
  }
}
