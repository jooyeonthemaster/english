import { AlignmentType, Paragraph, TextRun } from "docx";
import { formatSentenceInsertPassageMarkers } from "@/components/exams/paper-builder/option-display";
import { parseFormattedText } from "../parse-formatted-text";
import { COLOR, FONT, KR_FONT } from "../styles";
import type { DocChild } from "../types";
import type { SummaryWritingDocBlocks } from "./model";
import { BODY_LINE_HEIGHT, BODY_LINE_HEIGHT_COMPACT, SIZE_BODY, SIZE_BODY_COMPACT, SIZE_META, SIZE_PASSAGE_TITLE, bodyFont, exactLineSpacing } from "./sizes";



// =============================================================================
// 지문
// =============================================================================

export function buildPassage(opts: {
  passageTitle: string;
  passageContent: string;
  passageStyle: "boxed" | "underlined" | "plain";
  showPassageTitle: boolean;
  compact: boolean;
  usesSentenceInsertMarkers: boolean;
}): DocChild[] {
  const {
    passageTitle,
    passageContent,
    passageStyle,
    showPassageTitle,
    compact,
    usesSentenceInsertMarkers,
  } = opts;
  if (!passageContent.trim()) return [];

  const bodySize = compact ? SIZE_BODY_COMPACT : SIZE_BODY;
  const lh = compact ? BODY_LINE_HEIGHT_COMPACT : BODY_LINE_HEIGHT;

  const titlePara: Paragraph | null =
    showPassageTitle && passageTitle.trim()
      ? new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: passageTitle.toUpperCase(),
              font: bodyFont,
              size: SIZE_PASSAGE_TITLE,
              bold: true,
              color: COLOR.darkGray,
              characterSpacing: 20,
            }),
          ],
        })
      : null;

  const renderedPassageContent = formatSentenceInsertPassageMarkers(
    passageContent,
    usesSentenceInsertMarkers ? "SENTENCE_INSERT" : null,
  );
  const lines = renderedPassageContent.split("\n");
  const bodyParas = lines.map((line, idx) => {
    const trimmed = line.trim();
    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: {
        after: idx < lines.length - 1 ? 40 : 0,
        ...exactLineSpacing(bodySize, lh),
      },
      children:
        trimmed.length === 0
          ? [new TextRun({ text: " ", font: FONT, size: bodySize })]
          : parseFormattedText(trimmed, { font: FONT, size: bodySize }),
    });
  });

  const innerChildren: Paragraph[] = [];
  if (titlePara) innerChildren.push(titlePara);
  innerChildren.push(...bodyParas);

  void passageStyle;
  return [...innerChildren, new Paragraph({ spacing: { after: 120 } })];
}

export function buildPassageTitleParagraph(
  passageTitle: string,
  showPassageTitle: boolean,
): Paragraph | null {
  if (!showPassageTitle || !passageTitle.trim()) return null;
  return new Paragraph({
    spacing: { before: 20, after: 30 },
    children: [
      new TextRun({
        text: passageTitle.toUpperCase(),
        font: KR_FONT,
        size: SIZE_PASSAGE_TITLE,
        bold: true,
        color: COLOR.darkGray,
        characterSpacing: 20,
      }),
    ],
  });
}

// 주어진 문장 블록([주어진 문장]/[given]) 추출 — 문장삽입/순서 공용.
export function extractGivenBlock(text: string, subType: string): { given: string; rest: string } {
  if (subType !== "SENTENCE_INSERT" && subType !== "SENTENCE_ORDER") {
    return { given: "", rest: text };
  }
  const re = /(?:^|\n)[ \t]*\[(?:주어진\s*문장|given)\][ \t]*([\s\S]*?)(?=\n\n|$)/i;
  const m = re.exec(text);
  if (!m || m.index === undefined) return { given: "", rest: text };
  const given = (m[1] ?? "").trim();
  const rest = `${text.slice(0, m.index)}\n${text.slice(m.index + m[0].length)}`
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "");
  return { given, rest };
}

export function stripOriginalBlock(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block && !/^\[(?:original|\uC6D0\uBB38)\]\s*/i.test(block))
    .join("\n\n")
    .trim();
}

export function shouldPlaceInlinePassageBeforeBody(subType: string): boolean {
  return (
    subType === "CONDITIONAL_WRITING" ||
    subType === "WORD_ORDER" ||
    subType === "TOPIC_SENTENCE_WRITING" ||
    subType === "SENTENCE_TRANSFORM"
  );
}

export function buildGivenBox(text: string, bodySize: number, lh: number): DocChild[] {
  return [
    new Paragraph({
      spacing: { before: 40, after: 30 },
      children: [
        new TextRun({
          text: "주어진 문장",
          font: bodyFont,
          size: SIZE_META,
          bold: true,
          color: COLOR.gray,
          characterSpacing: 10,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 80, ...exactLineSpacing(bodySize, lh) },
      // 본문(주어진 문장 내용)은 일반체 — 라벨("주어진 문장")만 굵게(미리보기와 동일).
      children: parseFormattedText(text, { font: bodyFont, size: bodySize, bold: false }),
    }),
  ];
}

export function parseSummaryWritingBlocks(questionText: string): SummaryWritingDocBlocks {
  const blocks = questionText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const result: SummaryWritingDocBlocks = {
    gloss: "",
    blankGloss: "",
    summary: "",
    wordBank: "",
    firstLetters: "",
  };
  const take = (block: string, marker: string) =>
    block.slice(marker.length).replace(/^\s*/, "").trim();
  for (const block of blocks) {
    if (block.startsWith("[해석]")) result.gloss = take(block, "[해석]");
    else if (block.startsWith("[빈칸 해석]")) result.blankGloss = take(block, "[빈칸 해석]");
    else if (block.startsWith("[요약문]")) result.summary = take(block, "[요약문]");
    else if (block.startsWith("[보기]")) result.wordBank = take(block, "[보기]");
    else if (block.startsWith("[앞글자]")) result.firstLetters = take(block, "[앞글자]");
  }
  return result;
}
