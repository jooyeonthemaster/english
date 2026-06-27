/**
 * 정답표 — 시험지 마지막에 붙는 표(번호/정답 그리드).
 */

import type { BlockNode, BorderSpec, TableRowNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
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
  opts?: { pageBreak?: boolean },
): BlockNode[] {
  if (!questions.length) return [];

  const cols = 5;
  const result: BlockNode[] = [];
  const cellW = Math.floor(contentWidthHpu / cols);

  // 상단 굵은 구분선. pageBreak 가 켜지면 이 첫 블록에서 새 페이지로 넘어간다(정답표는
  // 항상 새 페이지에서 시작). 2단 섹션 흐름에선 새 페이지 왼쪽 칸부터 채워진다.
  result.push({
    kind: "tbl",
    pageBreak: opts?.pageBreak ?? false,
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

  // 제목 "정 답 표" (DOCX 28 half-pt = 14pt)
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

  // 서술형 등 긴 정답이 섞이면 5열 그리드가 한 단어씩 세로로 터진다.
  // DOCX 와 동일하게 가장 긴 정답이 20자를 넘으면 전체폭 번호 목록으로 렌더한다.
  const maxAnswerLen = questions.reduce(
    (max, eq) => Math.max(max, answerTextForQuestion(eq).length),
    0,
  );
  if (maxAnswerLen > 20) {
    for (const eq of questions) {
      result.push({
        kind: "p",
        style: {
          leftMargin: 2100, // DOCX indent left 420 dxa × 5
          indentFirst: -2100, // hanging 420 dxa × 5
          spaceBefore: 30,
          spaceAfter: 30,
          lineSpacingPct: 150,
        },
        runs: [
          txt(`${eq.orderNum}. `, { size: SIZE.answerValue, bold: true, color: COLORS.darkGray }),
          txt(answerTextForQuestion(eq) || " ", {
            size: SIZE.answerValue,
            color: COLORS.black,
          }),
        ],
      });
    }
    result.push({ kind: "p", style: { spaceAfter: 80 }, runs: [] });
    return result;
  }

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
          txt("문항", { size: 10, bold: true, color: COLORS.darkGray }),
          txt(" / ", { size: 10, color: COLORS.darkGray }),
          txt("정답", { size: 10, bold: true, color: COLORS.darkGray }),
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
      const ans = q ? answerTextForQuestion(q) : "";
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
                size: SIZE.answerValue,
                bold: true,
                color: COLORS.darkGray,
              }),
              txt(ans, {
                size: SIZE.answerValue,
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

function answerTextForQuestion(eq: ExamQuestionData): string {
  return formatStoredQuestionCorrectAnswer(eq.question);
}
