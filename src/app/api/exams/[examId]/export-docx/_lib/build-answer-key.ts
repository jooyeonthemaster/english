import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { COLOR, FONT, KR_FONT, LABEL_SIZE, PASSAGE_SIZE } from "./styles";
import { bdr, hrule, NONE } from "./borders";
import type { DocChild, ExamQuestionData } from "./types";

// ---------------------------------------------------------------------------
// Answer Key Table (for student prints)
// ---------------------------------------------------------------------------

export function buildAnswerKeyTable(questions: ExamQuestionData[]): DocChild[] {
  const result: DocChild[] = [];

  result.push(hrule(COLOR.darkGray, 12, 300, 200));

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

  const COLS = 5;
  const totalRows = Math.ceil(questions.length / COLS);
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
        width: { size: 20, type: WidthType.PERCENTAGE },
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
      const eq = questions[qIdx];

      const cellChildren: Paragraph[] = [];
      if (eq) {
        cellChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40, after: 40 },
            children: [
              new TextRun({ text: `${eq.orderNum}. `, font: KR_FONT, size: PASSAGE_SIZE, bold: true }),
              new TextRun({ text: eq.question.correctAnswer, font: FONT, size: PASSAGE_SIZE, bold: true, color: COLOR.black }),
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
          width: { size: 20, type: WidthType.PERCENTAGE },
          children: cellChildren,
        })
      );
    }
    dataRows.push(new TableRow({ children: cells }));
  }

  result.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [new TableRow({ children: headerCells }), ...dataRows],
    })
  );

  return result;
}
