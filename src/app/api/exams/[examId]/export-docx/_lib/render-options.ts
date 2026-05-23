import {
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  optionDisplayTextForSubtype,
  optionOrdinalLabel,
} from "@/components/exams/paper-builder/option-display";
import { FONT, KR_FONT, PASSAGE_SIZE } from "./styles";
import { noBorders } from "./borders";
import { parseFormattedText } from "./parse-formatted-text";
import type { DocChild, ParsedOption } from "./types";

const koreanPattern = /[\uac00-\ud7a3]/;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export function renderOptions(
  options: ParsedOption[],
  subType?: string | null,
): DocChild[] {
  if (options.length === 0) return [];

  const result: DocChild[] = [];
  const displayTexts = options.map((option, index) =>
    optionDisplayTextForSubtype(subType, index, option.text || ""),
  );
  const maxLen = Math.max(...displayTexts.map((text) => text.length));

  if (maxLen < 25 && options.length === 5) {
    const rows: TableRow[] = [];
    for (let i = 0; i < options.length; i += 2) {
      const rowCells: TableCell[] = [];
      for (let j = 0; j < 2; j++) {
        const opt = options[i + j];
        const displayText = displayTexts[i + j];
        if (opt) {
          const f = koreanPattern.test(displayText) ? KR_FONT : FONT;
          rowCells.push(
            new TableCell({
              borders: noBorders(),
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  spacing: { line: 276 },
                  indent: { left: 400, hanging: 400 },
                  children: [
                    new TextRun({
                      text: `${optionOrdinalLabel(i + j)}   `,
                      font: KR_FONT,
                      size: PASSAGE_SIZE,
                    }),
                    ...parseFormattedText(displayText, {
                      font: f,
                      size: PASSAGE_SIZE,
                    }),
                  ],
                }),
              ],
            }),
          );
        } else {
          rowCells.push(
            new TableCell({
              borders: noBorders(),
              children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
            }),
          );
        }
      }
      rows.push(new TableRow({ children: rowCells }));
    }
    result.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noBorders(),
        rows,
        layout: TableLayoutType.FIXED,
      }),
    );
  } else {
    options.forEach((_, index) => {
      const displayText = displayTexts[index];
      const f = koreanPattern.test(displayText) ? KR_FONT : FONT;
      result.push(
        new Paragraph({
          spacing: { line: 276, after: 40 },
          indent: { left: 400, hanging: 400 },
          children: [
            new TextRun({
              text: `${optionOrdinalLabel(index)}   `,
              font: KR_FONT,
              size: PASSAGE_SIZE,
            }),
            ...parseFormattedText(displayText, { font: f, size: PASSAGE_SIZE }),
          ],
        }),
      );
    });
  }

  result.push(new Paragraph({ spacing: { after: 120 } }));
  return result;
}
