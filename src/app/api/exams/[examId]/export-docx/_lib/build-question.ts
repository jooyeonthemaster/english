import { Paragraph, TextRun } from "docx";
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
  renderContext,
  renderParagraphs,
  renderBlanks,
  renderHint,
  renderMatchType,
} from "./render-section-inline";
import { renderOptions } from "./render-options";
import { renderAnswer } from "./render-answer";
import type { DocChild, ExamQuestionData, ParsedOption } from "./types";

// ---------------------------------------------------------------------------
// Element Builder
// ---------------------------------------------------------------------------

export function buildQuestionElements(
  eq: ExamQuestionData,
  includeAnswer: boolean
): DocChild[] {
  const elements: DocChild[] = [];
  const q = eq.question;
  const options = safeParseJSON<ParsedOption[]>(q.options, []);

  const sections = parseQuestionSections(q.questionText, q.subType);
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
  if (q.passage && !hasEmbeddedPassage) {
    elements.push(...renderPassage(q.passage.content));
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
        elements.push(...renderContext(section));
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
  elements.push(...renderOptions(options));

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
