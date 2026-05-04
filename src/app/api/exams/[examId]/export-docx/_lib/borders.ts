import {
  BorderStyle,
  IBorderOptions,
  ITableCellBorders,
  Paragraph,
  TextRun,
} from "docx";
import { COLOR } from "./styles";

// ---------------------------------------------------------------------------
// Border helpers
// ---------------------------------------------------------------------------

export function bdr(
  style: (typeof BorderStyle)[keyof typeof BorderStyle],
  size: number,
  color: string
): IBorderOptions {
  return { style, size, color };
}

export const NONE: IBorderOptions = {
  style: BorderStyle.NONE,
  size: 0,
  color: "FFFFFF",
};

export function noBorders(): ITableCellBorders {
  return { top: NONE, bottom: NONE, left: NONE, right: NONE };
}

/** Thin box border (0.5pt = size 4) */
export function thinBox(color: string, size = 4): ITableCellBorders {
  const b = bdr(BorderStyle.SINGLE, size, color);
  return { top: b, bottom: b, left: b, right: b };
}

/** Horizontal rule paragraph */
export function hrule(
  color: string = COLOR.separator,
  size = 4,
  spaceBefore = 80,
  spaceAfter = 80
): Paragraph {
  return new Paragraph({
    spacing: { before: spaceBefore, after: spaceAfter },
    border: {
      bottom: bdr(BorderStyle.SINGLE, size, color),
      top: NONE,
      left: NONE,
      right: NONE,
    },
    children: [new TextRun({ text: " " })],
  });
}
