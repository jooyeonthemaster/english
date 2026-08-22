export const PX_PER_MM = 96 / 25.4;

/** A4 한 장의 픽셀 폭(210mm @96dpi) — 썸네일 scale 계산용. */
export const REPORT_A4_WIDTH_PX = Math.round(210 * PX_PER_MM);

/**
 * .par-sheet-body 의 가용 높이(mm) — **런타임 실측이 실패했을 때만 쓰는 폴백**.
 *
 * 실제 값은 pages.tsx 가 매 측정마다 .par-measure 안의 프로브 시트(실제 러닝헤더/푸터를
 * 가진 빈 .par-sheet)에서 직접 잰다. 러닝헤더 높이가 로고 유무로 달라져 상수로 고정할 수
 * 없기 때문이다. 폴백은 '넘치는 쪽'보다 '덜 담는 쪽'이 안전하므로 로고 있는 경우 기준.
 * (압축 조판 개편으로 시트 패딩 10/13/8mm + 크롬 축소 — .tmp-worksheet-qa/compact-spec.md §2.
 *  실측: 로고 있음 ≈263mm / 없음 ≈265mm.)
 */
export const PAGE_BODY_MM = 262;

/**
 * 실측 가용 높이에서 빼는 안전여유(mm). rect 측정의 서브픽셀·반올림 잔차와
 * 페이지 경계에서 재계상되는 공유 테두리(0.15mm 수준)를 흡수한다.
 */
export const PAGE_SAFETY_MM = 0.8;

/** .par-box 의 상하 크롬 — padding 2.6mm×2 + border .3mm×2 = 5.8 → 6(보수 반올림). */
export const BOX_PAD_MM = 6;

/** .par-ws-block 의 상하 크롬 — padding 2.2mm×2 + border .3mm×2 = 5.0mm. */
export const ACTIVITY_PAD_MM = 5;

/** .par-block / .par-runblock margin-bottom 과 동기(compact-spec §3). */
export const RUN_GAP_MM = 3.2;

/** .par-reading-flow-run margin-bottom 과 동기 — 독해 런은 더 좁은 간격을 쓰므로
 *  공용 RUN_GAP 으로 계상하면 런 경계마다 0.6mm 과대 계상되어 캔버스 블록이
 *  1~2mm 차이로 통째 이월된다(R2 실측: 비마지막 페이지 하단 47~88mm 공백). */
export const READING_RUN_GAP_MM = 2.6;

/** .par-sentences li margin-bottom 과 동기. */
export const LI_GAP_MM = 1.4;

/** .par-arrow height 와 동기. */
export const ARROW_MM = 5;

/** 카드 그리드(단어장) 페이지 이월 머리(.par-cont-head-cont) 높이 예산 — CSS 와 동기. */
export const CONT_HEAD_MM = 5;

/**
 * 블록 하단 세로 리사이즈 핸들. 드래그 중에는 DOM 에 직접 minHeight(px)만 입혀
 * 즉각 반응(재페이지네이션 없음) + pointer capture 로 작은 핸들에서도 안 놓침.
 * 콘텐츠 자연 높이 아래로는 못 줄임(텍스트 잘림 방지). pointer-up 에서만 state commit(mm).
 */
export const MIN_RESIZE_MM = 6;
