// @ts-nocheck
"use client";

import { useMemo, useState } from "react";
import {
  Coins,
  Cpu,
  FileText,
  Minus,
  Plus,
  Target,
  Zap,
  Gem,
  Sparkles,
  Settings2,
  ChevronDown,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXAM_TYPE_GROUPS } from "./generate-page-types";
import { PromptSection } from "./prompt-section";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  QUESTION_GENERATION_PLANS,
  getQuestionGenerationCreditCost,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";

const VOCAB_GENERATION_TYPE_IDS = new Set(["CONTEXT_MEANING", "SYNONYM", "ANTONYM"]);

// ─── Props ───────────────────────────────────────────

interface GenerationConfigPanelProps {
  // Mode
  genMode: "auto" | "manual";
  setGenMode: (v: "auto" | "manual") => void;
  generationPlan: QuestionGenerationPlan;
  setGenerationPlan: (v: QuestionGenerationPlan) => void;

  // Auto config
  autoCount: number;
  setAutoCount: (v: number) => void;

  // Manual config
  typeCounts: Record<string, number>;
  setTypeCount: (id: string, count: number) => void;
  setTypeCounts: (v: Record<string, number>) => void;
  totalQuestions: number;

  // Difficulty
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  setDifficulty: (v: "BASIC" | "INTERMEDIATE" | "KILLER") => void;

  // Prompt
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
  savedPrompts: { id: string; name: string; content: string }[];
  showSavedPrompts: boolean;
  setShowSavedPrompts: (v: boolean) => void;
  showSaveInput: boolean;
  setShowSaveInput: (v: boolean) => void;
  savePromptName: string;
  setSavePromptName: (v: string) => void;
  savingPrompt: boolean;
  setSavingPrompt: (v: boolean) => void;
  editingPromptId: string | null;
  setEditingPromptId: (v: string | null) => void;
  editingName: string;
  setEditingName: (v: string) => void;
  loadSavedPrompts: () => void;

  // Generate
  canGenerate: boolean;
  selectedIds: Set<string>;
  handleBatchGenerate: () => void;
}

// ─── Component ───────────────────────────────────────

export function GenerationConfigPanel({
  genMode,
  setGenMode,
  generationPlan,
  setGenerationPlan,
  autoCount,
  setAutoCount,
  typeCounts,
  setTypeCount,
  setTypeCounts,
  totalQuestions,
  difficulty,
  setDifficulty,
  customPrompt,
  setCustomPrompt,
  savedPrompts,
  showSavedPrompts,
  setShowSavedPrompts,
  showSaveInput,
  setShowSaveInput,
  savePromptName,
  setSavePromptName,
  savingPrompt,
  setSavingPrompt,
  editingPromptId,
  setEditingPromptId,
  editingName,
  setEditingName,
  loadSavedPrompts,
  canGenerate,
  selectedIds,
  handleBatchGenerate,
}: GenerationConfigPanelProps) {
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>("BLANK_INFERENCE");
  const activeTypeItems = useMemo(() => {
    return EXAM_TYPE_GROUPS
      .flatMap((group) => group.items)
      .filter((item) => (typeCounts[item.id] || 0) > 0);
  }, [typeCounts]);

  return (
    <div className="flex flex-col bg-white overflow-hidden w-full lg:w-[340px] xl:w-[420px] shrink-0 border-l border-slate-200/80">
      <div className="flex-1 overflow-y-auto">

        {/* Mode Toggle */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex bg-slate-100/80 rounded-xl p-1">
            <button
              onClick={() => setGenMode("auto")}
              className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
                genMode === "auto"
                  ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Zap className="w-4 h-4" />
              자동 생성
            </button>
            <button
              onClick={() => setGenMode("manual")}
              className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
                genMode === "manual"
                  ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Settings2 className="w-4 h-4" />
              유형 지정
            </button>
          </div>
        </div>

        {/* Model selector */}
        {FEATURE_FLAGS.SHOW_MODEL_SELECTOR && (
          <div className="px-5 pb-3">
            <div className="grid grid-cols-2 gap-2">
              {(["STANDARD", "PREMIUM"] as const).map((planId) => {
                const plan = QUESTION_GENERATION_PLANS[planId];
                const active = generationPlan === planId;
                const Icon = planId === "PREMIUM" ? Gem : Sparkles;
                return (
                  <button
                    key={planId}
                    type="button"
                    onClick={() => setGenerationPlan(planId)}
                    className={`min-h-[72px] rounded-xl border p-3 text-left transition-all duration-150 ${
                      active
                        ? "border-blue-300 bg-blue-50 text-blue-800 shadow-sm shadow-blue-50"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`} />
                        <span className="text-[12px] font-bold truncate">{plan.shortLabel}</span>
                      </div>
                      <span className={`text-[10px] font-bold tabular-nums ${active ? "text-blue-600" : "text-slate-400"}`}>
                        {plan.creditMultiplier}x
                      </span>
                    </div>
                    <p className="mt-1.5 text-[10px] font-medium leading-snug text-slate-500">
                      {plan.modelLabel}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Auto Mode Config */}
        {genMode === "auto" && (
          <div className="px-5 py-3 space-y-4">
            <div className="rounded-xl bg-gradient-to-br from-blue-50/80 to-blue-50/30 border border-blue-200/50 p-4 space-y-4">
              <div className="flex items-start gap-2.5">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-100/80 shrink-0 mt-0.5">
                  <Zap className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-blue-800">AI 자동 출제</p>
                  <p className="text-[11px] text-blue-600/80 mt-1 leading-relaxed">
                    지문 분석 데이터를 기반으로 최적의 유형과 난이도를 자동 선택합니다.
                  </p>
                </div>
              </div>

              {/* Question count */}
              <div>
                <span className="text-[11px] font-semibold text-blue-700 block mb-2">문제 수</span>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden w-fit">
                  <button onClick={() => setAutoCount(Math.max(1, autoCount - 1))} className="w-8 h-9 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-9 h-9 flex items-center justify-center text-[13px] font-bold text-slate-700 border-x border-slate-200 bg-slate-50/50">{autoCount}</span>
                  <button onClick={() => setAutoCount(Math.min(20, autoCount + 1))} className="w-8 h-9 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">난이도</span>
              <div className="flex gap-2">
                {([{ value: "BASIC", label: "기본", desc: "기초 수준" }, { value: "INTERMEDIATE", label: "중급", desc: "내신 대비" }, { value: "KILLER", label: "킬러", desc: "상위권" }] as const).map((d) => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)}
                    className={`flex-1 h-9 rounded-lg text-[12px] font-semibold transition-all duration-150 border ${
                      difficulty === d.value
                        ? "bg-blue-50 text-blue-700 border-blue-300 shadow-sm shadow-blue-50"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-600"
                    }`}>{d.label}</button>
                ))}
              </div>
            </div>

            {/* Custom prompt */}
            <PromptSection
              customPrompt={customPrompt}
              setCustomPrompt={setCustomPrompt}
              savedPrompts={savedPrompts}
              showSavedPrompts={showSavedPrompts}
              setShowSavedPrompts={setShowSavedPrompts}
              showSaveInput={showSaveInput}
              setShowSaveInput={setShowSaveInput}
              savePromptName={savePromptName}
              setSavePromptName={setSavePromptName}
              savingPrompt={savingPrompt}
              setSavingPrompt={setSavingPrompt}
              editingPromptId={editingPromptId}
              setEditingPromptId={setEditingPromptId}
              editingName={editingName}
              setEditingName={setEditingName}
              loadSavedPrompts={loadSavedPrompts}
            />
          </div>
        )}

        {/* Manual Mode Config */}
        {genMode === "manual" && (
          <div className="px-5 py-3 space-y-4">
            {/* Type selection groups */}
            <div className="space-y-4">
              {EXAM_TYPE_GROUPS.map((group) => (
                <div key={group.group} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">{group.group}</span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {group.items.filter((item) => (typeCounts[item.id] || 0) > 0).length}/{group.items.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item) => {
                      const count = typeCounts[item.id] || 0;
                      const active = count > 0;
                      const expanded = expandedTypeId === item.id || active;
                      return (
                        <div key={item.id}
                          className={`rounded-xl border transition-all duration-150 overflow-hidden ${
                            active
                              ? "bg-blue-50/70 border-blue-300 shadow-sm shadow-blue-50"
                              : "bg-white border-slate-200 hover:border-slate-300"
                          }`}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedTypeId(item.id);
                                setTypeCount(item.id, count + 1);
                              }}
                              className="flex-1 min-w-0 text-left"
                            >
                              <div className="flex items-center gap-2">
                                <span className={`text-[12px] font-bold truncate ${active ? "text-blue-800" : "text-slate-700"}`}>
                                  {item.label}
                                </span>
                                {active && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                              </div>
                              <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                                {item.studentTask}
                              </p>
                            </button>

                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setExpandedTypeId(expandedTypeId === item.id ? null : item.id)}
                                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                aria-label={`${item.label} 상세 보기`}
                                aria-expanded={expanded}
                              >
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setTypeCount(item.id, Math.max(0, count - 1))}
                                disabled={!active}
                                className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                                aria-label={`${item.label} 개수 줄이기`}
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className={`w-5 text-center text-[12px] font-bold tabular-nums ${active ? "text-blue-700" : "text-slate-300"}`}>
                                {count}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedTypeId(item.id);
                                  setTypeCount(item.id, count + 1);
                                }}
                                className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 transition-colors"
                                aria-label={`${item.label} 개수 늘리기`}
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {expanded && (
                            <div className={`px-3 pb-3 space-y-3 ${active ? "border-t border-blue-200/70" : "border-t border-slate-100"}`}>
                              <p className="pt-3 text-[11px] text-slate-600 leading-relaxed">
                                {item.description}
                              </p>

                              <div className="grid grid-cols-1 gap-2">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                    <Eye className="w-3 h-3" />
                                    학생 화면
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {item.outputUi.map((piece, pieceIndex) => (
                                      <span key={`${piece}-${pieceIndex}`} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                                        {piece}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                              </div>

                              <div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">좋은 출제 포인트</span>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {item.bestFor.map((point, pointIndex) => (
                                    <span key={`${point}-${pointIndex}`} className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-[10px] font-medium text-emerald-700 border border-emerald-100">
                                      {point}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {totalQuestions > 0 && (
                <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200/60">
                  <div className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-[12px] font-semibold text-blue-800">
                      총 <strong className="text-blue-700">{totalQuestions}</strong>문제
                      <span className="text-blue-500 font-medium ml-1">
                        ({activeTypeItems.length}개 유형)
                      </span>
                    </span>
                  </div>
                  <button onClick={() => setTypeCounts({})} className="text-[11px] text-blue-500 hover:text-blue-700 font-medium transition-colors">초기화</button>
                </div>
              )}
            </div>

            {/* Difficulty */}
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">난이도</span>
              <div className="flex gap-2">
                {([{ value: "BASIC", label: "기본" }, { value: "INTERMEDIATE", label: "중급" }, { value: "KILLER", label: "킬러" }] as const).map((d) => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)}
                    className={`flex-1 h-9 rounded-lg text-[12px] font-semibold transition-all duration-150 border ${
                      difficulty === d.value
                        ? "bg-blue-50 text-blue-700 border-blue-300 shadow-sm shadow-blue-50"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-600"
                    }`}>{d.label}</button>
                ))}
              </div>
            </div>

            {/* Custom prompt */}
            <PromptSection
              customPrompt={customPrompt}
              setCustomPrompt={setCustomPrompt}
              savedPrompts={savedPrompts}
              showSavedPrompts={showSavedPrompts}
              setShowSavedPrompts={setShowSavedPrompts}
              showSaveInput={showSaveInput}
              setShowSaveInput={setShowSaveInput}
              savePromptName={savePromptName}
              setSavePromptName={setSavePromptName}
              savingPrompt={savingPrompt}
              setSavingPrompt={setSavingPrompt}
              editingPromptId={editingPromptId}
              setEditingPromptId={setEditingPromptId}
              editingName={editingName}
              setEditingName={setEditingName}
              loadSavedPrompts={loadSavedPrompts}
            />
          </div>
        )}
      </div>

      {/* Generate Button */}
      <div className="px-5 py-4 border-t border-slate-100 bg-white shrink-0">
        {(() => {
          // 크레딧 비용 계산
          const baseCreditCost = genMode === "auto"
            ? CREDIT_COSTS.AUTO_GEN_BATCH * selectedIds.size
            : selectedIds.size * Object.entries(typeCounts).reduce((sum, [typeId, value]) => {
              if (value <= 0) return sum;
              return sum + (VOCAB_GENERATION_TYPE_IDS.has(typeId) ? CREDIT_COSTS.QUESTION_GEN_VOCAB : CREDIT_COSTS.QUESTION_GEN_SINGLE);
            }, 0);
          const creditCost = getQuestionGenerationCreditCost(baseCreditCost, generationPlan);
          return (
            <>
              <Button
                className={`w-full h-12 rounded-xl text-[14px] font-bold transition-all duration-200 ${
                  canGenerate
                    ? "bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200/50 hover:shadow-lg hover:shadow-blue-200/60"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
                onClick={handleBatchGenerate}
                disabled={!canGenerate}
              >
                {selectedIds.size === 0 ? (
                  <span className="flex items-center gap-2">
                    <FileText className="w-4.5 h-4.5" />
                    지문을 선택하세요
                  </span>
                ) : genMode === "auto" ? (
                  <span className="flex items-center gap-2">
                    <Zap className="w-4.5 h-4.5" />
                    {selectedIds.size === 1 ? `${autoCount}문제 자동 생성` : `${selectedIds.size}개 지문 × ${autoCount}문제 생성`}
                  </span>
                ) : totalQuestions > 0 ? (
                  <span className="flex items-center gap-2">
                    <Cpu className="w-4.5 h-4.5" />
                    {selectedIds.size === 1 ? `${totalQuestions}문제 생성` : `${selectedIds.size}개 지문 × ${totalQuestions}문제 생성`}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Target className="w-4.5 h-4.5" />
                    유형을 선택하세요
                  </span>
                )}
              </Button>
              {canGenerate && creditCost > 0 && (
                <div className="flex items-center justify-center gap-1.5 mt-2 text-[11px] text-slate-400">
                  <Coins className="w-3 h-3" />
                  <span>이 작업에 <strong className="text-slate-600 font-semibold">{creditCost} 크레딧</strong>이 차감됩니다</span>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
