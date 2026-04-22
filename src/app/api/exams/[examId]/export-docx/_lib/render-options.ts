import {
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { FONT, KR_FONT, PASSAGE_SIZE } from "./styles";
import { noBorders } from "./borders";
import { parseFormattedText } from "./parse-formatted-text";
import type { DocChild, ParsedOption } from "./types";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export function renderOptions(options: ParsedOption[]): DocChild[] {
  if (options.length === 0) return [];

  const result: DocChild[] = [];
  const maxLen = Math.max(...options.map((o) => o.text.length));

  const toCircle = (lb: string) => {
    const m: Record<string, string> = { "1": "①", "2": "②", "3": "③", "4": "④", "5": "⑤" };
    return m[lb] || lb;
  };

  if (maxLen < 25 && options.length === 5) {
    // Elegant 2-column layout for short/medium options
    const rows: TableRow[] = [];
    for (let i = 0; i < options.length; i += 2) {
      const rowCells: TableCell[] = [];
      for (let j = 0; j < 2; j++) {
        const opt = options[i + j];
        if (opt) {
          const f = /[가-힣]/.test(opt.text) ? KR_FONT : FONT;
          const circleLabel = toCircle(opt.label);
          rowCells.push(
            new TableCell({
              borders: noBorders(),
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  spacing: { line: 276 },
                  indent: { left: 400, hanging: 400 },
                  children: [
                    new TextRun({ text: `${circleLabel}   `, font: KR_FONT, size: PASSAGE_SIZE }),
                    ...parseFormattedText(opt.text, { font: f, size: PASSAGE_SIZE }),
                  ]
                })
              ]
            })
          );
        } else {
           rowCells.push(new TableCell({ borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: " " })] })] }));
        }
      }
      rows.push(new TableRow({ children: rowCells }));
    }
    result.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders(),
      rows,
      layout: TableLayoutType.FIXED
    }));
  } else {
    // 1 Column for long options
    for (const opt of options) {
      const f = /[가-힣]/.test(opt.text) ? KR_FONT : FONT;
      const circleLabel = toCircle(opt.label);
      result.push(
        new Paragraph({
          spacing: { line: 276, after: 40 },
          indent: { left: 400, hanging: 400 },
          children: [
            new TextRun({
              text: `${circleLabel}   `,
              font: KR_FONT,
              size: PASSAGE_SIZE,
            }),
            ...parseFormattedText(opt.text, { font: f, size: PASSAGE_SIZE }),
          ],
        })
      );
    }
  }

  result.push(new Paragraph({ spacing: { after: 120 } }));
  return result;
}
