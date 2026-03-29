"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, Check, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  QUESTION_TYPE_META,
  type StructuredQuestion,
  type BlankInferenceQuestion,
  type GrammarErrorQuestion,
  type VocabChoiceQuestion,
  type SentenceOrderQuestion,
  type SentenceInsertQuestion,
  type TopicMainIdeaQuestion,
  type TitleQuestion,
  type ReferenceQuestion,
  type ContentMatchQuestion,
  type IrrelevantQuestion,
  type ConditionalWritingQuestion,
  type SentenceTransformQuestion,
  type FillBlankKeyQuestion,
  type SummaryCompleteQuestion,
  type WordOrderQuestion,
  type GrammarCorrectionQuestion,
  type ContextMeaningQuestion,
  type SynonymQuestion,
  type AntonymQuestion,
} from "@/lib/question-schemas";

// ============================================================================
// Shared UI primitives
// ============================================================================

/** Direction (발문) — bold, dark, clearly separated */
function Direction({ text }: { text: string }) {
  return (
    <div className="text-[13px] font-bold text-slate-900 leading-relaxed">
      {text}
    </div>
  );
}

/** Passage section — light gray bg, monospace, with inline highlights */
function PassageBlock({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-1">
      {label && (
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
          {label}
        </span>
      )}
      <div className="font-mono text-[12.5px] leading-[1.9] text-slate-700 whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

/** Render passage text with __word__ converted to underline spans */
function renderUnderlinedText(text: string): React.ReactNode {
  const regex = /__([^_]+)__/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span
        key={key++}
        className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900"
      >
        {match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

/** Render text with _____ blanks as visual blank lines */
function renderBlanks(text: string): React.ReactNode {
  const regex = /_{3,}/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span
        key={key++}
        className="inline-block min-w-[100px] border-b-2 border-blue-400 mx-1 align-baseline"
      >
        &nbsp;
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

/** Render passage with both underlines and blanks */
function renderPassageFormatted(text: string): React.ReactNode {
  // First split by __ underline __ markers
  const underlineRegex = /__([^_]+)__/g;
  const blankRegex = /_{3,}/g;
  const combinedRegex = /__([^_]+)__|_{3,}/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = combinedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }

    if (match[1]) {
      // __word__ underline
      parts.push(
        <span
          key={key++}
          className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900"
        >
          {match[1]}
        </span>
      );
    } else {
      // _____ blank
      parts.push(
        <span
          key={key++}
          className="inline-block min-w-[100px] border-b-2 border-blue-400 mx-1 align-baseline"
        >
          &nbsp;
        </span>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

/** Render numbered markers (①②③④⑤) with colored styling */
function renderWithMarkers(text: string): React.ReactNode {
  const markerRegex = /([①②③④⑤])/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = markerRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span
        key={key++}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold mx-0.5"
      >
        {match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

/** MC Option list */
function OptionList({
  options,
  correctAnswer,
}: {
  options: Array<{ label: string; text: string }>;
  correctAnswer: string;
}) {
  return (
    <div className="space-y-1.5 pl-1">
      {options.map((opt, i) => {
        const isCorrect = opt.label === correctAnswer;
        return (
          <div
            key={i}
            className={`text-[13px] flex items-start gap-2 ${
              isCorrect ? "text-blue-700 font-semibold" : "text-slate-600"
            }`}
          >
            <span
              className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isCorrect
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {opt.label}
            </span>
            <span>{opt.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Conditions box (서술형 조건 목록) */
function ConditionsBox({ conditions, label }: { conditions: string[]; label?: string }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 p-3 space-y-1.5">
      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
        {label || "조건"}
      </span>
      <ol className="space-y-1 list-decimal list-inside">
        {conditions.map((c, i) => (
          <li key={i} className="text-[12px] text-slate-700 leading-relaxed">
            {c}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Model answer display */
function ModelAnswer({ answer, label }: { answer: string; label?: string }) {
  return (
    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">
        {label || "모범 답안"}
      </span>
      <p className="text-[13px] font-semibold text-emerald-800 leading-relaxed">
        {answer}
      </p>
    </div>
  );
}

/** Given sentence highlight box */
function GivenSentenceBox({ sentence, label }: { sentence: string; label?: string }) {
  return (
    <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block mb-1">
        {label || "주어진 문장"}
      </span>
      <p className="text-[13px] text-indigo-900 leading-relaxed font-medium">
        {sentence}
      </p>
    </div>
  );
}

/** Collapsible explanation section */
function ExplanationSection({
  explanation,
  keyPoints,
  wrongOptionExplanations,
}: {
  explanation: string;
  keyPoints: string[];
  wrongOptionExplanations?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pt-1 border-t border-slate-100">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[11px] font-medium text-blue-500 hover:text-blue-700 transition-colors flex items-center gap-1"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {open ? "해설 접기" : "해설 보기"}
      </button>

      {open && (
        <div className="space-y-3 pt-2">
          {explanation && (
            <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-100">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">
                해설
              </span>
              <p className="text-[12px] text-slate-700 leading-relaxed">{explanation}</p>
            </div>
          )}

          {keyPoints && keyPoints.length > 0 && (
            <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-100">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block mb-1">
                핵심 포인트
              </span>
              <ul className="space-y-1">
                {keyPoints.map((kp, i) => (
                  <li key={i} className="text-[12px] text-slate-600 flex items-start gap-1.5">
                    <span className="text-blue-400 mt-0.5">-</span>
                    {kp}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {wrongOptionExplanations && Object.keys(wrongOptionExplanations).length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-100">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block mb-1">
                오답 분석
              </span>
              <div className="space-y-1">
                {Object.entries(wrongOptionExplanations).map(([num, exp]) => (
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
    </div>
  );
}

/** Answer line with correct answer */
function AnswerLine({ answer }: { answer: string }) {
  return (
    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
      <Check className="w-3.5 h-3.5 text-emerald-500" />
      <span className="text-[12px] text-slate-400">
        정답: <span className="font-bold text-emerald-600">{answer}</span>
      </span>
    </div>
  );
}

// ============================================================================
// Per-type renderers
// ============================================================================

function BlankInferenceRenderer({ q }: { q: BlankInferenceQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderBlanks(q.passageWithBlank)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

function GrammarErrorRenderer({ q }: { q: GrammarErrorQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderPassageFormatted(q.passageWithMarkers)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

function VocabChoiceRenderer({ q }: { q: VocabChoiceQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderPassageFormatted(q.passageWithMarkers)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

function SentenceOrderRenderer({ q }: { q: SentenceOrderQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <GivenSentenceBox sentence={q.givenSentence} />
      <div className="space-y-2">
        {q.paragraphs.map((p, i) => (
          <div key={i} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <span className="text-[11px] font-bold text-blue-600 mr-2">{p.label}</span>
            <span className="text-[12.5px] text-slate-700 leading-relaxed">{p.text}</span>
          </div>
        ))}
      </div>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

function SentenceInsertRenderer({ q }: { q: SentenceInsertQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <GivenSentenceBox sentence={q.givenSentence} label="삽입할 문장" />
      <PassageBlock>{renderWithMarkers(q.passageWithMarkers)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

function TopicMainIdeaRenderer({ q }: { q: TopicMainIdeaQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <div className="text-[11px] text-slate-400 italic flex items-center gap-1">
        <BookOpen className="w-3 h-3" />
        위 지문을 참고하세요
      </div>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

function TitleRenderer({ q }: { q: TitleQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <div className="text-[11px] text-slate-400 italic flex items-center gap-1">
        <BookOpen className="w-3 h-3" />
        위 지문을 참고하세요
      </div>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

function ReferenceRenderer({ q }: { q: ReferenceQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderUnderlinedText(q.passageWithUnderline)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

function ContentMatchRenderer({ q }: { q: ContentMatchQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <div className="text-[11px] text-slate-400 italic flex items-center gap-1">
        <BookOpen className="w-3 h-3" />
        위 지문을 참고하세요
      </div>
      <div className="text-[11px] font-medium text-slate-500">
        유형: <Badge variant="outline" className="text-[9px] ml-1">{q.matchType}</Badge>
      </div>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

function IrrelevantRenderer({ q }: { q: IrrelevantQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderWithMarkers(q.passageWithNumbers)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

// ── 서술형 ──────────────────────────────────────────────────

function ConditionalWritingRenderer({ q }: { q: ConditionalWritingQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <GivenSentenceBox sentence={q.referenceSentence} label="참조 문장" />
      <ConditionsBox conditions={q.conditions} />
      <ModelAnswer answer={q.modelAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
    </>
  );
}

function SentenceTransformRenderer({ q }: { q: SentenceTransformQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <GivenSentenceBox sentence={q.originalSentence} label="원래 문장" />
      <ConditionsBox conditions={q.conditions} label="전환 조건" />
      <ModelAnswer answer={q.modelAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
    </>
  );
}

function FillBlankKeyRenderer({ q }: { q: FillBlankKeyQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderBlanks(q.sentenceWithBlank)}</PassageBlock>
      <ModelAnswer answer={q.answer} label="정답" />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
    </>
  );
}

function SummaryCompleteRenderer({ q }: { q: SummaryCompleteQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock label="요약문">{renderBlanks(q.summaryWithBlanks)}</PassageBlock>
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-1">
        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">
          빈칸 정답
        </span>
        {q.blanks.map((b, i) => (
          <div key={i} className="text-[12px] text-emerald-800 flex items-center gap-2">
            <span className="font-bold">{b.label}</span>
            <span>{b.answer}</span>
          </div>
        ))}
      </div>
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
    </>
  );
}

function WordOrderRenderer({ q }: { q: WordOrderQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      {q.contextHint && (
        <div className="text-[12px] text-slate-500 italic">{q.contextHint}</div>
      )}
      <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
        {q.scrambledWords.map((word, i) => (
          <span
            key={i}
            className="inline-block px-2.5 py-1 rounded-md bg-white border border-slate-300 text-[12px] font-medium text-slate-700 shadow-sm"
          >
            {word}
          </span>
        ))}
      </div>
      <ModelAnswer answer={q.modelAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
    </>
  );
}

function GrammarCorrectionRenderer({ q }: { q: GrammarCorrectionQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <div className="rounded-lg bg-red-50 border border-red-200 p-3">
        <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block mb-1">
          오류 문장
        </span>
        <p className="text-[13px] text-slate-700 leading-relaxed">
          {q.sentenceWithError.split(q.errorPart).map((part, i, arr) => (
            <React.Fragment key={i}>
              {part}
              {i < arr.length - 1 && (
                <span className="underline decoration-wavy decoration-red-500 underline-offset-4 text-red-700 font-semibold">
                  {q.errorPart}
                </span>
              )}
            </React.Fragment>
          ))}
        </p>
      </div>
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2">
        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
          수정
        </span>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="line-through text-red-500">{q.errorPart}</span>
          <span className="text-slate-400">-&gt;</span>
          <span className="font-semibold text-emerald-700">{q.correctedPart}</span>
        </div>
        <p className="text-[13px] text-emerald-800 leading-relaxed font-medium">
          {q.correctedSentence}
        </p>
      </div>
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
    </>
  );
}

// ── 어휘 ────────────────────────────────────────────────────

function ContextMeaningRenderer({ q }: { q: ContextMeaningQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderUnderlinedText(q.passageWithUnderline)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

function SynonymRenderer({ q }: { q: SynonymQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 space-y-1">
        <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider block mb-1">
          대상 단어
        </span>
        <p className="text-[15px] font-bold text-violet-900">{q.targetWord}</p>
        <p className="text-[12px] text-slate-600 italic leading-relaxed">{q.contextSentence}</p>
      </div>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

function AntonymRenderer({ q }: { q: AntonymQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderPassageFormatted(q.passageWithMarkers)}</PassageBlock>
      {q.markedWords && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
            단어 - 반의어
          </span>
          <div className="space-y-1">
            {q.markedWords.map((mw, i) => (
              <div key={i} className="text-[12px] flex items-center gap-2">
                <span className="font-bold text-blue-600 w-6">{mw.label}</span>
                <span className="text-slate-700">{mw.word}</span>
                <span className="text-slate-400">--</span>
                <span className="text-slate-700">{mw.antonym}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerLine answer={q.correctAnswer} />
      <ExplanationSection
        explanation={q.explanation}
        keyPoints={q.keyPoints}
        wrongOptionExplanations={q.wrongOptionExplanations}
      />
    </>
  );
}

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
}: {
  question: any;
  index: number;
}) {
  const typeId = question._typeId as string | undefined;
  const typeLabel = question._typeLabel as string | undefined;
  const meta = typeId ? QUESTION_TYPE_META[typeId] : undefined;

  // Determine if this is a structured question by checking for type-specific fields
  const isStructured = typeId && hasStructuredFields(typeId, question);

  return (
    <div className="p-4 rounded-lg border border-slate-200 bg-white space-y-3">
      {/* Header */}
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
        {/* Hide duplicate "정답" if modelAnswer already shown above */}
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
