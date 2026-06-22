"use client";

import React from "react";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  type BlankInferenceQuestion,
  type GrammarErrorQuestion,
  type GrammarChoiceComboQuestion,
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
  type SummaryWritingQuestion,
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
  renderMarkedSentencePassage,
  OptionList,
  ConditionsBox,
  ModelAnswer,
  GivenSentenceBox,
  ExplanationSection,
  AnswerLine,
  AnswerRevealSection,
} from "./question-renderer-primitives";
import { SelectableBlock, blockExcerpt } from "./question-renderer-blocks";
import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryPairOption,
  readSummaryBlankAnswersFromQuestionLike,
} from "@/lib/summary-complete-mc";
import { summaryWritingMaskedSummary } from "@/lib/summary-writing";
import {
  buildGrammarCorrectionAnswerSlots,
  formatGrammarCorrectionCorrectAnswer,
  grammarCorrectionErrorSentenceForQuestionText,
} from "@/lib/grammar-correction-display";
import { formatVocabChoiceCorrectAnswer } from "@/lib/question-answer-display";
import {
  formatInlineMarkersForSubtype,
  shouldRenderOptionListForSubtype,
} from "@/components/exams/paper-builder/option-display";

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
      {/* 어법 판단은 지문 마커(①②③④⑤)만 쓰는 inline-marked 유형 — 시험지와 동일하게
          하단 보기 리스트를 렌더하지 않는다(같은 게이트 공유). 정답·표현은 아래
          '밑줄 표현 분석'과 정답 줄에 그대로 남는다. */}
      {shouldRenderOptionListForSubtype("GRAMMAR_ERROR") && (
        <OptionList options={q.options} correctAnswer={q.correctAnswer} correctAnswers={q.correctAnswers} />
      )}
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

export function GrammarChoiceComboRenderer({ q }: { q: GrammarChoiceComboQuestion }) {
  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderPassageFormatted(q.passageWithMarkers, "GRAMMAR_CHOICE_COMBO")}</PassageBlock>
      <OptionList options={q.options} correctAnswer={q.correctAnswer} />
      <AnswerRevealSection>
        {q.slots && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">네모 표현 분석</span>
            <div className="space-y-1">
              {q.slots.map((slot, i) => (
                <div key={i} className="text-[12px] flex items-start gap-2 text-slate-600">
                  <span className="font-bold text-blue-600 w-6 shrink-0">{slot.label}</span>
                  <span className="text-emerald-700 font-semibold">{slot.correctExpression}</span>
                  <span className="text-red-700 line-through">{slot.wrongExpression}</span>
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

export function VocabChoiceRenderer({ q }: { q: VocabChoiceQuestion }) {
  const answer = formatVocabChoiceCorrectAnswer(
    q.correctAnswer,
    (q as VocabChoiceQuestion & { correctAnswers?: string[] }).correctAnswers,
  );

  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderPassageFormatted(formatInlineMarkersForSubtype(q.passageWithMarkers, "VOCAB_CHOICE"))}</PassageBlock>
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
        <AnswerLine answer={answer || q.correctAnswer} />
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
          <SelectableBlock
            key={i}
            blockId={`paragraph:${p.label}`}
            label={`단락 ${p.label}`}
            field="paragraphs"
            excerpt={blockExcerpt(p.text)}
          >
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <span className="text-[11px] font-bold text-blue-600 mr-2">{p.label}</span>
              <span className="text-[12.5px] text-slate-700 leading-relaxed">{p.text}</span>
            </div>
          </SelectableBlock>
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
        <SelectableBlock blockId="underlinedPronoun" label="밑줄 대명사" field="underlinedPronoun" excerpt={blockExcerpt(q.underlinedPronoun)}>
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">밑줄 대명사</span>
            <p className="text-[15px] font-bold text-indigo-900 mt-0.5">{q.underlinedPronoun}</p>
          </div>
        </SelectableBlock>
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

function summaryBlankSortKey(key: string) {
  const match = key.match(/^blank([A-Z])$/i);
  return match ? match[1].toUpperCase().charCodeAt(0) : Number.MAX_SAFE_INTEGER;
}

function summaryBlankLabelFromKey(key: string) {
  const match = key.match(/^blank([A-Z])$/i);
  return match ? `(${match[1].toUpperCase()})` : `(${key})`;
}

function formatSummaryPairOptionText(option: SummaryCompleteMcQuestion["options"][number]) {
  const pair = readSummaryPairOption(option);
  const entries = Object.entries(pair.values || {})
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .sort(([left], [right]) => summaryBlankSortKey(left) - summaryBlankSortKey(right));

  if (entries.length > 0) {
    return entries
      .map(([key, value]) => `${summaryBlankLabelFromKey(key)} ${value}`)
      .join(" / ");
  }

  return typeof option.text === "string" ? option.text : "";
}

function renderSummaryBlankMarkers(text: string) {
  return text.split(/(\([A-Z]\)|_{3,})/g).map((part, index) => {
    if (/^\([A-Z]\)$/.test(part)) {
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
      <PassageBlock>{renderMarkedSentencePassage(q.passageWithNumbers)}</PassageBlock>
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
      <ConditionsBox conditions={q.conditions} label="전환 조건" blockId="conditions" />
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

export function SummaryWritingRenderer({ q }: { q: SummaryWritingQuestion }) {
  // 👁학생노출: 마스킹 통과한 요약문 / 해석 / 보기 / 앞글자. 정답계열은 AnswerRevealSection 안에서만.
  const maskedSummary = summaryWritingMaskedSummary(q);
  const koreanGloss = typeof q.koreanGloss === "string" ? q.koreanGloss.trim() : "";
  // 칩은 wordBank 배열을 직접 사용한다(' / ' join→split 왕복 금지 — chunk 모드에서 슬래시 든 칩이 잘못 분할됨).
  const wordBank = Array.isArray(q.wordBank)
    ? q.wordBank.map((w) => (typeof w === "string" ? w.trim() : "")).filter(Boolean)
    : [];
  // 앞글자 단서는 별도 줄이 아니라 [요약문]의 빈칸이 단어별 슬롯(칸마다 앞글자)으로 렌더된다
  // (summaryWritingMaskedSummary 가 clueMode=firstLetter 면 "(A) p____ s____ ..." 생성).
  // [빈칸 해석](blankGlosses)는 v1 학생면에 노출하지 않는다 — 빈칸별 1:1 직역이 [보기]와 결합 시
  // 정답을 노출(시각검수 발견). 전체 의미는 [해석](koreanGloss)만. (방어: 설령 structuredData에
  // blankGlosses가 있어도 렌더하지 않는다.)
  // 🔒비밀: 빈칸별 모범 영작/동치답은 AnswerRevealSection 내부에서만 렌더.
  const blanks = Array.isArray(q.blanks) ? q.blanks : [];

  return (
    <>
      <Direction text={q.direction} />
      {/* [해석] — 회색(slate) 박스. orange/amber 금지. PassageBlock=slate-50 */}
      {koreanGloss && <PassageBlock label="해석">{koreanGloss}</PassageBlock>}
      {/* [요약문] — (A)(B) 파란 배지 + 파란 밑줄선. 마스킹 통과본만(정답어구 미포함) */}
      <PassageBlock label="요약문">{renderSummaryBlankMarkers(maskedSummary)}</PassageBlock>
      {/* [보기] — WordOrder 칩 스타일. 미끼도 동일 스타일(시각 구분 없음). 비밀 미끼목록 미노출 */}
      {wordBank.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
          {wordBank.map((word, i) => (
            <span key={i} className="inline-block px-2.5 py-1 rounded-md bg-white border border-slate-300 text-[12px] font-medium text-slate-700 shadow-sm">
              {word}
            </span>
          ))}
        </div>
      )}
      <AnswerRevealSection>
        <ModelAnswer answer={q.modelAnswer} />
        {blanks.length > 0 && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-1">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">빈칸 정답</span>
            {blanks.map((b, i) => (
              <div key={i} className="text-[12px] text-emerald-800 flex items-start gap-2">
                <span className="font-bold shrink-0">{b.label}</span>
                <span>
                  {b.answer}
                  {Array.isArray(b.acceptableVariants) && b.acceptableVariants.length > 0 && (
                    <span className="text-emerald-600"> / {b.acceptableVariants.join(" / ")}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        {Array.isArray(q.acceptableVariants) && q.acceptableVariants.length > 0 && (
          <ConditionsBox conditions={q.acceptableVariants} label="동치 정답" />
        )}
        {Array.isArray(q.scoringCriteria) && q.scoringCriteria.length > 0 && (
          <ConditionsBox conditions={q.scoringCriteria} label="채점 기준" />
        )}
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
      <SelectableBlock
        blockId="scrambled"
        label="배열 단어"
        field="scrambledWords"
        excerpt={blockExcerpt(Array.isArray(q.scrambledWords) ? q.scrambledWords.join(" · ") : "")}
      >
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
          {q.scrambledWords.map((word, i) => (
            <span key={i} className="inline-block px-2.5 py-1 rounded-md bg-white border border-slate-300 text-[12px] font-medium text-slate-700 shadow-sm">
              {word}
            </span>
          ))}
        </div>
      </SelectableBlock>
      <AnswerRevealSection>
        <ModelAnswer answer={q.modelAnswer} />
        <AnswerLine answer={q.correctAnswer} />
        <ExplanationSection explanation={q.explanation} keyPoints={q.keyPoints} />
      </AnswerRevealSection>
    </>
  );
}

export function GrammarCorrectionRenderer({ q }: { q: GrammarCorrectionQuestion }) {
  const errorSegments = Array.isArray(q.underlinedSegments)
    ? q.underlinedSegments.filter((item) => item.isError)
    : [];
  const corrections = errorSegments.length
    ? errorSegments.map((item, index) => ({
        error: item.errorPart || q.errorParts?.[index] || (index === 0 ? q.errorPart : ""),
        correction:
          item.correctedPart ||
          q.correctedParts?.[index] ||
          (index === 0 ? q.correctedPart : ""),
      }))
    : [{
        error: q.errorPart || "",
        correction: q.correctedPart || q.correctAnswer,
      }];
  const passageWithLabels = grammarCorrectionErrorSentenceForQuestionText(q);
  const answerSlots = buildGrammarCorrectionAnswerSlots(q).split("\n").filter(Boolean);
  const formattedAnswer = formatGrammarCorrectionCorrectAnswer(q) || q.correctAnswer;

  return (
    <>
      <Direction text={q.direction} />
      <PassageBlock>{renderPassageFormatted(passageWithLabels || "")}</PassageBlock>
      {answerSlots.length > 0 && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          {answerSlots.map((slot, index) => (
            <div key={index} className="font-mono text-[12.5px] text-slate-700">
              {renderPassageFormatted(slot)}
            </div>
          ))}
        </div>
      )}
      <AnswerRevealSection>
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">수정</span>
          {corrections.map((item, index) => (
            <div key={index} className="flex items-center gap-2 text-[12px]">
              {corrections.length > 1 && (
                <span className="w-4 shrink-0 font-bold text-emerald-700">{index + 1}.</span>
              )}
              <span className="line-through text-red-500">{item.error}</span>
              <span className="text-slate-400">-&gt;</span>
              <span className="font-semibold text-emerald-700">{item.correction}</span>
            </div>
          ))}
          {q.correctedSentence && (
            <p className="text-[13px] text-emerald-800 leading-relaxed font-medium">{q.correctedSentence}</p>
          )}
        </div>
        <AnswerLine answer={formattedAnswer} />
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
        <SelectableBlock blockId="underlinedWord" label="밑줄 단어" field="underlinedWord" excerpt={blockExcerpt(q.underlinedWord)}>
          <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2">
            <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">밑줄 단어</span>
            <p className="text-[15px] font-bold text-violet-900 mt-0.5">{q.underlinedWord}</p>
          </div>
        </SelectableBlock>
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
                <div
                  key={i}
                  className={`text-[12px] flex items-center gap-2 ${mw.isIncorrectPair ? "text-red-700" : ""}`}
                >
                  <span className="font-bold text-blue-600 w-6">{mw.label}</span>
                  <span className="text-slate-700">{mw.word}</span>
                  <span className="text-slate-400">--</span>
                  <span className={mw.isIncorrectPair ? "line-through" : "text-slate-700"}>{mw.antonym}</span>
                  {mw.isIncorrectPair && mw.correctAntonym && (
                    <span className="text-emerald-700 font-semibold">→ {mw.correctAntonym}</span>
                  )}
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
