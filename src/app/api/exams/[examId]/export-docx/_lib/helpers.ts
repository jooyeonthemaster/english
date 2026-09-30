import {
  Paragraph,
  TableCell,
  TableRow,
  TextRun,
} from "docx";
import { COLOR, KR_FONT, PASSAGE_SIZE } from "./styles";
import { thinBox } from "./borders";
import { LEGACY_DEFAULT_COLUMN_WIDTH_DXA, gridCellWidth, gridTable, tableGrid } from "./table-geometry";
import type { DocChild } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function safeParseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str === "object" && str !== null) return str as T;
  if (typeof str !== "string") return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

export function renderWritingSpace(
  isLong: boolean,
  contentWidthDxa: number = LEGACY_DEFAULT_COLUMN_WIDTH_DXA,
): DocChild[] {
  const result: DocChild[] = [];
  if (isLong) {
    const grid = tableGrid(contentWidthDxa, [1]);
    result.push(
      gridTable(grid, {
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: thinBox(COLOR.separator, 8), // slightly thicker soft border for writing
                margins: { top: 800, bottom: 800, left: 160, right: 160 }, // Huge padding for writing
                width: gridCellWidth(grid, 0),
                children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
              }),
            ],
          }),
        ],
      })
    );
  } else {
    result.push(
      new Paragraph({
        spacing: { before: 80, after: 120 },
        children: [
          new TextRun({
            text: "정답: ____________________________________________________________________________",
            font: KR_FONT,
            size: PASSAGE_SIZE,
            color: COLOR.gray,
          }),
        ],
      })
    );
  }
  result.push(new Paragraph({ spacing: { after: 120 } }));
  return result;
}
