import { BorderStyle, ImageRun, Paragraph, TextRun } from "docx";
import { LINE_GAP_MARKER } from "@/components/exams/paper-builder/types";
import { NONE, bdr } from "../borders";
import { parseFormattedText } from "../parse-formatted-text";
import { COLOR } from "../styles";
import type { DocChild } from "../types";
import type { BuilderBlock } from "./model";
import { BODY_LINE_HEIGHT, BODY_LINE_HEIGHT_COMPACT, SIZE_BODY, SIZE_BODY_COMPACT, SIZE_META, bodyFont, exactLineSpacing } from "./sizes";
import { blockBodySize, dataUrlToImage, dividerBorderStyle, docAlignment } from "./util";



export function buildCustomBlock(block: BuilderBlock, compact: boolean): DocChild[] {
  const accent = (block.blockAccentColor || "#2563EB").replace("#", "");
  const align = docAlignment(block.blockAlign);
  const text = block.blockText || block.questionText || "";

  if (block.blockType === "section") {
    return [
      new Paragraph({
        alignment: align,
        spacing: { before: 140, after: 120 },
        border: {
          left: bdr(BorderStyle.SINGLE, 16, accent),
          bottom: bdr(BorderStyle.SINGLE, 4, COLOR.lightGray),
          top: NONE,
          right: NONE,
        },
        indent: { left: 160 },
        children: [
          new TextRun({
            text: block.blockTitle || text || "새 섹션",
            font: bodyFont,
            size: compact ? 24 : 26,
            bold: true,
            color: COLOR.black,
          }),
        ],
      }),
    ];
  }

  if (block.blockType === "text") {
    const paragraphs = (text || " ").replace(/\r/g, "").split("\n");
    return paragraphs.map(
      (paragraph) =>
        new Paragraph({
          alignment: align,
          spacing: { before: 40, after: 80 },
          children: parseFormattedText(paragraph || " ", {
            font: bodyFont,
            size: blockBodySize(block, compact),
            color: COLOR.darkGray,
          }),
        }),
    );
  }

  if (block.blockType === "divider") {
    return [
      new Paragraph({
        spacing: { before: 120, after: 120 },
        border: {
          top: bdr(
            dividerBorderStyle(block.dividerStyle),
            Math.max(4, Math.min(24, (block.dividerThickness || 1) * 4)),
            accent,
          ),
          bottom: NONE,
          left: NONE,
          right: NONE,
        },
        children: [new TextRun({ text: "" })],
      }),
    ];
  }

  if (block.blockType === "spacer") {
    // 워드프로세서식 빈 줄(line-gap): 미리보기에서 Enter 한 번 = 본문 한 줄이므로,
    // 워드에서도 "본문 한 줄"과 똑같은 높이(빈 단락 한 줄)로 렌더한다. 추가 spaceAfter
    // 없이 본문 글자 크기·행간(exactLineSpacing)만 줘서 정확히 한 줄을 차지하게 한다.
    if (block.blockText === LINE_GAP_MARKER) {
      const bodySize = compact ? SIZE_BODY_COMPACT : SIZE_BODY;
      const lh = compact ? BODY_LINE_HEIGHT_COMPACT : BODY_LINE_HEIGHT;
      return [
        new Paragraph({
          spacing: { before: 0, after: 0, ...exactLineSpacing(bodySize, lh) },
          children: [new TextRun({ text: "", font: bodyFont, size: bodySize })],
        }),
      ];
    }
    return [
      new Paragraph({
        spacing: { before: 0, after: Math.max(80, Math.min(900, (block.spacerHeight || 32) * 10)) },
        children: [new TextRun({ text: "" })],
      }),
    ];
  }

  if (block.blockType === "image") {
    const image = dataUrlToImage(block.imageDataUrl);
    if (!image) {
      return [
        new Paragraph({
          alignment: align,
          spacing: { before: 80, after: 80 },
          children: [
            new TextRun({
              text: block.imageAlt || "이미지",
              font: bodyFont,
              size: SIZE_META,
              color: COLOR.gray,
              italics: true,
            }),
          ],
        }),
      ];
    }

    const width = Math.max(120, Math.min(520, 520 * ((block.imageWidth || 70) / 100)));
    return [
      new Paragraph({
        alignment: align,
        spacing: { before: 80, after: block.imageAlt ? 40 : 120 },
        children: [
          new ImageRun({
            data: image.buffer,
            transformation: { width, height: width * 0.68 },
            type: image.type,
          }),
        ],
      }),
      ...(block.imageAlt
        ? [
            new Paragraph({
              alignment: align,
              spacing: { after: 100 },
              children: [
                new TextRun({
                  text: block.imageAlt,
                  font: bodyFont,
                  size: SIZE_META,
                  color: COLOR.gray,
                }),
              ],
            }),
          ]
        : []),
    ];
  }

  return [];
}
