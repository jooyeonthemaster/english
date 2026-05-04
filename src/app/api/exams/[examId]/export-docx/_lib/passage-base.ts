import {
  AlignmentType,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { COLOR, FONT, KR_FONT, PASSAGE_SIZE } from "./styles";
import { thinBox } from "./borders";
import { parseFormattedText } from "./parse-formatted-text";

// ---------------------------------------------------------------------------
// Base Components
// ---------------------------------------------------------------------------

export function passageTable(contentParagraphs: Paragraph[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: thinBox(COLOR.black, 4), // 0.5pt thick border
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 160, bottom: 160, left: 240, right: 240 },
            children: contentParagraphs,
          }),
        ],
      }),
    ],
  });
}

export function makePassageParagraphs(content: string, overrideFont?: string): Paragraph[] {
  if (!content) content = " ";
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length === 0) {
    return [new Paragraph({ children: [new TextRun({ text: " ", size: PASSAGE_SIZE })] })];
  }
  return lines.map(
    (line, i) =>
      new Paragraph({
        alignment: overrideFont === KR_FONT ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
        spacing: {
          after: i < lines.length - 1 ? 40 : 0,
          line: 312, // ~1.3x line height (very generous reading spacing like real exams)
        },
        children: parseFormattedText(line, {
          font: overrideFont || FONT,
          size: PASSAGE_SIZE,
        }),
      })
  );
}
