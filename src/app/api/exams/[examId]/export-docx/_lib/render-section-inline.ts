import { AlignmentType, Paragraph, TextRun } from "docx";
import { COLOR, FONT, KR_FONT, PASSAGE_SIZE, QUESTION_NUM_SIZE, QUESTION_SIZE, SMALL_SIZE } from "./styles";
import { parseFormattedText } from "./parse-formatted-text";
import type { DocChild, ParsedSection } from "./types";

// ---------------------------------------------------------------------------
// Section renderers — inline paragraph variants
// ---------------------------------------------------------------------------

export function renderDirection(
  section: ParsedSection,
  orderNum: number,
  points: number
): DocChild[] {
  const children: TextRun[] = [
    new TextRun({
      text: `${orderNum}. `,
      font: KR_FONT,
      size: QUESTION_NUM_SIZE,
      bold: true,
    }),
    ...parseFormattedText(section.content, {
      font: KR_FONT,
      size: QUESTION_SIZE,
      bold: false,
    }),
  ];

  if (points > 0) {
    children.push(
      new TextRun({
        text: ` [${points}점]`,
        font: KR_FONT,
        size: SMALL_SIZE,
        bold: false,
      })
    );
  }

  return [
    new Paragraph({
      spacing: { before: 240, after: 120 },
      children,
    }),
  ];
}

export function renderScrambled(section: ParsedSection): DocChild[] {
  const words = section.items || [];
  return [
    new Paragraph({
      spacing: { before: 40, after: 120 },
      indent: { left: 300, hanging: 300 },
      children: [
        new TextRun({
          text: `<${section.label}> `,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
        ...parseFormattedText(words.join(" / "), { font: FONT, size: PASSAGE_SIZE }),
      ],
    }),
  ];
}

export function renderTarget(section: ParsedSection): DocChild[] {
  return [
    new Paragraph({
      spacing: { before: 40, after: 120 },
      indent: { left: 300, hanging: 300 },
      children: [
        new TextRun({
          text: `<${section.label}> `,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
        ...parseFormattedText(section.content, { font: FONT, size: PASSAGE_SIZE, bold: true }),
      ],
    }),
  ];
}

export function renderContext(section: ParsedSection): DocChild[] {
  return [
    new Paragraph({
      spacing: { before: 40, after: 120 },
      indent: { left: 300, hanging: 300 },
      children: [
        new TextRun({
          text: `<${section.label}> `,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
        ...parseFormattedText(section.content, {
          font: FONT,
          size: PASSAGE_SIZE,
          italics: true,
        }),
      ],
    }),
  ];
}

export function renderParagraphs(section: ParsedSection): DocChild[] {
  const lines = section.items || [];
  const result: DocChild[] = [];

  for (const line of lines) {
    const labelMatch = line.match(/^\(([A-e])\)\s*(.+)$/i);
    if (labelMatch) {
      result.push(
        new Paragraph({
          spacing: { before: 80, after: 0, line: 312 },
          indent: { left: 400, hanging: 400 }, // deep indent wrapper
          alignment: AlignmentType.JUSTIFIED,
          children: [
            new TextRun({
              text: `(${labelMatch[1]}) `,
              font: FONT,
              size: PASSAGE_SIZE,
              bold: true,
            }),
            ...parseFormattedText(labelMatch[2], {
              font: FONT,
              size: PASSAGE_SIZE,
            }),
          ],
        })
      );
    } else {
      result.push(
        new Paragraph({
          spacing: { before: 40, after: 0, line: 312 },
          indent: { left: 400 },
          alignment: AlignmentType.JUSTIFIED,
          children: parseFormattedText(line, {
            font: FONT,
            size: PASSAGE_SIZE,
          }),
        })
      );
    }
  }

  result.push(new Paragraph({ spacing: { after: 120 } }));
  return result;
}

export function renderBlanks(section: ParsedSection): DocChild[] {
  return [
    new Paragraph({
      spacing: { before: 40, after: 120 },
      indent: { left: 200, hanging: 200 },
      children: [
        new TextRun({
          text: `<${section.label}> `,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
        ...parseFormattedText(section.content, {
          font: FONT,
          size: PASSAGE_SIZE,
        }),
      ],
    }),
  ];
}

export function renderHint(section: ParsedSection): DocChild[] {
  return [
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({
          text: `※ 힌트: `,
          font: KR_FONT,
          size: SMALL_SIZE,
          color: COLOR.gray,
          bold: true,
        }),
        ...parseFormattedText(section.content, {
          font: KR_FONT,
          size: SMALL_SIZE,
          color: COLOR.gray,
        }),
      ],
    }),
  ];
}

export function renderMatchType(section: ParsedSection): DocChild[] {
  return [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 0, after: 20 },
      children: [
        new TextRun({
          text: `[유형: ${section.content}]`,
          font: KR_FONT,
          size: 16,
          color: COLOR.lightGray,
        }),
      ],
    }),
  ];
}
