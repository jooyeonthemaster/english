"use client";

import { QUESTION_GENERATION_TARGET, MAX_CUSTOM_TOTAL } from "@/lib/learning-constants";
import type { PassageItem } from "./passage-selector";

// ---------------------------------------------------------------------------
// 학습 카테고리별 subType 그룹 (듀오링고 스타일 23종)
// ---------------------------------------------------------------------------

const CATEGORY_GROUPS = [
  {
    category: "VOCAB" as const,
    label: "어휘",
    color: "blue",
    target: QUESTION_GENERATION_TARGET.VOCAB,
    items: [
      { id: "WORD_MEANING", label: "영→한 뜻" },
      { id: "WORD_MEANING_REVERSE", label: "한→영 뜻" },
      { id: "WORD_FILL", label: "빈칸 채우기" },
      { id: "WORD_MATCH", label: "매칭" },
      { id: "WORD_SPELL", label: "스펠링" },
      { id: "VOCAB_SYNONYM", label: "유의어/반의어" },
      { id: "VOCAB_DEFINITION", label: "영영풀이" },
      { id: "VOCAB_COLLOCATION", label: "연어" },
      { id: "VOCAB_CONFUSABLE", label: "혼동 단어" },
    ],
  },
  {
    category: "INTERPRETATION" as const,
    label: "해석",
    color: "indigo",
    target: QUESTION_GENERATION_TARGET.INTERPRETATION,
    items: [
      { id: "SENTENCE_INTERPRET", label: "해석 고르기" },
      { id: "SENTENCE_COMPLETE", label: "영문 고르기" },
      { id: "WORD_ARRANGE", label: "단어 배열" },
      { id: "KEY_EXPRESSION", label: "핵심 표현" },
      { id: "SENT_CHUNK_ORDER", label: "끊어읽기" },
    ],
  },
  {
    category: "GRAMMAR" as const,
    label: "문법",
    color: "violet",
    target: QUESTION_GENERATION_TARGET.GRAMMAR,
    items: [
      { id: "GRAMMAR_SELECT", label: "문법 고르기" },
      { id: "ERROR_FIND", label: "오류 찾기" },
      { id: "ERROR_CORRECT", label: "오류 수정" },
      { id: "GRAM_TRANSFORM", label: "문장 전환" },
      { id: "GRAM_BINARY", label: "문법 O/X" },
    ],
  },
  {
    category: "COMPREHENSION" as const,
    label: "이해",
    color: "amber",
    target: QUESTION_GENERATION_TARGET.COMPREHENSION,
    items: [
      { id: "TRUE_FALSE", label: "O/X" },
      { id: "CONTENT_QUESTION", label: "내용 이해" },
      { id: "PASSAGE_FILL", label: "지문 빈칸" },
      { id: "CONNECTOR_FILL", label: "연결어" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  selectedPassage: PassageItem;
  typeCounts: Record<string, number>;
  autoFill: boolean;
  onTypeCountChange: (id: string, count: number) => void;
  onResetAll: () => void;
  onToggleAutoFill: () => void;
  onBack: () => void;
  onGenerate: () => void;
  totalQuestions: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CategoryConfig({
  selectedPassage,
  typeCounts,
  autoFill,
  onTypeCountChange,
  onResetAll,
  onToggleAutoFill,
  onBack,
  onGenerate,
  totalQuestions,
}: Props) {
  const canAddMore = !autoFill && totalQuestions < MAX_CUSTOM_TOTAL;
  return (
    <div className="grid grid-cols-3 gap-6">
      {/* 선택된 지문 (sticky) */}
      <div className="col-span-1 bg-white rounded-2xl border p-5 h-fit sticky top-20">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-400">선택된 지문</span>
          <button onClick={onBack} className="text-[11px] text-blue-500 hover:text-blue-700 font-medium">
            변경
          </button>
        </div>
        <h3 className="font-semibold text-slate-800 text-sm">{selectedPassage.title}</h3>
        {selectedPassage.grade && (
          <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
            {selectedPassage.grade}학년
          </span>
        )}
        <p className="text-[11px] text-slate-500 font-mono mt-2 line-clamp-12 leading-relaxed">
          {selectedPassage.content}
        </p>
      </div>

      {/* 카테고리별 설정 */}
      <div className="col-span-2 space-y-4">
        <div className="bg-white rounded-2xl border p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">학습 카테고리별 문제 수 설정</h3>
            <button
              onClick={onToggleAutoFill}
              className={`text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
                autoFill
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
              }`}
            >
              {autoFill ? `자동 채우기 ON (${Object.values(typeCounts).reduce((a, b) => a + b, 0)}개)` : "자동 채우기"}
            </button>
          </div>

          {CATEGORY_GROUPS.map((group) => {
            const groupTotal = group.items.reduce((sum, item) => sum + (typeCounts[item.id] || 0), 0);
            return (
              <div key={group.category}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-slate-400 tracking-wider">
                    {group.label}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {groupTotal} / {group.target} 목표
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item) => {
                    const count = typeCounts[item.id] || 0;
                    const active = count > 0;
                    return (
                      <div
                        key={item.id}
                        className={`inline-flex items-center h-8 rounded-lg border transition-all duration-150 ${
                          active
                            ? "bg-blue-50 border-blue-300"
                            : autoFill
                              ? "bg-slate-50 border-slate-200"
                              : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => !autoFill && canAddMore && onTypeCountChange(item.id, count + 1)}
                          disabled={autoFill || (!active && !canAddMore)}
                          className={`h-full px-2.5 text-[12px] font-medium transition-colors ${
                            active ? "text-blue-700" : autoFill ? "text-slate-400 cursor-default" : "text-slate-500 hover:text-slate-700"
                          } disabled:cursor-not-allowed`}
                        >
                          {item.label}
                        </button>
                        {active && (
                          <div className="flex items-center gap-0.5 pr-1 border-l border-blue-200">
                            {!autoFill && (
                              <button
                                onClick={() => onTypeCountChange(item.id, count - 1)}
                                className="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-blue-600 text-[14px] font-bold"
                              >
                                -
                              </button>
                            )}
                            <span className={`text-center text-[12px] font-bold text-blue-700 ${autoFill ? "px-1.5" : "w-5"}`}>
                              {count}
                            </span>
                            {!autoFill && (
                              <button
                                onClick={() => canAddMore && onTypeCountChange(item.id, count + 1)}
                                disabled={!canAddMore}
                                className="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-blue-600 text-[14px] font-bold disabled:text-slate-300 disabled:cursor-not-allowed"
                              >
                                +
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {totalQuestions > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
              <span className="text-[13px] font-medium text-blue-800">
                총 <strong>{totalQuestions}</strong>문제
                {!autoFill && (
                  <span className="text-[11px] text-blue-500 ml-1.5">/ 최대 {MAX_CUSTOM_TOTAL}개</span>
                )}
              </span>
              {!autoFill && (
                <button onClick={onResetAll} className="text-[11px] text-blue-500 hover:text-blue-700 font-medium">
                  초기화
                </button>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex-1 h-11 px-4 text-[13px] font-medium rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            ← 지문 다시 선택
          </button>
          <button
            onClick={onGenerate}
            disabled={totalQuestions === 0}
            className="flex-1 h-11 px-4 text-[13px] font-semibold rounded-xl text-white transition-colors disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
          >
            {totalQuestions > 0 ? `${totalQuestions}문제 생성` : "유형을 선택하세요"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 목표량 자동 채우기 헬퍼
// ---------------------------------------------------------------------------

export function getTargetCounts(): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const group of CATEGORY_GROUPS) {
    const perItem = Math.floor(group.target / group.items.length);
    const remainder = group.target % group.items.length;

    group.items.forEach((item, i) => {
      counts[item.id] = perItem + (i < remainder ? 1 : 0);
    });
  }

  return counts;
}
