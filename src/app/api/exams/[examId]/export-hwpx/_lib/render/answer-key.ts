/**
 * 정답표 — 시험지 마지막에 붙는 표(번호/정답 그리드).
 */

import type { BlockNode, BorderSpec } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";

const THIN: BorderSpec = {
  type: "SOLID",
  widthMm: 0.15,
  color: COLORS.darkGray,
};

export function renderAnswerKey(
  questions: ExamQuestionData[],
  contentWidthHpu: number,
): BlockNode[] {
  if (!questions.length) return [];

  const cols = 10;
  const rows: BlockNode[] = [];

  const result: BlockNode[] = [];

  // 제목
  result.push({
    kind: "p",
    style: {
      align: "LEFT",
      spaceBefore: 200,
      spaceAfter: 80,
      lineSpacingPct: 130,
    },
    runs: [
      txt("정답", {
        size: SIZE.title - 4,
        bold: true,
        color: COLORS.black,
      }),
    ],
  });

  // 표 데이터 그룹화 (10열씩)
  const totalRows = Math.ceil(questions.length / cols);
  const tableRows = [];
  for (let r = 0; r < totalRows; r++) {
    // number row
    const numCells = [];
    const ansCells = [];
    const cellW = Math.floor(contentWidthHpu / cols);

    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const q = questions[idx];
      const num = q ? String(q.orderNum) : "";
      const ans = q ? (q.question.correctAnswer || "").trim() : "";
      numCells.push({
        widthHpu: cellW,
        heightHpu: 600,
        vAlign: "CENTER" as const,
        borders: { left: THIN, right: THIN, top: THIN, bottom: THIN, fillColor: "#F0F0F0" },
        margins: { left: 40, right: 40, top: 40, bottom: 40 },
        blocks: [
          {
            kind: "p" as const,
            style: { align: "CENTER" as const, spaceAfter: 0 },
            runs: [
              txt(num, {
                size: SIZE.body - 1,
                bold: true,
                color: COLORS.darkGray,
              }),
            ],
          },
        ],
      });
      ansCells.push({
        widthHpu: cellW,
        heightHpu: 700,
        vAlign: "CENTER" as const,
        borders: { left: THIN, right: THIN, top: THIN, bottom: THIN },
        margins: { left: 40, right: 40, top: 40, bottom: 40 },
        blocks: [
          {
            kind: "p" as const,
            style: { align: "CENTER" as const, spaceAfter: 0 },
            runs: [
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
    tableRows.push({ heightHpu: 600, cells: numCells });
    tableRows.push({ heightHpu: 700, cells: ansCells });
  }

  result.push({
    kind: "tbl",
    colWidthsHpu: Array(cols).fill(Math.floor(contentWidthHpu / cols)),
    borders: { left: THIN, right: THIN, top: THIN, bottom: THIN },
    rows: tableRows,
  });
  result.push({ kind: "p", style: { spaceAfter: 80 }, runs: [] });

  void rows;
  return result;
}
