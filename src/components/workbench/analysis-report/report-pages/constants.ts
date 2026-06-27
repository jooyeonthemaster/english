export const PX_PER_MM = 96 / 25.4;

/** A4 한 장의 픽셀 폭(210mm @96dpi) — 썸네일 scale 계산용. */
export const REPORT_A4_WIDTH_PX = Math.round(210 * PX_PER_MM);

// Matches the usable .par-sheet-body height after A4 padding, running header, and footer.
export const PAGE_BODY_MM = 250;

export const BOX_PAD_MM = 9;

export const ACTIVITY_PAD_MM = 6;

export const RUN_GAP_MM = 6;

export const LI_GAP_MM = 2.5;

export const ARROW_MM = 7;

/**
 * 블록 하단 세로 리사이즈 핸들. 드래그 중에는 DOM 에 직접 minHeight(px)만 입혀
 * 즉각 반응(재페이지네이션 없음) + pointer capture 로 작은 핸들에서도 안 놓침.
 * 콘텐츠 자연 높이 아래로는 못 줄임(텍스트 잘림 방지). pointer-up 에서만 state commit(mm).
 */
export const MIN_RESIZE_MM = 6;
