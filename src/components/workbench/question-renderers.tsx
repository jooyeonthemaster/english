"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
}: {
  question: any;
  index: number;
  /** QuestionCard 내부에서 호출될 때 true — 외부 카드가 이미 헤더를 표시하므로 중복 방지 */
  hideHeader?: boolean;
}) {
  const typeId = question._typeId as string | undefined;
  const typeLabel = question._typeLabel as string | undefined;
  const meta = typeId ? QUESTION_TYPE_META[typeId] : undefined;

  // Determine if this is a structured question by checking for type-specific fields
  const isStructured = typeId && hasStructuredFields(typeId, question);

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
            {question.difficulty || "INTERMEDIATE"}
          </span>
        </div>
        {question.tags && question.tags.length > 0 && (
          <div className="flex gap-1">
            {question.tags.slice(0, 3).map((tag: string, ti: number) => (
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
        renderTypedQuestion(typeId!, question)
      ) : (
        <FallbackRenderer question={question} />
      )}
    </div>
  );
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
