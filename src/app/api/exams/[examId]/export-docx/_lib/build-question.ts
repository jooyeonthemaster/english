import { AlignmentType, Paragraph, TextRun } from "docx";
import { COLOR, FONT, KR_FONT, PASSAGE_SIZE, QUESTION_NUM_SIZE, SMALL_SIZE } from "./styles";
import { hrule } from "./borders";
import { parseFormattedText } from "./parse-formatted-text";
import { parseQuestionSections, questionTextContainsPassage } from "./parse-question-sections";
import { safeParseJSON, renderWritingSpace } from "./helpers";
import {
  renderPassage,
  renderMarkerSection,
  renderConditions,
  renderError,
  renderSummary,
} from "./render-section-boxes";
import {
  renderDirection,
  renderScrambled,
  renderTarget,
  renderParagraphs,
  renderBlanks,
  renderHint,
  renderMatchType,
} from "./render-section-inline";
import { renderOptions } from "./render-options";
import { renderAnswer } from "./render-answer";
import type { DocChild, ExamQuestionData, ParsedOption, ParsedSection } from "./types";
import { formatInlineMarkersForSubtype } from "@/components/exams/paper-builder/option-display";
import { formatSourcePassageForQuestionItems } from "@/components/exams/paper-builder/source-passage-markers";
import { isSummaryCompleteSubtype } from "@/components/exams/paper-builder/summary-complete-mc-layout";
import { normalizeQuestionText } from "@/components/exams/paper-builder/text-normalization";

// ---------------------------------------------------------------------------
// Element Builder
// ---------------------------------------------------------------------------

function stripOriginalBlock(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block && !/^\[(?:original|\uC6D0\uBB38)\]\s*/i.test(block))
    .join("\n\n")
    .trim();
}

// SUMMARY_WRITING(요약문 영작)의 [해석]/[빈칸 해석] — 회색(slate) 인라인 해석 줄.
// orange/amber 금지, 정답계열 미포함. parseFormattedText 의 마커는 검정으로 둔다.
function renderSummaryWritingGloss(section: ParsedSection): DocChild[] {
  return [
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 40, after: 80, line: 312 },
      children: [
        new TextRun({
          text: `[${section.label}] `,
          font: KR_FONT,
          size: PASSAGE_SIZE,
          bold: true,
          color: COLOR.gray,
        }),
        ...parseFormattedText(section.content, {
          font: KR_FONT,
          size: PASSAGE_SIZE,
          color: COLOR.gray,
          markerColor: COLOR.black,
        }),
      ],
    }),
  ];
}

export function buildQuestionElements(
  eq: ExamQuestionData,
  includeAnswer: boolean
): DocChild[] {
  const elements: DocChild[] = [];
  const q = eq.question;
  const options = safeParseJSON<ParsedOption[]>(q.options, []);

  const normalizedQuestionText = normalizeQuestionText(
    formatInlineMarkersForSubtype(q.questionText, q.subType),
  );
  const displayQuestionText =
    q.subType === "SENTENCE_TRANSFORM"
      ? stripOriginalBlock(normalizedQuestionText)
      : normalizedQuestionText;
  const sections = parseQuestionSections(displayQuestionText, q.subType);
  const hasEmbeddedPassage = questionTextContainsPassage(sections);

  // 1. Render Direction FIRST
  const directionSection = sections.find(s => s.type === "direction");
  if (directionSection) {
    elements.push(...renderDirection(directionSection, eq.orderNum, eq.points));
  } else {
    const numChildren: TextRun[] = [
      new TextRun({
        text: `${eq.orderNum}. `,
        font: KR_FONT,
        size: QUESTION_NUM_SIZE,
        bold: true,
      }),
    ];
    if (eq.points > 0) {
      numChildren.push(
        new TextRun({
          text: `[${eq.points}점]`,
          font: KR_FONT,
          size: SMALL_SIZE,
          color: COLOR.gray,
        })
      );
    }
    elements.push(
      new Paragraph({
        spacing: { before: 240, after: 120 },
        children: numChildren,
      })
    );
  }

  // 2. Render Passage SECOND (if it is globally attached and not embedded)
  // This explicitly prevents the passage from dropping below the conditions
  if (q.passage && (!hasEmbeddedPassage || isSummaryCompleteSubtype(q.subType))) {
    elements.push(...renderPassage(
      formatSourcePassageForQuestionItems(q.passage.content, [
        {
          questionText: q.questionText,
          sourceQuestion: {
            subType: q.subType,
            questionText: q.questionText,
            structuredData: q.structuredData,
          },
        },
      ]),
    ));
  }

  // 3. Render all other blocks (Conditions, Source Text, Target Words, etc.)
  for (const section of sections) {
    if (section.type === "direction") continue;

    switch (section.type) {
      case "passage":
        elements.push(...renderPassage(section.content));
        break;
      case "marker":
        elements.push(...renderMarkerSection(section));
        break;
      case "conditions":
        elements.push(...renderConditions(section));
        break;
      case "error":
        elements.push(...renderError(section));
        break;
      case "summary":
        elements.push(...renderSummary(section));
        break;
      case "scrambled":
        elements.push(...renderScrambled(section));
        break;
      case "target":
        elements.push(...renderTarget(section));
        break;
      case "context":
        // [해석]/[빈칸 해석](요약문 영작) — 회색(slate) 인라인 해석. 정답계열 없음.
        // ([문맥] 등 레거시 내부 메타는 parseQuestionSections 에서 이미 드롭됨.)
        elements.push(...renderSummaryWritingGloss(section));
        break;
      case "paragraphs":
        elements.push(...renderParagraphs(section));
        break;
      case "blanks":
        elements.push(...renderBlanks(section));
        break;
      case "hint":
        elements.push(...renderHint(section));
        break;
      case "matchType":
        elements.push(...renderMatchType(section));
        break;
      case "fallback":
      default:
        elements.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: 200 },
            children: parseFormattedText(section.content, {
              font: FONT,
              size: PASSAGE_SIZE,
            }),
          })
        );
        break;
    }
  }

  // 4. Render Options
  elements.push(...renderOptions(options, q.subType));

  // 5. Render Subjective Writing Area (if no options and no included answer, perfect for printed tests)
  if (options.length === 0 && !includeAnswer) {
    const isWriting = Boolean(sections.some(
      s => s.type === "conditions" || s.type === "scrambled" || s.type === "blanks" || s.label === "영작할 우리말"
    ) || (q.subType && q.subType.includes("영작")));

    // Always provide a writing space for subjective questions
    elements.push(...renderWritingSpace(isWriting));
  }

  // 6. Answer Key / Explanation
  if (includeAnswer) {
    elements.push(...renderAnswer(q, options));
  }

  // Divider
  elements.push(hrule(COLOR.separator, 4, 160, 160));

  return elements;
}
