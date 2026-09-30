// ============================================================================
// 조판 칸 세로 넘침 실측 — 순수 DOM(React 의존 없음).
//
// 넘침 가드(hooks/use-overflow-guarded-pagination.ts)가 보정할 칸을 찾을 때, 인쇄 잡(exam-print-job.ts)이
// 인쇄 직전 「고칠 수 없어 넘친 채 남은 칸」을 셀 때 같은 판정식을 쓴다(26-09-30 PRINT-R3 — 한 칸보다 긴
// 해설 블록은 가드가 포기(stuck)하는데 원격 측정은 guard:'settled' 로 나가 잘린 PDF 가 정상으로 기록됐다).
// ============================================================================

/** 칸 넘침 허용 오차(무배율 px) */
export const OVERFLOW_TOLERANCE_PX = 1;

/** 칸 키 `쪽:칸` — 가드의 보정 · 포기 기록 키와 같다 */
export function columnKey(page: number, column: number): string {
  return `${page}:${column}`;
}

export type ColumnOverflow = {
  page: number;
  column: number;
  /** 칸 윗끝~내용 아래끝(무배율 px) */
  used: number;
  /** 칸 가용 높이(main 높이, 무배율 px) */
  available: number;
};

/**
 * 그려진 페이지들(`[data-exam-page-index] .exam-a4-page`)에서 넘친 칸을 앞에서부터 찾는다(skip 에 든 칸은
 * 건너뜀). 칸의 내용 아래끝 = 마지막 조각(fragment) 박스의 아래끝 — 절대배치 장식(드래그 핸들 · 빈 줄 캐럿)은
 * 박스 크기에 들어가지 않으므로 실제 글자만 잰다. transform scale(미리보기 축소)은 보정한다.
 */
export function findColumnOverflows(
  root: ParentNode,
  skip: Record<string, true> = {},
  firstOnly = true,
): ColumnOverflow[] {
  const frames = Array.from(root.querySelectorAll<HTMLElement>("[data-exam-page-index]"))
    .map((frame) => ({ frame, index: Number(frame.dataset.examPageIndex) }))
    .filter((entry) => Number.isFinite(entry.index))
    .sort((a, b) => a.index - b.index);
  const found: ColumnOverflow[] = [];
  for (const { frame, index } of frames) {
    const main = frame.querySelector<HTMLElement>(".exam-a4-page main");
    if (!main || main.offsetHeight <= 0) continue;
    const mainRect = main.getBoundingClientRect();
    const scale = mainRect.height / main.offsetHeight || 1;
    Array.from(main.children).forEach((column, columnIndex) => {
      if (!firstOnly || found.length === 0) {
        if (skip[columnKey(index, columnIndex)]) return;
        const last = column.lastElementChild;
        if (!last) return;
        const bottom = last.getBoundingClientRect().bottom;
        const overflow = (bottom - mainRect.bottom) / scale;
        if (overflow > OVERFLOW_TOLERANCE_PX) {
          found.push({
            page: index,
            column: columnIndex,
            used: (bottom - mainRect.top) / scale,
            available: main.offsetHeight,
          });
        }
      }
    });
    if (firstOnly && found.length > 0) break;
  }
  return found;
}
