import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  TableCell,
  TableRow,
  TextRun,
} from "docx";
import { COLOR, FONT, KR_FONT, LABEL_SIZE, PASSAGE_SIZE } from "./styles";
import { bdr, hrule, NONE } from "./borders";
import { BUILDER_DEFAULT_BODY_COLUMN_WIDTH_DXA } from "./build-builder-document/page-geometry";
import { gridCellWidth, gridTable, tableGrid } from "./table-geometry";
import {
  circledObjectiveAnswer,
  type AnswerEntry,
} from "@/components/exams/paper-builder/answer-key-entries";
import { parseOptions } from "@/components/exams/paper-builder/paper-item-model";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import type { DocChild, ExamQuestionData } from "./types";

// ---------------------------------------------------------------------------
// Answer Key Table (for student prints)
//
// 항목(번호·정답 표기)은 공용 정본 answer-key-entries 가 만든다 — 편집 정답 우선 +
// formatStoredQuestionCorrectAnswer + 객관식 숫자 정답 ①~ 통일(웹 정답표와 같은 표기).
// 빌더 조립(assemble.ts)은 answerKeyEntries(paperItems) 를 buildAnswerKeyTableFromEntries 로 넘긴다.
// ---------------------------------------------------------------------------

export type AnswerKeyTableOptions = {
  pageBreakBefore?: boolean;
  /**
   * 정답표가 들어갈 단 폭(DXA) — 빌더는 builderPageGeometry(layout).bodyColumnWidthDxa,
   * 레거시는 legacyDocGeometry().columnWidthDxa. 넘기면 표·셀 폭을 모두 DXA 로 고정한다.
   * 생략하면 "fill" — tblW 만 100%, tblGrid·셀 폭(tcW)은 빌더 기본(A4·2단) 단 폭의 DXA.
   */
  containerWidthDxa?: number;
};

/**
 * ExamQuestionData(레거시 렌더러 build-document.ts — 관리자 시험지 만들기 라우트가 아직 쓴다) →
 * 정답표 항목. 표기 규칙은 공용 circledObjectiveAnswer(선지 개수 안의 숫자 정답만 ①~)와 같다.
 */
export function answerKeyEntriesFromExamQuestions(questions: readonly ExamQuestionData[]): AnswerEntry[] {
  return questions.map((eq) => ({
    orderNum: eq.orderNum,
    answer: circledObjectiveAnswer(
      { options: parseOptions(eq.question.options), objectiveAnswerSlots: 0 },
      formatStoredQuestionCorrectAnswer(eq.question),
    ),
  }));
}

/** 레거시 진입점 — 항목을 공용 표기로 만든 뒤 buildAnswerKeyTableFromEntries 로 그린다. */
export function buildAnswerKeyTable(
  questions: ExamQuestionData[],
  opts?: AnswerKeyTableOptions,
): DocChild[] {
  return buildAnswerKeyTableFromEntries(answerKeyEntriesFromExamQuestions(questions), opts);
}

export function buildAnswerKeyTableFromEntries(
  entries: readonly AnswerEntry[],
  opts?: AnswerKeyTableOptions,
): DocChild[] {
  const result: DocChild[] = [];

  // 정답표는 항상 새 페이지에서 시작(pageBreakBefore) — 첫 구분선 단락에 적용.
  result.push(hrule(COLOR.darkGray, 12, 300, 200, opts?.pageBreakBefore ?? false));

  result.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "정 답 표",
          font: KR_FONT,
          size: 28, // 14pt
          bold: true,
        }),
      ],
    })
  );

  // 서술형 등 긴 정답이 섞이면 5열 그리드가 한 단어씩 세로로 터진다.
  // 가장 긴 정답이 임계값을 넘으면 전체 폭 번호 목록으로 렌더한다.
  const maxAnswerLen = entries.reduce(
    (max, entry) => Math.max(max, entry.answer.length),
    0,
  );
  if (maxAnswerLen > 20) {
    for (const entry of entries) {
      result.push(
        new Paragraph({
          spacing: { before: 30, after: 30 },
          indent: { left: 420, hanging: 420 },
          children: [
            new TextRun({ text: `${entry.orderNum}. `, font: KR_FONT, size: PASSAGE_SIZE, bold: true }),
            new TextRun({
              text: entry.answer || " ",
              font: FONT,
              size: PASSAGE_SIZE,
              color: COLOR.black,
            }),
          ],
        }),
      );
    }
    return result;
  }

  const COLS = 5;
  const totalRows = Math.ceil(entries.length / COLS);
  const grid =
    opts?.containerWidthDxa != null
      ? tableGrid(opts.containerWidthDxa, Array(COLS).fill(1))
      : tableGrid(BUILDER_DEFAULT_BODY_COLUMN_WIDTH_DXA, Array(COLS).fill(1), "fill");
  const headerBorder = bdr(BorderStyle.SINGLE, 8, COLOR.darkGray);
  const thinBorder = bdr(BorderStyle.SINGLE, 4, COLOR.separator);

  const headerCells: TableCell[] = [];
  for (let col = 0; col < COLS; col++) {
    headerCells.push(
      new TableCell({
        borders: {
          top: headerBorder, bottom: headerBorder,
          left: col === 0 ? headerBorder : thinBorder,
          right: col === COLS - 1 ? headerBorder : thinBorder,
        },
        shading: { fill: "F5F5F5" },
        width: gridCellWidth(grid, col),
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40, after: 40 },
            children: [
              new TextRun({ text: "문항", font: KR_FONT, size: LABEL_SIZE, bold: true }),
              new TextRun({ text: " / ", font: KR_FONT, size: LABEL_SIZE }),
              new TextRun({ text: "정답", font: KR_FONT, size: LABEL_SIZE, bold: true }),
            ],
          }),
        ],
      })
    );
  }

  const dataRows: TableRow[] = [];
  for (let row = 0; row < totalRows; row++) {
    const cells: TableCell[] = [];
    for (let col = 0; col < COLS; col++) {
      const qIdx = row + col * totalRows;
      const entry = entries[qIdx];

      const cellChildren: Paragraph[] = [];
      if (entry) {
        cellChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40, after: 40 },
            children: [
              new TextRun({ text: `${entry.orderNum}. `, font: KR_FONT, size: PASSAGE_SIZE, bold: true }),
              new TextRun({ text: entry.answer, font: FONT, size: PASSAGE_SIZE, bold: true, color: COLOR.black }),
            ],
          })
        );
      } else {
        cellChildren.push(new Paragraph({ children: [new TextRun({ text: " " })] }));
      }

      cells.push(
        new TableCell({
          borders: {
            top: NONE,
            bottom: row === totalRows - 1 ? bdr(BorderStyle.SINGLE, 8, COLOR.darkGray) : thinBorder,
            left: col === 0 ? headerBorder : thinBorder,
            right: col === COLS - 1 ? headerBorder : thinBorder,
          },
          width: gridCellWidth(grid, col),
          children: cellChildren,
        })
      );
    }
    dataRows.push(new TableRow({ children: cells }));
  }

  result.push(
    gridTable(grid, {
      rows: [new TableRow({ children: headerCells }), ...dataRows],
    })
  );

  return result;
}
