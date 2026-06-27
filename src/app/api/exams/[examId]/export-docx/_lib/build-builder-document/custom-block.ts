import { BorderStyle, ImageRun, Paragraph, TextRun } from "docx";
import { LINE_GAP_MARKER } from "@/components/exams/paper-builder/types";
import { DEFAULT_IMAGE_ASPECT } from "@/lib/image-dims";
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
            size:
              typeof block.blockFontPt === "number" && Number.isFinite(block.blockFontPt)
                ? Math.round(block.blockFontPt * 2)
                : compact
                  ? 24
                  : 26,
            bold: block.blockBold ?? true,
            italics: block.blockItalic ?? false,
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
            bold: block.blockBold ?? false,
            italics: block.blockItalic ?? false,
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
    // 실제 종횡비(자연 height/width)로 높이를 잡아 미리보기와 같은 비율로 출력한다.
    const aspect = image.width > 0 ? image.height / image.width : DEFAULT_IMAGE_ASPECT;
    // 아주 긴 이미지는 한 페이지(내용 높이 ~1000px@A4)를 넘지 않도록 높이를 제한해
    // 종횡비를 유지한 채 폭까지 함께 줄인다(워드 페이지/여백을 넘지 않게).
    const MAX_IMG_HEIGHT_PX = 1000;
    let imgW = width;
    let imgH = Math.round(width * aspect);
    if (imgH > MAX_IMG_HEIGHT_PX) {
      imgH = MAX_IMG_HEIGHT_PX;
      imgW = Math.round(MAX_IMG_HEIGHT_PX / aspect);
    }
    const height = imgH;
    return [
      new Paragraph({
        alignment: align,
        spacing: { before: 80, after: block.imageAlt ? 40 : 120 },
        // 이미지는 한 덩어리로 유지 — 페이지 하단에 안 들어가면 통째로 다음 쪽으로
        // (Word 가 인라인 이미지를 쪼개지 않으므로 자동으로 다음 쪽 상단에 배치된다).
        keepLines: true,
        keepNext: Boolean(block.imageAlt),
        children: [
          new ImageRun({
            data: image.buffer,
            transformation: { width: imgW, height },
            type: image.type,
          }),
        ],
      }),
      ...(block.imageAlt
        ? [
            new Paragraph({
              alignment: align,
              spacing: { after: 100 },
              keepLines: true,
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
