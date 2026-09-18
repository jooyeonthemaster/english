"use client";

import { Loader2, Save, Check, X } from "lucide-react";
import {
  SUBTYPE_TO_CATEGORY,
  LEARNING_CATEGORIES,
  LEARNING_SUBTYPE_LABELS,
  SUBTYPE_TO_INTERACTION,
} from "@/lib/learning-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  generating: boolean;
  generationProgress: Record<string, "pending" | "done" | "error">;
  generatedQuestions: Record<string, unknown>[] | null;
  onSave: () => void;
  onBack: () => void;
  saving: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryLabel(cat: string): string {
  return LEARNING_CATEGORIES.find((c) => c.value === cat)?.label || cat;
}

const INTERACTION_BADGES: Record<string, { label: string; color: string }> = {
  FOUR_CHOICE:   { label: "4지선다", color: "bg-blue-50 text-blue-600" },
  THREE_CHOICE:  { label: "3지선다", color: "bg-indigo-50 text-indigo-600" },
  BINARY_CHOICE: { label: "O/X",    color: "bg-amber-50 text-amber-600" },
  WORD_BANK:     { label: "배열",    color: "bg-emerald-50 text-emerald-600" },
  MATCHING:      { label: "매칭",    color: "bg-violet-50 text-violet-600" },
  TEXT_INPUT:    { label: "입력",    color: "bg-rose-50 text-rose-600" },
  TAP_TEXT:      { label: "탭",     color: "bg-cyan-50 text-cyan-600" },
};

// ---------------------------------------------------------------------------
// 인터랙션별 미리보기 렌더러
// ---------------------------------------------------------------------------

function QuestionPreview({ question }: { question: Record<string, unknown> }) {
  const typeId = question._typeId as string;
  const interaction = SUBTYPE_TO_INTERACTION[typeId] || "FOUR_CHOICE";
  const badge = INTERACTION_BADGES[interaction];

  return (
    <div className="bg-white rounded-xl border p-4 space-y-2.5">
      {/* 유형 + 인터랙션 뱃지 */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-slate-500">
          {LEARNING_SUBTYPE_LABELS[typeId] || typeId}
        </span>
        {badge && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.color}`}>
            {badge.label}
          </span>
        )}
      </div>

      {/* 문제 내용 — 인터랙션별 */}
      {(interaction === "FOUR_CHOICE" || interaction === "THREE_CHOICE") && (
        <ChoicePreview question={question} />
      )}
      {interaction === "BINARY_CHOICE" && <TrueFalsePreview question={question} />}
      {interaction === "MATCHING" && <MatchingPreview question={question} />}
      {interaction === "WORD_BANK" && <WordBankPreview question={question} />}
      {interaction === "TEXT_INPUT" && <TextInputPreview question={question} />}
      {interaction === "TAP_TEXT" && <TapTextPreview question={question} />}

      {/* 해설 */}
      {typeof question.explanation === "string" && question.explanation && (
        <p className="text-[11px] text-slate-400 border-t pt-2 mt-2">
          {question.explanation}
        </p>
      )}
    </div>
  );
}

function ChoicePreview({ question }: { question: Record<string, unknown> }) {
  const q = question as Record<string, unknown>;
  // 문제 텍스트 추출 (타입에 따라 다른 필드)
  const questionText = (q.word || q.koreanMeaning || q.englishDefinition || q.englishSentence ||
    q.koreanSentence || q.sentence || q.excerpt || q.question || "") as string;
  const context = (q.contextSentence || q.sentenceBefore || "") as string;
  const contextAfter = q.sentenceAfter as string | undefined;
  const rawOptions = q.options;
  const options: { label: string; text: string }[] = Array.isArray(rawOptions) ? rawOptions : [];
  const correct = q.correctAnswer as string;

  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium text-slate-800">{questionText}</p>
      {context && <p className="text-[11px] text-slate-400 italic">{context}</p>}
      {contextAfter && <p className="text-[11px] text-slate-400 italic">{contextAfter}</p>}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {options.map((opt, optIdx) => (
          <span
            key={`${opt.label}-${optIdx}`}
            className={`text-[11px] px-2 py-1 rounded-lg border ${
              opt.label === correct
                ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold"
                : "bg-slate-50 border-slate-200 text-slate-600"
            }`}
          >
            {opt.label}. {opt.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function TrueFalsePreview({ question }: { question: Record<string, unknown> }) {
  // TRUE_FALSE는 statement, GRAM_BINARY는 sentence 필드 사용
  const statement = (question.statement || question.sentence || "") as string;
  const isTrue = (question.isTrue ?? question.isCorrect ?? true) as boolean;
  const grammarPoint = question.grammarPoint as string | undefined;
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium text-slate-800">{statement}</p>
      {grammarPoint && <span className="text-[10px] text-violet-500 font-medium">{grammarPoint}</span>}
      <div className="flex gap-2">
        <span className={`text-[12px] px-3 py-1 rounded-lg border font-medium ${
          isTrue ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-500"
        }`}>
          <Check className="w-3 h-3 inline mr-0.5" /> O
        </span>
        <span className={`text-[12px] px-3 py-1 rounded-lg border font-medium ${
          !isTrue ? "bg-red-50 border-red-300 text-red-700" : "bg-slate-50 border-slate-200 text-slate-500"
        }`}>
          <X className="w-3 h-3 inline mr-0.5" /> X
        </span>
      </div>
    </div>
  );
}

function MatchingPreview({ question }: { question: Record<string, unknown> }) {
  const pairs = (question.pairs || []) as { en: string; ko: string }[];
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {pairs.map((pair, i) => (
        <div key={i} className="contents">
          <span className="text-[12px] px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-medium">
            {pair.en}
          </span>
          <span className="text-[12px] px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
            {pair.ko}
          </span>
        </div>
      ))}
    </div>
  );
}

function WordBankPreview({ question }: { question: Record<string, unknown> }) {
  // WORD_ARRANGE: koreanSentence + correctOrder(string[]) + distractorWords
  // SENT_CHUNK_ORDER: koreanHint + chunks(string[]) + correctOrder(number[])
  const korean = (question.koreanSentence || question.koreanHint || "") as string;
  const chunks = question.chunks as string[] | undefined;
  const correctOrderStrings = !chunks ? (question.correctOrder || []) as string[] : [];
  const correctOrderIndices = chunks ? (question.correctOrder || []) as number[] : [];
  const distractors = (question.distractorWords || []) as string[];

  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium text-slate-800">{korean}</p>
      <div className="flex flex-wrap gap-1">
        {chunks ? (
          // SENT_CHUNK_ORDER: 올바른 순서대로 청크 표시
          correctOrderIndices.map((idx, i) => (
            <span key={i} className="text-[11px] px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-700 font-medium">
              {chunks[idx]}
            </span>
          ))
        ) : (
          // WORD_ARRANGE: 문자열 배열 그대로
          correctOrderStrings.map((w, i) => (
            <span key={i} className="text-[11px] px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-700 font-medium">
              {w}
            </span>
          ))
        )}
        {distractors.map((w, i) => (
          <span key={`d-${i}`} className="text-[11px] px-2 py-1 rounded-lg bg-red-50 border border-red-200 text-red-400 line-through">
            {w}
          </span>
        ))}
      </div>
    </div>
  );
}

function TextInputPreview({ question }: { question: Record<string, unknown> }) {
  // WORD_SPELL: koreanMeaning + hint, ERROR_CORRECT: sentence + errorPart, GRAM_TRANSFORM: originalSentence + instruction
  const text = (question.koreanMeaning || question.sentence || question.originalSentence || "") as string;
  const hint = question.hint as string | undefined;
  const instruction = question.instruction as string | undefined;
  const correct = (question.correctAnswer || question.correction) as string;
  const errorPart = question.errorPart as string | undefined;
  const grammarPoint = question.grammarPoint as string | undefined;
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium text-slate-800">
        {text}
        {errorPart && <span className="text-red-500 underline ml-1">{errorPart}</span>}
      </p>
      {instruction && <p className="text-[11px] text-indigo-600 font-medium">→ {instruction}</p>}
      {hint && <span className="text-[11px] text-slate-400">힌트: {hint}...</span>}
      {grammarPoint && <span className="text-[10px] text-violet-500 font-medium ml-2">{grammarPoint}</span>}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-400">정답:</span>
        <span className="text-[12px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
          {correct}
        </span>
      </div>
    </div>
  );
}

function TapTextPreview({ question }: { question: Record<string, unknown> }) {
  const words = (question.words || []) as string[];
  const errorWord = question.errorWord as string;
  const correction = question.correction as string;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {words.map((w, i) => (
          <span
            key={i}
            className={`text-[12px] px-2 py-1 rounded-lg border ${
              w === errorWord
                ? "bg-red-50 border-red-300 text-red-700 font-semibold line-through"
                : "bg-slate-50 border-slate-200 text-slate-700"
            }`}
          >
            {w}
          </span>
        ))}
      </div>
      <span className="text-[11px] text-emerald-600">
        {errorWord} → {correction}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenerationResults({
  generating,
  generationProgress,
  generatedQuestions,
  onSave,
  onBack,
  saving,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Progress — 카테고리 단위 */}
      {generating && (
        <div className="bg-white rounded-2xl border p-5 space-y-3">
          <span className="text-sm font-semibold text-slate-900">생성 진행 상황</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(generationProgress).map(([cat, status]) => (
              <span
                key={cat}
                className={`text-[11px] font-medium px-3 py-1.5 rounded-full border ${
                  status === "done"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : status === "error"
                    ? "bg-red-50 text-red-600 border-red-200"
                    : "bg-blue-50 text-blue-600 border-blue-200 animate-pulse"
                }`}
              >
                {categoryLabel(cat)}
                {status === "pending" && <Loader2 className="w-3 h-3 ml-1 inline animate-spin" />}
                {status === "done" && <Check className="w-3 h-3 ml-1 inline" />}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {generatedQuestions && generatedQuestions.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-slate-900">
              {generatedQuestions.length}개 학습 문제 생성됨
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onBack}
                className="h-10 px-4 text-[13px] font-medium rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                다시 설정
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="h-10 px-4 text-[13px] font-semibold rounded-xl text-white transition-colors flex items-center gap-1.5 disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                학습 문제로 저장
              </button>
            </div>
          </div>

          {/* Group by category, then subType */}
          {(() => {
            const byCat: Record<string, Record<string, unknown>[]> = {};
            generatedQuestions.forEach((q) => {
              const cat = SUBTYPE_TO_CATEGORY[q._typeId as string] || "VOCAB";
              if (!byCat[cat]) byCat[cat] = [];
              byCat[cat].push(q);
            });

            return Object.entries(byCat).map(([cat, qs]) => (
              <div key={cat} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-700">{categoryLabel(cat)}</span>
                  <span className="text-[11px] text-slate-400">{qs.length}문제</span>
                </div>

                {(() => {
                  const byType: Record<string, Record<string, unknown>[]> = {};
                  qs.forEach((q) => {
                    const tl = (q._typeLabel || "기타") as string;
                    if (!byType[tl]) byType[tl] = [];
                    byType[tl].push(q);
                  });

                  return Object.entries(byType).map(([tl, typeQs]) => (
                    <div key={tl} className="space-y-2 ml-2">
                      <span className="text-[12px] font-semibold text-slate-500">{tl} ({typeQs.length})</span>
                      <div className="space-y-2">
                        {typeQs.map((q, idx) => (
                          <QuestionPreview key={idx} question={q} />
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ));
          })()}

          {/* Bottom actions */}
          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={onBack}
              className="flex-1 h-11 px-4 text-[13px] font-medium rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              다시 설정
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex-1 h-11 px-4 text-[13px] font-semibold rounded-xl text-white transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              학습 문제로 저장
            </button>
          </div>
        </>
      )}

      {/* Empty state */}
      {!generating && generatedQuestions && generatedQuestions.length === 0 && (
        <div className="text-center py-20 text-sm text-slate-400 bg-white rounded-2xl border">
          문제 생성에 실패했습니다. 다시 시도해주세요.
        </div>
      )}
    </div>
  );
}
