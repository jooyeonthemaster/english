"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { getVisibleQuestionTags } from "@/lib/question-generation-plans";
import { QUESTION_TYPE_META } from "@/lib/question-schemas";
import { OptionList } from "./question-renderer-primitives";
import {
  BlankInferenceRenderer,
  GrammarErrorRenderer,
  VocabChoiceRenderer,
  SentenceOrderRenderer,
  SentenceInsertRenderer,
  TopicMainIdeaRenderer,
  TitleRenderer,
  ReferenceRenderer,
  ContentMatchRenderer,
  IrrelevantRenderer,
  ConditionalWritingRenderer,
  SentenceTransformRenderer,
  FillBlankKeyRenderer,
  SummaryCompleteRenderer,
  WordOrderRenderer,
  GrammarCorrectionRenderer,
  ContextMeaningRenderer,
  SynonymRenderer,
  AntonymRenderer,
} from "./question-type-renderers";

// ============================================================================
// Main dispatcher component
// ============================================================================

/**
 * Renders a structured question using the appropriate per-type renderer.
 *
 * Falls back to a generic renderer for unrecognized types (backward compat).
 */
export function StructuredQuestionRenderer({
  question,
  index,
  hideHeader = false,
  sourcePassageContent,
}: {
  question: any;
  index: number;
  /** QuestionCard 내부에서 호출될 때 true — 외부 카드가 이미 헤더를 표시하므로 중복 방지 */
  hideHeader?: boolean;
  sourcePassageContent?: string;
}) {
  const questionForRender = enrichQuestionForDisplay(question, sourcePassageContent);
  const typeId = questionForRender._typeId as string | undefined;
  const typeLabel = questionForRender._typeLabel as string | undefined;
  const meta = typeId ? QUESTION_TYPE_META[typeId] : undefined;
  const visibleTags = getVisibleQuestionTags(
    Array.isArray(questionForRender.tags) ? questionForRender.tags : [],
  );

  // Determine if this is a structured question by checking for type-specific fields
  const isStructured = typeId && hasStructuredFields(typeId, questionForRender);

  return (
    <div className={hideHeader ? "space-y-3" : "p-4 rounded-lg border border-slate-200 bg-white space-y-3"}>
      {/* Header — 외부 카드가 헤더를 제공할 때 숨김 */}
      {!hideHeader && (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-white bg-blue-600 rounded px-1.5 py-0.5">
            Q{index + 1}
          </span>
          {meta && (
            <Badge
              variant="outline"
              className={`text-[9px] ${
                meta.category === "객관식"
                  ? "border-blue-200 text-blue-600"
                  : meta.category === "서술형"
                  ? "border-amber-200 text-amber-600"
                  : "border-violet-200 text-violet-600"
              }`}
            >
              {meta.category}
            </Badge>
          )}
          <span className="text-[10px] font-medium text-slate-500">
            {typeLabel || meta?.label || typeId || ""}
          </span>
          <span className="text-[10px] font-medium text-slate-400">
            {questionForRender.difficulty || "INTERMEDIATE"}
          </span>
        </div>
        {visibleTags.length > 0 && (
          <div className="flex gap-1">
            {visibleTags.slice(0, 3).map((tag: string, ti: number) => (
              <span
                key={ti}
                className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Type-specific content */}
      {isStructured ? (
        renderTypedQuestion(typeId!, questionForRender)
      ) : (
        <FallbackRenderer question={questionForRender} />
      )}
    </div>
  );
}

function enrichQuestionForDisplay(question: any, sourcePassageContent?: string): any {
  const questionWithAlignedExplanations =
    alignWrongOptionExplanationsForDisplay(question);
  const normalizedQuestion = normalizeVocabOptionsForDisplay(
    questionWithAlignedExplanations,
  );

  if (
    normalizedQuestion?._typeId === "SYNONYM" &&
    !normalizedQuestion.passageWithUnderline &&
    sourcePassageContent
  ) {
    const targetWord =
      typeof normalizedQuestion.targetWord === "string"
        ? normalizedQuestion.targetWord
        : "";
    const contextSentence =
      typeof normalizedQuestion.contextSentence === "string"
        ? normalizedQuestion.contextSentence
        : undefined;
    const passageWithUnderline = buildPassageWithUnderlineForDisplay(
      sourcePassageContent,
      targetWord,
      contextSentence,
    );

    return passageWithUnderline
      ? { ...normalizedQuestion, passageWithUnderline }
      : normalizedQuestion;
  }

  if (
    normalizedQuestion?._typeId !== "FILL_BLANK_KEY" ||
    normalizedQuestion.passageWithBlank ||
    !sourcePassageContent
  ) {
    return normalizedQuestion;
  }

  const answer =
    typeof normalizedQuestion.answer === "string"
      ? normalizedQuestion.answer
      : typeof normalizedQuestion.correctAnswer === "string"
        ? normalizedQuestion.correctAnswer
        : "";
  const passageWithBlank = buildPassageWithBlankForDisplay(
    sourcePassageContent,
    answer,
    typeof normalizedQuestion.sentenceWithBlank === "string"
      ? normalizedQuestion.sentenceWithBlank
      : undefined,
  );

  return passageWithBlank
    ? { ...normalizedQuestion, passageWithBlank }
    : normalizedQuestion;
}

const VOCAB_OPTION_DISPLAY_TYPES = new Set([
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
]);

function normalizeVocabOptionsForDisplay(question: any): any {
  if (!VOCAB_OPTION_DISPLAY_TYPES.has(question?._typeId)) return question;
  if (!Array.isArray(question.options)) return question;

  let changed = false;
  const options = question.options.map((option: unknown) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) {
      return option;
    }
    const record = option as Record<string, unknown>;
    if (typeof record.text !== "string") return option;
    const text =
      question._typeId === "ANTONYM"
        ? sanitizeAntonymOptionText(record.text)
        : sanitizeSingleVocabOptionText(record.text);
    if (text === record.text) return option;
    changed = true;
    return { ...record, text };
  });

  return changed ? { ...question, options } : question;
}

function stripOptionPrefix(text: string): string {
  return text
    .replace(
      /^\s*(?:[\u2460-\u2469]|\((?:[A-Ja-j]|10|[1-9])\)|(?:[A-Ja-j]|10|[1-9])[.)])\s*/,
      "",
    )
    .trim();
}

function stripDefinitions(text: string): string {
  return text
    .replace(/\s*[\(\[][^)\]]*[\)\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeSingleVocabOptionText(text: string): string {
  return stripDefinitions(stripOptionPrefix(text));
}

function sanitizeAntonymOptionText(text: string): string {
  const withoutPrefix = stripOptionPrefix(text);
  const parts = withoutPrefix.split(/\s+[-\u2013\u2014]\s+/);
  if (parts.length >= 2) {
    return parts
      .slice(0, 2)
      .map((part) => stripDefinitions(stripOptionPrefix(part)))
      .join(" - ");
  }
  return stripDefinitions(withoutPrefix);
}

function buildPassageWithUnderlineForDisplay(
  passage: string,
  targetWord: string,
  contextSentence?: string,
): string | null {
  const target = targetWord.trim();
  if (!passage || !target) return null;

  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const findInText = (text: string): number => {
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    const match = regex.exec(text);
    return match?.index ?? -1;
  };

  if (contextSentence) {
    const normalizedPassage = passage.replace(/\s+/g, " ");
    const normalizedContext = contextSentence.replace(/\s+/g, " ").trim();
    const contextIndex = normalizedPassage.indexOf(normalizedContext);
    const targetIndexInContext = findInText(normalizedContext);
    if (contextIndex !== -1 && targetIndexInContext !== -1) {
      const originalIndex = mapNormalizedIndexToOriginal(
        passage,
        contextIndex + targetIndexInContext,
      );
      if (originalIndex !== null) {
        return replaceDisplaySlice(
          passage,
          originalIndex,
          target.length,
          `__${passage.slice(originalIndex, originalIndex + target.length)}__`,
        );
      }
    }
  }

  const directIndex = findInText(passage);
  if (directIndex === -1) return null;
  return replaceDisplaySlice(
    passage,
    directIndex,
    target.length,
    `__${passage.slice(directIndex, directIndex + target.length)}__`,
  );
}

const DISPLAY_KOREAN_OPTION_TYPES = new Set([
  "REFERENCE",
  "TOPIC_MAIN_IDEA",
  "CONTENT_MATCH",
]);

function alignWrongOptionExplanationsForDisplay(question: any): any {
  if (!DISPLAY_KOREAN_OPTION_TYPES.has(question?._typeId)) return question;
  if (
    !question.wrongOptionExplanations ||
    typeof question.wrongOptionExplanations !== "object" ||
    Array.isArray(question.wrongOptionExplanations) ||
    !Array.isArray(question.options)
  ) {
    return question;
  }

  const optionByLabel = new Map<string, string>();
  for (const option of question.options) {
    if (!option || typeof option !== "object") continue;
    const record = option as Record<string, unknown>;
    const label = normalizeDisplayLabel(record.label);
    const text = normalizeDisplayText(record.text);
    if (label && text) optionByLabel.set(label, text);
  }

  const correctLabel = normalizeDisplayLabel(question.correctAnswer);
  const aligned: Record<string, string> = {};
  let changed = false;

  for (const [rawLabel, rawExplanation] of Object.entries(
    question.wrongOptionExplanations as Record<string, unknown>,
  )) {
    const explanation = normalizeDisplayText(rawExplanation);
    const optionText = optionByLabel.get(normalizeDisplayLabel(rawLabel));
    if (
      !optionText ||
      !explanation ||
      normalizeDisplayLabel(rawLabel) === correctLabel ||
      explanation.includes(optionText)
    ) {
      aligned[rawLabel] = explanation;
      continue;
    }

    aligned[rawLabel] = `'${optionText}' 선택지는 ${explanation}`;
    changed = true;
  }

  return changed ? { ...question, wrongOptionExplanations: aligned } : question;
}

function normalizeDisplayLabel(value: unknown): string {
  const text = normalizeDisplayText(value);
  const circledMap: Record<string, string> = {
    "\u2460": "1",
    "\u2461": "2",
    "\u2462": "3",
    "\u2463": "4",
    "\u2464": "5",
    "\u2465": "6",
    "\u2466": "7",
    "\u2467": "8",
    "\u2468": "9",
    "\u2469": "10",
  };
  return (circledMap[text] ?? text)
    .replace(/^[\(\[]?([A-Ja-j]|10|[1-9])[\)\].]?\s*$/, "$1")
    .toLowerCase();
}

function normalizeDisplayText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function buildPassageWithBlankForDisplay(
  passage: string,
  answer: string,
  sentenceWithBlank?: string,
): string | null {
  const trimmedAnswer = answer.trim();
  if (!passage || !trimmedAnswer) return null;

  const filledSentence = sentenceWithBlank
    ?.replace(/_{3,}/g, trimmedAnswer)
    .replace(/\s+/g, " ")
    .trim();
  if (filledSentence) {
    const normalizedPassage = passage.replace(/\s+/g, " ");
    const sentenceIndex = normalizedPassage.indexOf(filledSentence);
    if (sentenceIndex !== -1) {
      const answerIndexInSentence = filledSentence.indexOf(trimmedAnswer);
      if (answerIndexInSentence !== -1) {
        const originalIndex = mapNormalizedIndexToOriginal(
          passage,
          sentenceIndex + answerIndexInSentence,
        );
        if (originalIndex !== null) {
          return replaceDisplaySlice(
            passage,
            originalIndex,
            trimmedAnswer.length,
            "_____",
          );
        }
      }
    }
  }

  const directIndex = passage.indexOf(trimmedAnswer);
  if (directIndex === -1) return null;
  return replaceDisplaySlice(passage, directIndex, trimmedAnswer.length, "_____");
}

function mapNormalizedIndexToOriginal(
  original: string,
  normalizedIndex: number,
): number | null {
  let normalizedPosition = 0;
  for (let originalIndex = 0; originalIndex < original.length; originalIndex++) {
    if (normalizedPosition === normalizedIndex) return originalIndex;
    if (/\s/.test(original[originalIndex])) {
      while (
        originalIndex + 1 < original.length &&
        /\s/.test(original[originalIndex + 1])
      ) {
        originalIndex++;
      }
      normalizedPosition++;
    } else {
      normalizedPosition++;
    }
  }
  return normalizedPosition === normalizedIndex ? original.length : null;
}

function replaceDisplaySlice(
  text: string,
  start: number,
  length: number,
  replacement: string,
): string {
  return text.slice(0, start) + replacement + text.slice(start + length);
}

/** Check if a question has the expected structured fields for its type */
function hasStructuredFields(typeId: string, q: any): boolean {
  switch (typeId) {
    case "BLANK_INFERENCE":
      return !!q.passageWithBlank && !!q.direction;
    case "GRAMMAR_ERROR":
    case "VOCAB_CHOICE":
    case "ANTONYM":
      return !!q.passageWithMarkers && !!q.direction;
    case "SENTENCE_ORDER":
      return !!q.givenSentence && !!q.paragraphs;
    case "SENTENCE_INSERT":
      return !!q.givenSentence && !!q.passageWithMarkers;
    case "TOPIC_MAIN_IDEA":
    case "TITLE":
    case "CONTENT_MATCH":
      return !!q.direction && !!q.options;
    case "REFERENCE":
    case "CONTEXT_MEANING":
      return !!q.passageWithUnderline && !!q.direction;
    case "IRRELEVANT":
      return !!q.passageWithNumbers && !!q.direction;
    case "CONDITIONAL_WRITING":
      return !!q.referenceSentence && !!q.conditions;
    case "SENTENCE_TRANSFORM":
      return !!q.originalSentence && !!q.conditions;
    case "FILL_BLANK_KEY":
      return !!q.sentenceWithBlank;
    case "SUMMARY_COMPLETE":
      return !!q.summaryWithBlanks && !!q.blanks;
    case "WORD_ORDER":
      return !!q.scrambledWords;
    case "GRAMMAR_CORRECTION":
      return !!q.sentenceWithError && !!q.errorPart;
    case "SYNONYM":
      return !!q.targetWord && !!q.contextSentence;
    default:
      return false;
  }
}

/** Dispatch to the correct renderer */
function renderTypedQuestion(typeId: string, q: any): React.ReactNode {
  switch (typeId) {
    case "BLANK_INFERENCE":
      return <BlankInferenceRenderer q={q} />;
    case "GRAMMAR_ERROR":
      return <GrammarErrorRenderer q={q} />;
    case "VOCAB_CHOICE":
      return <VocabChoiceRenderer q={q} />;
    case "SENTENCE_ORDER":
      return <SentenceOrderRenderer q={q} />;
    case "SENTENCE_INSERT":
      return <SentenceInsertRenderer q={q} />;
    case "TOPIC_MAIN_IDEA":
      return <TopicMainIdeaRenderer q={q} />;
    case "TITLE":
      return <TitleRenderer q={q} />;
    case "REFERENCE":
      return <ReferenceRenderer q={q} />;
    case "CONTENT_MATCH":
      return <ContentMatchRenderer q={q} />;
    case "IRRELEVANT":
      return <IrrelevantRenderer q={q} />;
    case "CONDITIONAL_WRITING":
      return <ConditionalWritingRenderer q={q} />;
    case "SENTENCE_TRANSFORM":
      return <SentenceTransformRenderer q={q} />;
    case "FILL_BLANK_KEY":
      return <FillBlankKeyRenderer q={q} />;
    case "SUMMARY_COMPLETE":
      return <SummaryCompleteRenderer q={q} />;
    case "WORD_ORDER":
      return <WordOrderRenderer q={q} />;
    case "GRAMMAR_CORRECTION":
      return <GrammarCorrectionRenderer q={q} />;
    case "CONTEXT_MEANING":
      return <ContextMeaningRenderer q={q} />;
    case "SYNONYM":
      return <SynonymRenderer q={q} />;
    case "ANTONYM":
      return <AntonymRenderer q={q} />;
    default:
      return <FallbackRenderer question={q} />;
  }
}

/** Fallback for legacy/unstructured questions (backward compat with old questionText format) */
function FallbackRenderer({ question: q }: { question: any }) {
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <>
      <div className="text-[13px] text-slate-900 leading-relaxed whitespace-pre-wrap">
        {q.questionText || q.direction || ""}
      </div>

      {q.options && q.options.length > 0 && (
        <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      )}

      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        {!(q.modelAnswer && (!q.options || q.options.length === 0)) ? (
          <span className="text-[12px] text-slate-400">
            정답: <span className="font-bold text-emerald-600">{q.correctAnswer}</span>
          </span>
        ) : <span />}
        <button
          type="button"
          onClick={() => setShowExplanation(!showExplanation)}
          className="text-[11px] font-medium text-blue-500 hover:text-blue-700 transition-colors"
        >
          {showExplanation ? "해설 접기" : "해설 보기"}
        </button>
      </div>

      {showExplanation && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          {q.explanation && (
            <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-100">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">
                해설
              </span>
              <p className="text-[12px] text-slate-700 leading-relaxed">{q.explanation}</p>
            </div>
          )}
          {q.keyPoints && q.keyPoints.length > 0 && (
            <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-100">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block mb-1">
                핵심 포인트
              </span>
              <ul className="space-y-1">
                {q.keyPoints.map((kp: string, ki: number) => (
                  <li key={ki} className="text-[12px] text-slate-600 flex items-start gap-1.5">
                    <span className="text-blue-400 mt-0.5">-</span>
                    {kp}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {q.wrongOptionExplanations && Object.keys(q.wrongOptionExplanations).length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-100">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block mb-1">
                오답 분석
              </span>
              <div className="space-y-1">
                {Object.entries(q.wrongOptionExplanations).map(([num, exp]: [string, any]) => (
                  <div key={num} className="text-[12px] text-slate-600 flex items-start gap-1.5">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center text-[9px] font-bold mt-0.5">
                      {num}
                    </span>
                    <span>{exp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
