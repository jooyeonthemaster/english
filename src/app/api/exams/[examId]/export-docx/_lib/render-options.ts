import {
  AlignmentType,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
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
import {
  LEGACY_DEFAULT_COLUMN_WIDTH_DXA,
  gridCellWidth,
  gridTable,
  tableGrid,
} from "./table-geometry";
import type { DocChild, ParsedOption } from "./types";
import { docxKeep, type DocxKeepFlags } from "./keep-policy";

const koreanPattern = /[\uac00-\ud7a3]/;

// 선지 묶음(keep-together) — 역할 「option」(keep-policy.ts 대응표). ①~⑤(및 다중 빈칸 표의 행)가
// 단·쪽 경계에서 갈리지 않게 한다: 묶음 마지막을 뺀 모두 keepNext, 모두 keepLines, 표 행은 cantSplit.
// 한 단보다 긴 묶음은 엔진이 스스로 예외로 쪼갠다. 본문·지문 문단에는 걸지 않는다(HW-1 — 큰 공백·사슬 포기).
// 마지막 요소는 keepNext 를 아예 빼서 <w:keepNext w:val="false"/> 를 남기지 않는다.
export function optionKeep(isLastInBundle: boolean): DocxKeepFlags {
  return docxKeep("option", { hasNext: !isLastInBundle });
}

// ---------------------------------------------------------------------------
// 다중 빈칸(BLANK_INFERENCE) 조합 선지 — (A)/(B)/(C) 컬럼 헤더 무테두리 표.
// HTML 그리드(multi-blank-option-grid)와 같은 실제 수능 형식: 목록 위 한 줄에
// 헤더가 각 값 컬럼 위에 정렬되고, 각 행은 [번호][값1][……][값2][…] 값만 표시.
// ---------------------------------------------------------------------------

export function buildMultiBlankOptionsTable(
  matrix: MultiBlankOptionMatrix<ParsedOption>,
  opts: {
    size: number;
    bold?: boolean;
    italics?: boolean;
    /** 표가 들어갈 단(또는 셀 안쪽) 폭(DXA) — 열 그리드를 이 폭에서 나눈다. */
    widthDxa: number;
    /** 표 뒤에 같은 묶음(추가 선지 칸 등)이 이어지면 마지막 행도 keepNext. */
    keepWithNext?: boolean;
  },
): Table {
  const { blankCount, rows } = matrix;
  const { size, bold, italics, widthDxa, keepWithNext = false } = opts;
  const NUM_PCT = 8;
  const SEP_PCT = 6;
  const valuePct = Math.floor(
    (100 - NUM_PCT - SEP_PCT * (blankCount - 1)) / blankCount,
  );
  // 열 순서: [번호][값1]([구분][값k])… — 비율 그대로 단 폭에 맞춘 DXA 그리드.
  const weights = [NUM_PCT];
  for (let c = 0; c < blankCount; c += 1) {
    if (c > 0) weights.push(SEP_PCT);
    weights.push(valuePct);
  }
  const grid = tableGrid(widthDxa, weights);
  // 헤더 + 선지 행 전체가 한 묶음: 마지막 선지 행을 뺀 모든 행의 문단이 keepNext.
  const lastRowIndex = keepWithNext ? -1 : rows.length; // 0 = 헤더, 1..n = 선지

  const cell = (children: Paragraph[], col: number) =>
    new TableCell({
      borders: noBorders(),
      width: gridCellWidth(grid, col),
      children,
    });
  const plainPara = (
    text: string,
    rowIndex: number,
    o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean } = {},
  ) =>
    new Paragraph({
      spacing: { line: 276 },
      alignment: o.align,
      ...optionKeep(rowIndex === lastRowIndex),
      children: [
        new TextRun({
          text,
          font: koreanPattern.test(text) ? KR_FONT : FONT,
          size,
          bold: o.bold,
        }),
      ],
    });

  let col = 0;
  const headerCells: TableCell[] = [cell([plainPara("", 0)], col++)];
  multiBlankHeaderLabels(blankCount).forEach((label, c) => {
    if (c > 0) headerCells.push(cell([plainPara("", 0)], col++));
    headerCells.push(
      cell([plainPara(label, 0, { align: AlignmentType.CENTER, bold: true })], col++),
    );
  });

  const bodyRows = rows.map(({ option, values }, index) => {
    const rowIndex = index + 1;
    let bc = 0;
    const cells: TableCell[] = [
      cell(
        [plainPara(optionDisplayLabel("BLANK_INFERENCE", index, option.label), rowIndex)],
        bc++,
      ),
    ];
    values.forEach((value, c) => {
      if (c > 0) {
        cells.push(
          cell(
            [plainPara(MULTI_BLANK_DISPLAY_SEPARATOR, rowIndex, { align: AlignmentType.CENTER })],
            bc++,
          ),
        );
      }
      cells.push(
        cell(
          [
            new Paragraph({
              spacing: { line: 276 },
              ...optionKeep(rowIndex === lastRowIndex),
              children: parseFormattedText(value, {
                font: koreanPattern.test(value) ? KR_FONT : FONT,
                size,
                bold,
                italics,
              }),
            }),
          ],
          bc++,
        ),
      );
    });
    return new TableRow({ cantSplit: true, children: cells });
  });

  return gridTable(grid, {
    borders: noBorders(),
    rows: [new TableRow({ cantSplit: true, children: headerCells }), ...bodyRows],
  });
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export function renderOptions(
  options: ParsedOption[],
  subType?: string | null,
  /** 선지가 들어갈 단 폭(DXA) — 2열 짧은 선지 표·다중 빈칸 표의 그릇 폭. */
  contentWidthDxa: number = LEGACY_DEFAULT_COLUMN_WIDTH_DXA,
): DocChild[] {
  if (!shouldRenderOptionListForSubtype(subType)) return [];
  if (options.length === 0) return [];

  const result: DocChild[] = [];

  // 다중 빈칸(BLANK_INFERENCE) 조합 선지 — (A)/(B) 컬럼 헤더 표(정확 정렬)
  const multiBlank =
    subType === "BLANK_INFERENCE" ? multiBlankOptionMatrix(options) : null;
  if (multiBlank) {
    result.push(
      buildMultiBlankOptionsTable(multiBlank, { size: PASSAGE_SIZE, widthDxa: contentWidthDxa }),
    );
    result.push(new Paragraph({ spacing: { after: 120 } }));
    return result;
  }

  const displayTexts = options.map((option, index) =>
    optionDisplayTextForSubtype(subType, index, option.text || ""),
  );
  const maxLen = Math.max(...displayTexts.map((text) => text.length));

  if (maxLen < 25 && options.length === 5) {
    const grid = tableGrid(contentWidthDxa, [1, 1]);
    const rows: TableRow[] = [];
    const lastRowStart = options.length - 1 - ((options.length - 1) % 2);
    for (let i = 0; i < options.length; i += 2) {
      const rowCells: TableCell[] = [];
      const keep = optionKeep(i === lastRowStart);
      for (let j = 0; j < 2; j++) {
        const opt = options[i + j];
        const displayText = displayTexts[i + j];
        if (opt) {
          const f = koreanPattern.test(displayText) ? KR_FONT : FONT;
          rowCells.push(
            new TableCell({
              borders: noBorders(),
              width: gridCellWidth(grid, j),
              children: [
                new Paragraph({
                  spacing: { line: 276 },
                  indent: { left: 400, hanging: 400 },
                  ...keep,
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
              width: gridCellWidth(grid, j),
              children: [new Paragraph({ ...keep, children: [new TextRun({ text: " " })] })],
            }),
          );
        }
      }
      rows.push(new TableRow({ cantSplit: true, children: rowCells }));
    }
    result.push(
      gridTable(grid, {
        borders: noBorders(),
        rows,
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
          ...optionKeep(index === options.length - 1),
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
