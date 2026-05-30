/**
 * A4 단위 변환 유틸.
 *
 * 저장은 늘 mm, 렌더는 px.
 * 96dpi 기준: 1mm ≈ 3.7795275591px (= 96 / 25.4)
 */

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const MM_PER_INCH = 25.4;
export const CSS_DPI = 96;
export const PX_PER_MM = CSS_DPI / MM_PER_INCH;

export function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

export function pxToMm(px: number): number {
  return px / PX_PER_MM;
}

/** A4 페이지 안으로 좌표/크기를 강제. (편집 중 페이지 바깥으로 나가는 것 방지) */
export function clampToPage(
  box: { x: number; y: number; w: number; h: number },
  opts: { allowOverflowMm?: number } = {},
): { x: number; y: number; w: number; h: number } {
  const overflow = opts.allowOverflowMm ?? 5; // 약간의 여유 허용
  const minX = -overflow;
  const maxX = A4_WIDTH_MM + overflow;
  const minY = -overflow;
  const maxY = A4_HEIGHT_MM + overflow;

  const w = Math.max(5, Math.min(box.w, A4_WIDTH_MM + 2 * overflow));
  const h = Math.max(3, Math.min(box.h, A4_HEIGHT_MM + 2 * overflow));
  const x = Math.max(minX, Math.min(box.x, maxX - w));
  const y = Math.max(minY, Math.min(box.y, maxY - h));

  return { x, y, w, h };
}
