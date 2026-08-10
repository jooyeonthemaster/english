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
import {
  MULTI_BLANK_DISPLAY_SEPARATOR,
  multiBlankHeaderLabels,
  multiBlankOptionMatrix,
  optionDisplayLabel,
  optionDisplayTextForSubtype,
  shouldRenderOptionListForSubtype,
  type MultiBlankOptionMatrix,
} from "@/components/exams/paper-builder/option-display";
import { FONT, KR_FONT, PASSAGE_SIZE } from "./styles";
import { noBorders } from "./borders";
import { parseFormattedText } from "./parse-formatted-text";
import type { DocChild, ParsedOption } from "./types";

const koreanPattern = /[\uac00-\ud7a3]/;

// ---------------------------------------------------------------------------
// \ub2e4\uc911 \ube48\uce78(BLANK_INFERENCE) \uc870\ud569 \uc120\uc9c0 \u2014 (A)/(B)/(C) \uceec\ub7fc \ud5e4\ub354 \ubb34\ud14c\ub450\ub9ac \ud45c.
// HTML \uadf8\ub9ac\ub4dc(multi-blank-option-grid)\uc640 \uac19\uc740 \uc2e4\uc81c \uc218\ub2a5 \ud615\uc2dd: \ubaa9\ub85d \uc704 \ud55c \uc904\uc5d0
// \ud5e4\ub354\uac00 \uac01 \uac12 \uceec\ub7fc \uc704\uc5d0 \uc815\ub82c\ub418\uace0, \uac01 \ud589\uc740 [\ubc88\ud638][\uac121][\u2026\u2026][\uac122][\u2026] \uac12\ub9cc \ud45c\uc2dc.
// ---------------------------------------------------------------------------

export function buildMultiBlankOptionsTable(
  matrix: MultiBlankOptionMatrix<ParsedOption>,
  opts: { size: number; bold?: boolean; italics?: boolean },
): Table {
  const { blankCount, rows } = matrix;
  const { size, bold, italics } = opts;
  const NUM_PCT = 8;
  const SEP_PCT = 6;
  const valuePct = Math.floor(
    (100 - NUM_PCT - SEP_PCT * (blankCount - 1)) / blankCount,
  );

  const cell = (children: Paragraph[], pct: number) =>
    new TableCell({
      borders: noBorders(),
      width: { size: pct, type: WidthType.PERCENTAGE },
      children,
    });
  const plainPara = (
    text: string,
    o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean } = {},
  ) =>
    new Paragraph({
      spacing: { line: 276 },
      alignment: o.align,
      children: [
        new TextRun({
          text,
          font: koreanPattern.test(text) ? KR_FONT : FONT,
          size,
          bold: o.bold,
        }),
      ],
    });

  const headerCells: TableCell[] = [cell([plainPara("")], NUM_PCT)];
  multiBlankHeaderLabels(blankCount).forEach((label, c) => {
    if (c > 0) headerCells.push(cell([plainPara("")], SEP_PCT));
    headerCells.push(
      cell([plainPara(label, { align: AlignmentType.CENTER, bold: true })], valuePct),
    );
  });

  const bodyRows = rows.map(({ option, values }, index) => {
    const cells: TableCell[] = [
      cell(
        [plainPara(optionDisplayLabel("BLANK_INFERENCE", index, option.label))],
        NUM_PCT,
      ),
    ];
    values.forEach((value, c) => {
      if (c > 0) {
        cells.push(
          cell(
            [plainPara(MULTI_BLANK_DISPLAY_SEPARATOR, { align: AlignmentType.CENTER })],
            SEP_PCT,
          ),
        );
      }
      cells.push(
        cell(
          [
            new Paragraph({
              spacing: { line: 276 },
              children: parseFormattedText(value, {
                font: koreanPattern.test(value) ? KR_FONT : FONT,
                size,
                bold,
                italics,
              }),
            }),
          ],
          valuePct,
        ),
      );
    });
    return new TableRow({ children: cells });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders(),
    rows: [new TableRow({ children: headerCells }), ...bodyRows],
    layout: TableLayoutType.FIXED,
  });
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export function renderOptions(
  options: ParsedOption[],
  subType?: string | null,
): DocChild[] {
  if (!shouldRenderOptionListForSubtype(subType)) return [];
  if (options.length === 0) return [];

  const result: DocChild[] = [];

  // 다중 빈칸(BLANK_INFERENCE) 조합 선지 — (A)/(B) 컬럼 헤더 표(정확 정렬)
  const multiBlank =
    subType === "BLANK_INFERENCE" ? multiBlankOptionMatrix(options) : null;
  if (multiBlank) {
    result.push(buildMultiBlankOptionsTable(multiBlank, { size: PASSAGE_SIZE }));
    result.push(new Paragraph({ spacing: { after: 120 } }));
    return result;
  }

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
                      text: `${optionDisplayLabel(subType, i + j, opt.label)}   `,
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
    options.forEach((option, index) => {
      const displayText = displayTexts[index];
      const f = koreanPattern.test(displayText) ? KR_FONT : FONT;
      result.push(
        new Paragraph({
          spacing: { line: 276, after: 40 },
          indent: { left: 400, hanging: 400 },
          children: [
            new TextRun({
              text: `${optionDisplayLabel(subType, index, option.label)}   `,
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
