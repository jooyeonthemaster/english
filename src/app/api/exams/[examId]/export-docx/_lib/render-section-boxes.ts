import {
  Paragraph,
  TextRun,
} from "docx";
import { KR_FONT, PASSAGE_SIZE } from "./styles";
import { makePassageParagraphs } from "./passage-base";
import { parseFormattedText } from "./parse-formatted-text";
import type { DocChild, ParsedSection } from "./types";

// ---------------------------------------------------------------------------
// Section renderers — box/table variants
// ---------------------------------------------------------------------------

export function renderPassage(content: string): DocChild[] {
  return [
    ...makePassageParagraphs(content),
    new Paragraph({ spacing: { after: 120 } })
  ];
}

export function renderMarkerSection(section: ParsedSection): DocChild[] {
  const result: DocChild[] = [];

  if (section.label) {
    result.push(
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({
            text: `<${section.label}>`,
            font: KR_FONT,
            size: PASSAGE_SIZE,
            bold: true,
          }),
        ],
      })
    );
  }

  const isKorean = section.label === "영작할 우리말";

  result.push(...makePassageParagraphs(section.content, isKorean));

  result.push(new Paragraph({ spacing: { after: 120 } }));
  return result;
}

export function renderConditions(section: ParsedSection): DocChild[] {
  const result: DocChild[] = [];
  const items = section.items || [];

  result.push(
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [
        new TextRun({
          text: `<${section.label}>`,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
      ],
    })
  );

  for (let i = 0; i < items.length; i++) {
    result.push(
      new Paragraph({
        spacing: { after: 40, line: 312 },
        indent: { left: 400, hanging: 200 }, // lines up text neatly after number
        children: [
          new TextRun({
            text: `${i + 1}. `,
            font: KR_FONT,
            size: PASSAGE_SIZE,
          }),
          ...parseFormattedText(items[i], {
            font: KR_FONT,
            size: PASSAGE_SIZE,
          }),
        ],
      })
    );
  }

  result.push(new Paragraph({ spacing: { after: 80 } }));
  return result;
}

export function renderError(section: ParsedSection): DocChild[] {
  const result: DocChild[] = [];

  result.push(
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [
        new TextRun({
          text: `<${section.label}>`,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
      ],
    })
  );

  result.push(...makePassageParagraphs(section.content));

  result.push(new Paragraph({ spacing: { after: 120 } }));
  return result;
}

export function renderSummary(section: ParsedSection): DocChild[] {
  const result: DocChild[] = [];

  result.push(
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [
        new TextRun({
          text: `<${section.label}>`,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
        }),
      ],
    })
  );

  result.push(...makePassageParagraphs(section.content));
  result.push(new Paragraph({ spacing: { after: 120 } }));

  return result;
}
