/**
 * 정답표 — 시험지 마지막에 붙는 표(번호/정답 그리드).
 */

import type { BlockNode, BorderSpec, TableRowNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";

const THIN: BorderSpec = {
  type: "SOLID",
  widthMm: 0.15,
  color: COLORS.darkGray,
};
const BOLD: BorderSpec = {
  type: "SOLID",
  widthMm: 0.3,
  color: COLORS.darkGray,
};
const LIGHT: BorderSpec = {
  type: "SOLID",
  widthMm: 0.1,
  color: COLORS.separator,
};
const NO: BorderSpec = {
  type: "NONE",
  widthMm: 0.1,
  color: COLORS.black,
};

export function renderAnswerKey(
  questions: ExamQuestionData[],
  contentWidthHpu: number,
): BlockNode[] {
  if (!questions.length) return [];

  const cols = 5;
  const result: BlockNode[] = [];
  const cellW = Math.floor(contentWidthHpu / cols);

  result.push({
    kind: "tbl",
    colWidthsHpu: [contentWidthHpu],
    borders: { left: NO, right: NO, top: BOLD, bottom: NO },
    rows: [
      {
        heightHpu: 160,
        cells: [
          {
            widthHpu: contentWidthHpu,
            heightHpu: 160,
            vAlign: "CENTER",
            borders: { left: NO, right: NO, top: BOLD, bottom: NO },
            margins: { left: 0, right: 0, top: 0, bottom: 0 },
            blocks: [{ kind: "p", style: { spaceAfter: 0 }, runs: [] }],
          },
        ],
      },
    ],
  });

  // 제목
  result.push({
    kind: "p",
    style: {
      align: "CENTER",
      spaceBefore: 80,
      spaceAfter: 100,
      lineSpacingPct: 130,
    },
    runs: [
      txt("정 답 표", {
        size: 14,
        bold: true,
        color: COLORS.black,
      }),
    ],
  });

  const headerCells = Array.from({ length: cols }, () => ({
    widthHpu: cellW,
    heightHpu: 780,
    vAlign: "CENTER" as const,
    borders: {
      left: THIN,
      right: THIN,
      top: BOLD,
      bottom: BOLD,
      fillColor: COLORS.answerBg,
    },
    margins: { left: 60, right: 60, top: 60, bottom: 60 },
    blocks: [
      {
        kind: "p" as const,
        style: { align: "CENTER" as const, spaceAfter: 0 },
        runs: [
          txt("문항", { size: SIZE.answerLabel, bold: true, color: COLORS.darkGray }),
          txt(" / ", { size: SIZE.answerLabel, color: COLORS.darkGray }),
          txt("정답", { size: SIZE.answerLabel, bold: true, color: COLORS.darkGray }),
        ],
      },
    ],
  }));

  const totalRows = Math.ceil(questions.length / cols);
  const tableRows: TableRowNode[] = [{ heightHpu: 780, cells: headerCells }];
  for (let r = 0; r < totalRows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const idx = r + c * totalRows;
      const q = questions[idx];
      const num = q ? `${q.orderNum}. ` : "";
      const ans = q ? (q.question.correctAnswer || "").trim() : "";
      cells.push({
        widthHpu: cellW,
        heightHpu: 780,
        vAlign: "CENTER" as const,
        borders: {
          left: c === 0 ? THIN : LIGHT,
          right: c === cols - 1 ? THIN : LIGHT,
          top: NO,
          bottom: r === totalRows - 1 ? BOLD : LIGHT,
        },
        margins: { left: 60, right: 60, top: 60, bottom: 60 },
        blocks: [
          {
            kind: "p" as const,
            style: { align: "CENTER" as const, spaceAfter: 0 },
            runs: [
              txt(num, {
                size: SIZE.body,
                bold: true,
                color: COLORS.darkGray,
              }),
              txt(ans, {
                size: SIZE.body,
                bold: true,
                color: COLORS.black,
              }),
            ],
          },
        ],
      });
    }
    tableRows.push({ heightHpu: 780, cells });
  }

  result.push({
    kind: "tbl",
    colWidthsHpu: Array(cols).fill(cellW),
    borders: { left: THIN, right: THIN, top: BOLD, bottom: BOLD },
    rows: tableRows,
  });
  result.push({ kind: "p", style: { spaceAfter: 80 }, runs: [] });

  return result;
}
