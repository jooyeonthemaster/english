"use client";

import { Zap, Settings2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUESTION_GENERATION_TARGET } from "@/lib/learning-constants";

// ---------------------------------------------------------------------------
// Category groups (23 subtypes)
// ---------------------------------------------------------------------------
const CATEGORY_GROUPS = [
  {
    category: "VOCAB",
    label: "📗 어휘",
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
    category: "INTERPRETATION",
    label: "📘 해석",
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
    category: "GRAMMAR",
    label: "📙 문법",
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
    category: "COMPREHENSION",
    label: "📕 독해",
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
  genMode: "auto" | "manual";
  setGenMode: (m: "auto" | "manual") => void;
  autoCount: number;
  setAutoCount: (n: number) => void;
  typeCounts: Record<string, number>;
  setTypeCount: (id: string, count: number) => void;
  setTypeCounts: (v: Record<string, number>) => void;
  totalQuestions: number;
  canGenerate: boolean;
  selectedIds: Set<string>;
  handleBatchGenerate: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function LearningConfigPanel({
  genMode,
  setGenMode,
  autoCount,
  setAutoCount,
  typeCounts,
  setTypeCount,
  setTypeCounts,
  totalQuestions,
  canGenerate,
  selectedIds,
  handleBatchGenerate,
}: Props) {
  // 자동 채우기
  const handleAutoFill = () => {
    const counts: Record<string, number> = {};
    for (const group of CATEGORY_GROUPS) {
      const perItem = Math.floor(group.target / group.items.length);
      const remainder = group.target % group.items.length;
      group.items.forEach((item, i) => {
        counts[item.id] = perItem + (i < remainder ? 1 : 0);
      });
    }
    setTypeCounts(counts);
  };

  return (
    <div className="flex flex-col bg-slate-50/80 border-l border-slate-100 overflow-y-auto">
      <div className="p-5 space-y-5">
        {/* 모드 토글 */}
        <div className="flex rounded-xl bg-white border border-slate-200 p-1">
          <button
            onClick={() => setGenMode("auto")}
            className={cn(
              "flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5",
              genMode === "auto"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Zap className="w-3.5 h-3.5" /> 자동 생성
          </button>
          <button
            onClick={() => setGenMode("manual")}
            className={cn(
              "flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5",
              genMode === "manual"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Settings2 className="w-3.5 h-3.5" /> 유형 지정
          </button>
        </div>

        {/* 자동 모드 */}
        {genMode === "auto" && (
          <div className="space-y-4">
            <div className="bg-blue-50/80 rounded-xl p-4 border border-blue-100">
              <p className="text-[12px] font-semibold text-blue-800 mb-1">
                AI 자동 출제
              </p>
              <p className="text-[11px] text-blue-600 leading-relaxed">
                지문 분석 데이터를 기반으로 최적의 유형과 난이도를 자동
                선택합니다. 지문당 최대 300문제.
              </p>
            </div>

            {/* 300문제 자동 채우기 */}
            <button
              onClick={() => setAutoCount(75)}
              className={cn(
                "w-full h-10 rounded-xl border-2 border-dashed text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5",
                autoCount === 75
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400"
              )}
            >
              <Zap className="w-3.5 h-3.5" />
              300문제 자동 채우기 (카테고리별 75개)
            </button>

            {/* 카테고리당 문제 수 (직접 조정) */}
            <div>
              <label className="text-[12px] font-semibold text-slate-700 mb-2 block">
                또는 직접 설정
              </label>
              <div className="flex items-center gap-3 justify-center">
                <button
                  onClick={() => setAutoCount(Math.max(1, autoCount - 5))}
                  className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50"
                >
                  <Minus className="w-3.5 h-3.5 text-slate-500" />
                </button>
                <span className="text-[20px] font-bold text-slate-800 w-12 text-center">
                  {autoCount}
                </span>
                <button
                  onClick={() => setAutoCount(Math.min(75, autoCount + 5))}
                  className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50"
                >
                  <Plus className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
              <p className={cn(
                "text-[11px] text-center mt-1",
                autoCount * 4 > 300 ? "text-red-500 font-medium" : "text-slate-400"
              )}>
                총 {autoCount * 4}개 (4개 카테고리 × {autoCount})
                {autoCount * 4 >= 300 && " · 최대"}
              </p>
            </div>
          </div>
        )}

        {/* 수동 모드 */}
        {genMode === "manual" && (
          <div className="space-y-4">
            {/* 총합 + 초기화 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-semibold text-slate-700">
                  유형별 문제 수
                </p>
                {totalQuestions > 0 && (
                  <button
                    onClick={() => setTypeCounts({})}
                    className="text-[10px] text-slate-400 hover:text-red-500 font-medium transition-colors"
                  >
                    초기화
                  </button>
                )}
              </div>
              <span className={cn(
                "text-[12px] font-bold",
                totalQuestions > 300 ? "text-red-500" : totalQuestions > 0 ? "text-blue-600" : "text-slate-400"
              )}>
                {totalQuestions}/300
                {totalQuestions > 300 && " ⚠️ 초과"}
              </span>
            </div>

            {CATEGORY_GROUPS.map((group) => {
              const groupTotal = group.items.reduce(
                (s, item) => s + (typeCounts[item.id] || 0),
                0
              );
              const handleFillCategory = () => {
                const perItem = Math.floor(group.target / group.items.length);
                const remainder = group.target % group.items.length;
                const next = { ...typeCounts };
                group.items.forEach((item, i) => {
                  next[item.id] = perItem + (i < remainder ? 1 : 0);
                });
                setTypeCounts(next);
              };
              return (
                <div key={group.category}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-bold text-slate-700">
                      {group.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleFillCategory}
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-md font-medium transition-all",
                          groupTotal === group.target
                            ? "bg-blue-100 text-blue-600"
                            : "text-blue-500 hover:bg-blue-50 border border-blue-200"
                        )}
                      >
                        {group.target}개 채우기
                      </button>
                      <span className="text-[11px] text-slate-400">
                        {groupTotal} / {group.target}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const count = typeCounts[item.id] || 0;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between h-8 px-2 rounded-lg hover:bg-white transition-colors"
                        >
                          <span className="text-[12px] text-slate-600">
                            {item.label}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() =>
                                setTypeCount(item.id, Math.max(0, count - 1))
                              }
                              className="w-6 h-6 rounded-md border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-slate-600"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-[12px] font-semibold text-slate-700">
                              {count}
                            </span>
                            <button
                              onClick={() =>
                                setTypeCount(item.id, count + 1)
                              }
                              className="w-6 h-6 rounded-md border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-slate-600"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* 생성 버튼 (하단 고정) */}
      <div className="mt-auto p-5 pt-3 border-t border-slate-200">
        <button
          onClick={handleBatchGenerate}
          disabled={!canGenerate}
          className="w-full h-12 rounded-xl text-[14px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-md"
        >
          <Zap className="w-4 h-4" />
          {selectedIds.size > 0
            ? `${selectedIds.size}개 지문 · ${genMode === "auto" ? `총 ${autoCount * 4}문제` : `총 ${totalQuestions}문제`} 생성`
            : "지문을 선택하세요"}
        </button>
      </div>
    </div>
  );
}
