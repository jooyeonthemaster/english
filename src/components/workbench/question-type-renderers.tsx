"use client";

import React from "react";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  type BlankInferenceQuestion,
  type GrammarErrorQuestion,
  type VocabChoiceQuestion,
  type SentenceOrderQuestion,
  type SentenceInsertQuestion,
  type TopicMainIdeaQuestion,
  type TitleQuestion,
  type ImpliedMeaningQuestion,
  type ReferenceQuestion,
  type ContentMatchQuestion,
  type SummaryCompleteMcQuestion,
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
import {
  Direction,
  PassageBlock,
  renderUnderlinedText,
  renderBlanks,
  renderPassageFormatted,
  renderWithMarkers,
  OptionList,
  ConditionsBox,
  ModelAnswer,
  GivenSentenceBox,
  ExplanationSection,
  AnswerLine,
  AnswerRevealSection,
} from "./question-renderer-primitives";
import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryBlankAnswersFromQuestionLike,
} from "@/lib/summary-complete-mc";

// ============================================================================
// 수능/모의고사 객관식 (10 types)
// ============================================================================

function SourcePassageBlock({ q }: { q: { _sourcePassageContent?: unknown } }) {
  const sourcePassage =
    typeof q._sourcePassageContent === "string"
      ? q._sourcePassageContent.trim()
      : "";

  if (sourcePassage) {
    return <PassageBlock>{sourcePassage}</PassageBlock>;
  }

  return (
    <div className="text-[11px] text-slate-400 italic flex items-center gap-1">
      <BookOpen className="w-3 h-3" />원문 지문을 참고하세요
    </div>
  );
}

export function BlankInferenceRenderer({ q }: { q: BlankInferenceQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderBlanks(q.passageWithBlank)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

function getGrammarDisplayExpression(me: GrammarErrorQuestion["markedExpressions"][number]): string {
  return me.isError && me.errorExpression ? me.errorExpression : me.expression;
}

function getGrammarCorrection(me: GrammarErrorQuestion["markedExpressions"][number]): string | undefined {
  if (!me.isError) return undefined;
  if (me.correction) return me.correction;
  return me.errorExpression && me.errorExpression !== me.expression ? me.expression : undefined;
}

export function GrammarErrorRenderer({ q }: { q: GrammarErrorQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderPassageFormatted(q.passageWithMarkers)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} correctAnswers={q.correctAnswers} />
      <AnswerRevealSection>
        {q.markedExpressions && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">밑줄 표현 분석</span>
            <div className="space-y-1">
              {q.markedExpressions.map((me, i) => {
                const displayExpression = getGrammarDisplayExpression(me);
                const correction = getGrammarCorrection(me);
                const showCorrection = correction && correction !== displayExpression;

                return (
                  <div key={i} className={`text-[12px] flex items-start gap-2 ${me.isError ? "text-red-700" : "text-slate-600"}`}>
                    <span className="font-bold text-blue-600 w-6 shrink-0">{me.label}</span>
                    <span className={me.isError ? "line-through" : ""}>{displayExpression}</span>
                    {showCorrection && <span className="text-emerald-700 font-semibold">→ {correction}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

export function VocabChoiceRenderer({ q }: { q: VocabChoiceQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderPassageFormatted(q.passageWithMarkers)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        {q.markedWords && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">밑줄 어휘 분석</span>
            <div className="space-y-1">
              {q.markedWords.map((mw, i) => (
                <div key={i} className={`text-[12px] flex items-start gap-2 ${mw.isInappropriate ? "text-red-700" : "text-slate-600"}`}>
                  <span className="font-bold text-blue-600 w-6 shrink-0">{mw.label}</span>
                  <span className={mw.isInappropriate ? "line-through" : ""}>{mw.word}</span>
                  {mw.isInappropriate && mw.betterWord && <span className="text-emerald-700 font-semibold">→ {mw.betterWord}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

export function SentenceOrderRenderer({ q }: { q: SentenceOrderQuestion }) {
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
      <AnswerRevealSection>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

export function SentenceInsertRenderer({ q }: { q: SentenceInsertQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <GivenSentenceBox sentence={q.givenSentence} label="삽입할 문장" />
      <PassageBlock>{renderWithMarkers(q.passageWithMarkers)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

export function TopicMainIdeaRenderer({ q }: { q: TopicMainIdeaQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <SourcePassageBlock q={q as TopicMainIdeaQuestion & { _sourcePassageContent?: unknown }} />
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

export function TitleRenderer({ q }: { q: TitleQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <SourcePassageBlock q={q as TitleQuestion & { _sourcePassageContent?: unknown }} />
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

export function ImpliedMeaningRenderer({ q }: { q: ImpliedMeaningQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderUnderlinedText(q.passageWithUnderline)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

export function ReferenceRenderer({ q }: { q: ReferenceQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      {q.underlinedPronoun && (
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">밑줄 대명사</span>
          <p className="text-[15px] font-bold text-indigo-900 mt-0.5">{q.underlinedPronoun}</p>
        </div>
      )}
      <PassageBlock>{renderUnderlinedText(q.passageWithUnderline)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

export function ContentMatchRenderer({ q }: { q: ContentMatchQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <SourcePassageBlock q={q as ContentMatchQuestion & { _sourcePassageContent?: unknown }} />
      <div className="text-[11px] font-medium text-slate-500">
        유형: <Badge variant="outline" className="text-[9px] ml-1">{q.matchType}</Badge>
      </div>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

function getSummaryPairOption(option: SummaryCompleteMcQuestion["options"][number]) {
  const blankA = typeof option.blankA === "string" ? option.blankA.trim() : "";
  const blankB = typeof option.blankB === "string" ? option.blankB.trim() : "";
  if (blankA || blankB) return { blankA, blankB };

  const text = typeof option.text === "string" ? option.text.trim() : "";
  const parts = text
    .replace(/^\s*(?:[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\((?:[A-Ja-j]|\d{1,3})\)|(?:[A-Ja-j]|\d{1,3})[.)])\s*/, "")
    .split(/\s*(?:……|\.{3,}|…|\/|\||;|,|\s[-–—]\s)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    blankA: parts[0] ?? text,
    blankB: parts.slice(1).join(" "),
  };
}

function formatSummaryPairOptionText(option: SummaryCompleteMcQuestion["options"][number]) {
  const pair = getSummaryPairOption(option);
  if (pair.blankA || pair.blankB) {
    return `(A) ${pair.blankA || "-"} / (B) ${pair.blankB || "-"}`;
  }
  return typeof option.text === "string" ? option.text : "";
}

function renderSummaryBlankMarkers(text: string) {
  return text.split(/(\([AB]\)|_{3,})/g).map((part, index) => {
    if (part === "(A)" || part === "(B)") {
      return (
        <span
          key={index}
          className="mx-1 inline-flex min-w-10 items-center justify-center rounded-[4px] border border-blue-300 bg-blue-50 px-2 py-0.5 text-[12px] font-bold text-blue-700"
        >
          {part}
        </span>
      );
    }
    if (/^_{3,}$/.test(part)) {
      return (
        <span
          key={index}
          className="mx-1 inline-block min-w-[72px] border-b-2 border-blue-400 align-baseline"
        >
          &nbsp;
        </span>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

export function SummaryCompleteMcRenderer({ q }: { q: SummaryCompleteMcQuestion }) {
  const summaryForDisplay = formatSummaryCompleteMcSummaryForDisplay(
    q.summaryWithBlanks,
    readSummaryBlankAnswersFromQuestionLike(q),
  );
  const options = q.options.map((option) => ({
    label: option.label,
    text: formatSummaryPairOptionText(option),
  }));

  return (
    <>
      <Direction text={q.direction} />
      <SourcePassageBlock q={q as SummaryCompleteMcQuestion & { _sourcePassageContent?: unknown }} />
      <PassageBlock label="요약문">{renderSummaryBlankMarkers(summaryForDisplay)}</PassageBlock>
      <OptionList options={options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

export function IrrelevantRenderer({ q }: { q: IrrelevantQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderWithMarkers(q.passageWithNumbers)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

// ============================================================================
// 내신 서술형 (6 types)
// ============================================================================

export function ConditionalWritingRenderer({ q }: { q: ConditionalWritingQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <GivenSentenceBox sentence={q.referenceSentence} label="영작할 우리말" />
      <ConditionsBox conditions={q.conditions} />
      <AnswerRevealSection>
        <ModelAnswer answer={q.modelAnswer} />
        {q.scoringCriteria && q.scoringCriteria.length > 0 && (
          <ConditionsBox conditions={q.scoringCriteria} label="채점 기준" />
        )}
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
      </AnswerRevealSection>
    </>
  );
}

export function SentenceTransformRenderer({ q }: { q: SentenceTransformQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <GivenSentenceBox sentence={q.originalSentence} label="원래 문장" />
      <ConditionsBox conditions={q.conditions} label="전환 조건" />
      <AnswerRevealSection>
        <ModelAnswer answer={q.modelAnswer} />
        {q.scoringCriteria && q.scoringCriteria.length > 0 && (
          <ConditionsBox conditions={q.scoringCriteria} label="채점 기준" />
        )}
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
      </AnswerRevealSection>
    </>
  );
}

export function FillBlankKeyRenderer({ q }: { q: FillBlankKeyQuestion }) {
  const displayText = q.passageWithBlank || q.sentenceWithBlank;

  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderBlanks(displayText)}</PassageBlock>
      <AnswerRevealSection>
        <ModelAnswer answer={q.answer} label="정답" />
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
      </AnswerRevealSection>
    </>
  );
}

export function SummaryCompleteRenderer({ q }: { q: SummaryCompleteQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock label="요약문">{renderBlanks(q.summaryWithBlanks)}</PassageBlock>
      <AnswerRevealSection>
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-1">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">빈칸 정답</span>
          {q.blanks.map((b, i) => (
            <div key={i} className="text-[12px] text-emerald-800 flex items-center gap-2">
              <span className="font-bold">{b.label}</span>
              <span>{b.answer}</span>
            </div>
          ))}
        </div>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
      </AnswerRevealSection>
    </>
  );
}

export function WordOrderRenderer({ q }: { q: WordOrderQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      {q.contextHint && (
        <div className="text-[12px] text-slate-500 italic">{q.contextHint}</div>
      )}
      <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
        {q.scrambledWords.map((word, i) => (
          <span key={i} className="inline-block px-2.5 py-1 rounded-md bg-white border border-slate-300 text-[12px] font-medium text-slate-700 shadow-sm">
            {word}
          </span>
        ))}
      </div>
      <AnswerRevealSection>
        <ModelAnswer answer={q.modelAnswer} />
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
      </AnswerRevealSection>
    </>
  );
}

export function GrammarCorrectionRenderer({ q }: { q: GrammarCorrectionQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <div className="rounded-lg bg-red-50 border border-red-200 p-3">
        <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block mb-1">오류 문장</span>
        <p className="text-[13px] text-slate-700 leading-relaxed">
          {q.sentenceWithError.split(q.errorPart).map((part, i, arr) => (
            <React.Fragment key={i}>
              {part}
              {i < arr.length - 1 && (
                <span className="underline decoration-wavy decoration-red-500 underline-offset-4 text-red-700 font-semibold">{q.errorPart}</span>
              )}
            </React.Fragment>
          ))}
        </p>
      </div>
      <AnswerRevealSection>
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">수정</span>
          <div className="flex items-center gap-2 text-[12px]">
            <span className="line-through text-red-500">{q.errorPart}</span>
            <span className="text-slate-400">-&gt;</span>
            <span className="font-semibold text-emerald-700">{q.correctedPart}</span>
          </div>
          <p className="text-[13px] text-emerald-800 leading-relaxed font-medium">{q.correctedSentence}</p>
        </div>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
      </AnswerRevealSection>
    </>
  );
}

// ============================================================================
// 어휘 (3 types)
// ============================================================================

export function ContextMeaningRenderer({ q }: { q: ContextMeaningQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      {q.underlinedWord && (
        <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2">
          <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">밑줄 단어</span>
          <p className="text-[15px] font-bold text-violet-900 mt-0.5">{q.underlinedWord}</p>
        </div>
      )}
      <PassageBlock>{renderUnderlinedText(q.passageWithUnderline)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

export function SynonymRenderer({ q }: { q: SynonymQuestion }) {
  const displayPassage =
    q.passageWithUnderline ||
    (q.contextSentence && q.targetWord
      ? q.contextSentence.replace(
          new RegExp(`\\b${q.targetWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
          (match) => `__${match}__`,
        )
      : q.contextSentence);

  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderUnderlinedText(displayPassage ?? "")}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}

export function AntonymRenderer({ q }: { q: AntonymQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderPassageFormatted(q.passageWithMarkers)}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        {q.markedWords && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">단어 - 반의어</span>
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
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} wrongOptionExplanations={q.wrongOptionExplanations} />
      </AnswerRevealSection>
    </>
  );
}
