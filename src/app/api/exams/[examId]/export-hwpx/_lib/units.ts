/**
 * HWPX 단위 변환 헬퍼.
 * HWPUNIT = 1/7200 inch
 *  - 1mm  ≈ 283.4646
 *  - 1pt  = 100
 *  - 1 in = 7200
 * charPr height 는 별도로 1/100 pt 단위(100=1pt) — pt→hpu100 으로 변환.
 */

export const HPU_PER_INCH = 7200;
export const HPU_PER_MM = HPU_PER_INCH / 25.4;
export const HPU_PER_PT = 100;

export function mm(value: number): number {
  return Math.round(value * HPU_PER_MM);
}

export function inch(value: number): number {
  return Math.round(value * HPU_PER_INCH);
}

export function pt(value: number): number {
  return Math.round(value * HPU_PER_PT);
}

/** charPr/height용 1/100 pt 단위 (예: 11pt → 1100). */
export function ptToCharHeight(value: number): number {
  return Math.round(value * 100);
}

/** A4 세로 (210mm × 297mm) HWPUNIT. */
export const A4_WIDTH = mm(210);
export const A4_HEIGHT = mm(297);
