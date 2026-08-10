import React, { Fragment } from "react";
import { cn } from "@/lib/utils";
import {
  MULTI_BLANK_DISPLAY_SEPARATOR,
  multiBlankHeaderLabels,
} from "@/components/exams/paper-builder/option-display";

// ============================================================================
// 다중 빈칸(BLANK_INFERENCE) 조합 선지 — 실제 수능 형식 "컬럼 헤더" 그리드.
//
//         (A)                      (B)
// ① heighten the ...   ……   prioritize ...
// ② manage the ...     ……   reinforce ...
//
// 선지 목록 위 한 줄에 (A)/(B)/(C) 헤더가 각 값 컬럼 위에 정렬되고, 각 선지 행은
// [번호][값1][……][값2][…] 로 값만(라벨 없이) 표시한다. 모든 셀이 한 CSS 그리드의
// 직접 자식이라 행 간 컬럼 정렬이 정확하다. 발동 판정은 표면이 아니라 공용
// multiBlankOptionMatrix(option-display.ts)가 한다 — 이 컴포넌트는 표시만.
// ============================================================================

/**
 * 그리드 컬럼 템플릿 — [선행열 × leadColumns][값1][sep][값2][sep][값3…].
 * 값 컬럼은 auto(내용 폭, 칸이 좁으면 그 컬럼 안에서 줄바꿈), 번호/구분열은
 * max-content. 컨테이너는 w-fit + max-w-full 로 내용 폭만 차지한다.
 */
export function multiBlankGridTemplateColumns(
  blankCount: number,
  leadColumns = 1,
): string {
  const cols: string[] = Array.from({ length: leadColumns }, () => "max-content");
  for (let i = 0; i < blankCount; i += 1) {
    if (i > 0) cols.push("max-content");
    cols.push("auto");
  }
  return cols.join(" ");
}

export interface MultiBlankOptionGridRow {
  key: React.Key;
  /** 선지 번호 셀 내용(①/② 등 — 배지든 평문이든 표면 자유) */
  numberCell: React.ReactNode;
  /** 컬럼 순서의 값 셀 내용(길이 = blankCount, 패딩 "" 은 빈 셀) */
  cells: React.ReactNode[];
  /** 이 행의 모든 셀에 덧입힐 클래스(정답 강조 등 — 행 박스는 없다) */
  cellClassName?: string;
}

export function MultiBlankOptionGrid({
  blankCount,
  rows,
  showHeader = true,
  className,
  headerCellClassName,
  numberCellClassName,
  valueCellClassName,
  separatorCellClassName,
}: {
  blankCount: number;
  rows: MultiBlankOptionGridRow[];
  /** 칸/쪽 경계 분할 등으로 이어지는 조각에는 헤더를 다시 그릴지 표면이 정한다 */
  showHeader?: boolean;
  className?: string;
  headerCellClassName?: string;
  numberCellClassName?: string;
  valueCellClassName?: string;
  separatorCellClassName?: string;
}) {
  const labels = multiBlankHeaderLabels(blankCount);
  return (
    <div
      className={cn("grid w-fit max-w-full items-start gap-y-1", className)}
      style={{
        gridTemplateColumns: multiBlankGridTemplateColumns(blankCount),
        columnGap: "0.6em",
      }}
    >
      {showHeader && (
        <Fragment>
          <span aria-hidden />
          {labels.map((label, i) => (
            <Fragment key={label}>
              {i > 0 && <span aria-hidden />}
              <span
                className={cn(
                  "text-center font-semibold",
                  headerCellClassName,
                )}
              >
                {label}
              </span>
            </Fragment>
          ))}
        </Fragment>
      )}
      {rows.map((row) => (
        <Fragment key={row.key}>
          <span className={cn(numberCellClassName, row.cellClassName)}>
            {row.numberCell}
          </span>
          {row.cells.map((cell, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <span
                  className={cn(
                    "text-center",
                    separatorCellClassName,
                    row.cellClassName,
                  )}
                >
                  {MULTI_BLANK_DISPLAY_SEPARATOR}
                </span>
              )}
              <span className={cn(valueCellClassName, row.cellClassName)}>
                {cell}
              </span>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
