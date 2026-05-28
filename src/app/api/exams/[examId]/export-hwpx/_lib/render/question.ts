/**
 * 한 문제(번호 + 메타 + 본문 + 옵션 + 답란/정답해설) 렌더러.
 * DOCX 의 buildQuestionBlock 과 동일한 시각 구조를 HWPX 로 재현.
 */

import type { BlockNode, BorderSpec, RunNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE, SUBTYPE_LABELS } from "../tokens";
import { renderOptions, type ParsedOption } from "./options";
import {
  renderBlanks,
  renderConditions,
  renderContext,
  renderDirection,
  renderError,
  renderFallback,
  renderHint,
  renderMarker,
  renderMatchType,
  renderParagraphs,
  renderScrambled,
  renderSummary,
  renderTarget,
} from "./section-types";
import { renderPassage } from "./passage";
import { renderAnswerBlock } from "./answer";

import { parseQuestionSections, questionTextContainsPassage } from "@/app/api/exams/[examId]/export-docx/_lib/parse-question-sections";
import {
  formatSentenceInsertPassageMarkers,
  optionOrdinalLabel,
} from "@/components/exams/paper-builder/option-display";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";

const NO: BorderSpec = { type: "NONE", widthMm: 0.1, color: COLORS.black };
const GIVEN_BORDER: BorderSpec = {
  type: "SOLID",
  widthMm: 0.18,
  color: COLORS.gray,
};

export interface BuilderItemResolved {
  localId?: string;
  questionId: string;
  orderNum?: number;
  points?: number;
  groupId?: string | null;
  includePassage?: boolean;
  passageTitle?: string;
  passageContent?: string;
  questionText?: string;
  options?: ParsedOption[];
  correctAnswer?: string;
  answerSpaceLines?: number;
  objectiveAnswerSlots?: number;
  objectiveAnswerTexts?: string[];
  sectionTitle?: string;
  teacherNote?: string;
  sourceQuestion: ExamQuestionData["question"];
}

export interface QuestionRenderOptions {
  item: BuilderItemResolved;
  layout: {
    columns?: 1 | 2;
    density?: "comfortable" | "compact";
    showAnswerSpace?: boolean;
    showQuestionMeta?: boolean;
  };
  includeAnswers: boolean;
  contentWidthHpu: number;
}

function safeParseOptions(raw: string | null | undefined): ParsedOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((o, idx) => ({
      label: String(o?.label ?? idx + 1),
      text: String(o?.text ?? ""),
    }));
  } catch {
    return [];
  }
}

export function renderQuestionBlock(opts: QuestionRenderOptions): BlockNode[] {
  const { item, layout, includeAnswers, contentWidthHpu } = opts;
  const compact = layout.density === "compact";
  const showMeta = layout.showQuestionMeta !== false;
  const showAnswerSpace = layout.showAnswerSpace !== false && !includeAnswers;

  const orderNum = item.orderNum ?? 0;
  const points = item.points ?? 1;
  const subType = item.sourceQuestion.subType || "";
  const subTypeLabel = subType ? SUBTYPE_LABELS[subType] || subType : "";
  const questionText = formatSentenceInsertPassageMarkers(
    item.questionText ?? item.sourceQuestion.questionText ?? "",
    subType,
  ).trim();
  const options = (item.options ?? safeParseOptions(item.sourceQuestion.options))
    .filter((o) => o && (o.text || "").length >= 0);

  const result: BlockNode[] = [];
  const qNumSize = compact ? SIZE.qNumCompact : SIZE.qNum;
  const bodySize = compact ? SIZE.bodyCompact : SIZE.body;

  // 본문 텍스트 파싱
  const sections = parseQuestionSections(questionText, subType);
  const hasEmbeddedPassage = questionTextContainsPassage(sections);
  const directionSection = sections.find((s) => s.type === "direction");

  // 1. 번호 + 메타 + (지시문)
  if (directionSection) {
    result.push(
      ...renderDirection(
        directionSection,
        orderNum,
        points,
        subTypeLabel,
        showMeta,
        compact,
      ),
    );
  } else {
    const headerRuns: RunNode[] = [
      txt(`${orderNum}. `, {
        size: qNumSize,
        bold: true,
        color: COLORS.black,
      }),
    ];
    if (showMeta) {
      headerRuns.push(
        txt(subTypeLabel ? `[${points}점 · ${subTypeLabel}]` : `[${points}점]`, {
          size: SIZE.meta,
          color: COLORS.gray,
        }),
      );
    }
    result.push({
      kind: "p",
      style: { spaceBefore: 80, spaceAfter: 80 },
      runs: headerRuns,
    });
  }

  // 2. 글로벌 지문 (passage 모델, embed 가 아닌 경우)
  const sourcePassage = item.sourceQuestion.passage;
  if (sourcePassage && !hasEmbeddedPassage) {
    result.push(
      ...renderPassage({
        passageTitle: item.passageTitle ?? sourcePassage.title ?? "",
        passageContent: item.passageContent ?? sourcePassage.content ?? "",
        passageStyle: "plain",
        showPassageTitle: false,
        compact,
        usesSentenceInsertMarkers: subType === "SENTENCE_INSERT",
        contentWidthHpu,
      }),
    );
  }

  // 3. 본문 섹션들
  for (const section of sections) {
    if (section.type === "direction") continue;
    switch (section.type) {
      case "passage":
        result.push(
          ...renderPassage({
            passageTitle: "",
            passageContent: section.content,
            passageStyle: "plain",
            showPassageTitle: false,
            compact,
            usesSentenceInsertMarkers: subType === "SENTENCE_INSERT",
            contentWidthHpu,
          }),
        );
        break;
      case "marker":
        result.push(...renderMarker(section, contentWidthHpu));
        break;
      case "conditions":
        result.push(...renderConditions(section));
        break;
      case "error":
        result.push(...renderError(section, contentWidthHpu));
        break;
      case "summary":
        result.push(...renderSummary(section, contentWidthHpu));
        break;
      case "scrambled":
        result.push(...renderScrambled(section));
        break;
      case "target":
        result.push(...renderTarget(section));
        break;
      case "context":
        result.push(...renderContext(section));
        break;
      case "paragraphs":
        result.push(...renderParagraphs(section));
        break;
      case "blanks":
        result.push(...renderBlanks(section));
        break;
      case "hint":
        result.push(...renderHint(section));
        break;
      case "matchType":
        result.push(...renderMatchType(section));
        break;
      default:
        result.push(...renderFallback(section));
    }
  }

  // 4. 옵션
  if (options.length > 0) {
    result.push(...renderOptions({ options, subType, compact, contentWidthHpu }));
  }

  // 5. 객관식 추가 선지
  if (
    showAnswerSpace &&
    options.length > 0 &&
    (item.objectiveAnswerSlots ?? 0) > 0
  ) {
    const slots = Math.max(1, Math.min(10, item.objectiveAnswerSlots ?? 0));
    const objectiveAnswerTexts = item.objectiveAnswerTexts || [];
    for (let i = 0; i < slots; i += 1) {
      const optionIndex = options.length + i;
      const displayText = objectiveAnswerTexts[i]?.trim() || "";
      result.push({
        kind: "p",
        style: {
          leftMargin: 360,
          indentFirst: -280,
          spaceAfter: 40,
          lineSpacingPct: 145,
        },
        runs: [
          txt(optionOrdinalLabel(optionIndex), {
            size: bodySize,
            bold: true,
            color: COLORS.darkGray,
          }),
          txt("  ", { size: bodySize }),
          displayText
            ? txt(displayText, {
                size: bodySize,
                color: COLORS.darkGray,
              })
            : txt("                                      ", {
                size: bodySize,
                underline: "SOLID",
                color: COLORS.darkGray,
              }),
        ],
      });
    }
  }

  // 5. 서술형/주관식 답란
  if (showAnswerSpace && (item.answerSpaceLines ?? 0) > 0) {
    const lines = Math.max(1, Math.min(12, item.answerSpaceLines ?? 3));
    for (let i = 0; i < lines; i++) {
      result.push({
        kind: "p",
        style: { spaceBefore: i === 0 ? 40 : 80, spaceAfter: 80 },
        runs: [txt("                                                                                                  ", { size: bodySize, underline: "SOLID", color: COLORS.lightGray })],
      });
    }
  }

  // 6. 정답·해설 (해설 포함 모드)
  if (includeAnswers) {
    result.push(
      ...renderAnswerBlock({
        correctAnswer: item.correctAnswer ?? item.sourceQuestion.correctAnswer ?? "",
        explanation: item.sourceQuestion.explanation,
        hasOptions: options.length > 0,
        contentWidthHpu,
      }),
    );
  }

  // 7. 구분선 (얇은 회색)
  result.push({
    kind: "p",
    style: { spaceBefore: 60, spaceAfter: 60, lineSpacingPct: 80 },
    runs: [
      txt("─".repeat(40), {
        size: 6,
        color: COLORS.separator,
      }),
    ],
  });

  void NO;
  void GIVEN_BORDER;
  return result;
}
