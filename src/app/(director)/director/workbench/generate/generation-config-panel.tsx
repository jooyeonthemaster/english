// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
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
  HelpCircle,
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
import type { QuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
import {
  GRAMMAR_MARKER_COUNT_DEFAULT,
  GRAMMAR_MARKER_COUNT_MAX,
  GRAMMAR_MARKER_COUNT_MIN,
} from "@/lib/question-type-generation-settings";

const VOCAB_GENERATION_TYPE_IDS = new Set(["CONTEXT_MEANING", "SYNONYM", "ANTONYM"]);
const DETAIL_SETTING_TYPE_IDS = new Set(["BLANK_INFERENCE", "GRAMMAR_ERROR", "IRRELEVANT"]);

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
  questionTypeSettings: QuestionTypeGenerationSettings;
  setQuestionTypeSettings: (v: QuestionTypeGenerationSettings | ((prev: QuestionTypeGenerationSettings) => QuestionTypeGenerationSettings)) => void;
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

  /** Max value allowed for IRRELEVANT slotCount stepper, based on currently
   *  selected passage(s). When multiple passages selected, this is the
   *  shortest safe slot count across them. Defaults to 5 without passage context. */
  maxIrrelevantSlotCount?: number;
  irrelevantPassageSentenceCount?: number | null;
  irrelevantLimitPassageTitle?: string | null;
  irrelevantLimitSelectedCount?: number;
  irrelevantLongestPassageSentenceCount?: number | null;
  irrelevantLongestPassageTitle?: string | null;
}

function DetailSettingsPanel({ active, children }) {
  return (
    <div
      className={`mx-3 mb-3 overflow-hidden rounded-xl border bg-white shadow-sm ${
        active
          ? "border-blue-200 ring-1 ring-blue-100"
          : "border-slate-200 ring-1 ring-slate-100"
      }`}
    >
      <div
        className={`flex items-center gap-1.5 border-b px-3 py-2 ${
          active
            ? "border-blue-200/70 bg-blue-100/70"
            : "border-slate-200 bg-slate-50"
        }`}
      >
        <Settings2 className={`w-3.5 h-3.5 ${active ? "text-blue-600" : "text-slate-500"}`} />
        <span className={`text-[11px] font-extrabold ${active ? "text-blue-800" : "text-slate-700"}`}>
          상세 설정
        </span>
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  );
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
  questionTypeSettings,
  setQuestionTypeSettings,
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
  maxIrrelevantSlotCount = 5,
  irrelevantPassageSentenceCount = null,
  irrelevantLimitPassageTitle = null,
  irrelevantLimitSelectedCount = 0,
  irrelevantLongestPassageSentenceCount = null,
  irrelevantLongestPassageTitle = null,
}: GenerationConfigPanelProps) {
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>("BLANK_INFERENCE");
  const [openHelpTypeId, setOpenHelpTypeId] = useState<string | null>(null);
  const activeTypeItems = useMemo(() => {
    return EXAM_TYPE_GROUPS
      .flatMap((group) => group.items)
      .filter((item) => (typeCounts[item.id] || 0) > 0);
  }, [typeCounts]);
  const blankSettings = questionTypeSettings.BLANK_INFERENCE || {};
  const updateBlankSetting = (next: Partial<NonNullable<QuestionTypeGenerationSettings["BLANK_INFERENCE"]>>) => {
    setQuestionTypeSettings((prev) => ({
      ...prev,
      BLANK_INFERENCE: {
        ...(prev.BLANK_INFERENCE || {}),
        ...next,
      },
    }));
  };
  const grammarErrorSettings = questionTypeSettings.GRAMMAR_ERROR || {};
  const rawGrammarMarkerCount = Math.round(
    Number(grammarErrorSettings.markerCount ?? grammarErrorSettings.errorCount) || GRAMMAR_MARKER_COUNT_DEFAULT,
  );
  const grammarMarkerCount = Math.min(
    GRAMMAR_MARKER_COUNT_MAX,
    Math.max(GRAMMAR_MARKER_COUNT_MIN, rawGrammarMarkerCount),
  );
  const setGrammarMarkerCount = (next: number) => {
    const clamped = Math.min(
      GRAMMAR_MARKER_COUNT_MAX,
      Math.max(GRAMMAR_MARKER_COUNT_MIN, Math.round(next)),
    );
    setQuestionTypeSettings((prev) => ({
      ...prev,
      GRAMMAR_ERROR: {
        ...(prev.GRAMMAR_ERROR || {}),
        markerCount: clamped,
      },
    }));
  };
  const irrelevantSettings = questionTypeSettings.IRRELEVANT || {};
  // N slots contain N - 1 source sentences plus one inserted irrelevant sentence.
  // The original first passage sentence is context only and is not a choice.
  const irrelevantSlotCap = Math.max(0, maxIrrelevantSlotCount);
  const irrelevantUsable = irrelevantSlotCap >= 5;
  const irrelevantMax = irrelevantUsable ? irrelevantSlotCap : 5;
  const rawSlotCount = Math.round(Number(irrelevantSettings.slotCount) || 5);
  const irrelevantSlotCount = Math.min(irrelevantMax, Math.max(5, rawSlotCount));
  const irrelevantSourceSentencesShown = Math.max(0, irrelevantSlotCount - 1);
  const irrelevantEligibleSourceSentenceCount =
    typeof irrelevantPassageSentenceCount === "number"
      ? Math.max(0, irrelevantPassageSentenceCount - 1)
      : null;
  const irrelevantHiddenSourceSentences =
    typeof irrelevantEligibleSourceSentenceCount === "number"
      ? Math.max(0, irrelevantEligibleSourceSentenceCount - irrelevantSourceSentencesShown)
      : 0;
  const irrelevantFullPassageSlotCount =
    typeof irrelevantPassageSentenceCount === "number"
      ? irrelevantPassageSentenceCount
      : null;
  const canShowFullIrrelevantPassage =
    typeof irrelevantFullPassageSlotCount === "number" &&
    irrelevantFullPassageSlotCount >= 5 &&
    irrelevantFullPassageSlotCount <= irrelevantMax;
  const isShowingFullIrrelevantPassage =
    canShowFullIrrelevantPassage &&
    irrelevantSlotCount >= (irrelevantFullPassageSlotCount as number);
  const irrelevantLimitTitle =
    typeof irrelevantLimitPassageTitle === "string"
      ? irrelevantLimitPassageTitle.trim()
      : "";
  const irrelevantLongestTitle =
    typeof irrelevantLongestPassageTitle === "string"
      ? irrelevantLongestPassageTitle.trim()
      : "";
  const irrelevantLongestHiddenSourceSentences =
    typeof irrelevantLongestPassageSentenceCount === "number"
      ? Math.max(0, Math.max(0, irrelevantLongestPassageSentenceCount - 1) - irrelevantSourceSentencesShown)
      : 0;
  const setIrrelevantSlotCount = (next: number) => {
    const clamped = Math.min(irrelevantMax, Math.max(5, Math.round(next)));
    setQuestionTypeSettings((prev) => ({
      ...prev,
      IRRELEVANT: {
        ...(prev.IRRELEVANT || {}),
        slotCount: clamped,
      },
    }));
  };
  // If the user previously set a slotCount higher than what the current
  // selection allows, snap it down so the persisted setting never exceeds
  // the cap (otherwise the backend would reject generation).
  useEffect(() => {
    if (rawSlotCount > irrelevantMax || rawSlotCount < 5) {
      setIrrelevantSlotCount(Math.min(irrelevantMax, Math.max(5, rawSlotCount)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [irrelevantMax]);

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
                      const hasDetailSettings = DETAIL_SETTING_TYPE_IDS.has(item.id);
                      const expanded = hasDetailSettings && expandedTypeId === item.id;
                      return (
                        <div key={item.id}
                          className={`relative rounded-xl border transition-all duration-150 overflow-visible ${
                            active
                              ? "bg-blue-50/70 border-blue-300 shadow-sm shadow-blue-50"
                              : "bg-white border-slate-200 hover:border-slate-300"
                          }`}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedTypeId(hasDetailSettings ? item.id : null);
                                setOpenHelpTypeId(null);
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
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenHelpTypeId(openHelpTypeId === item.id ? null : item.id);
                              }}
                              className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 shrink-0"
                              aria-label={`${item.label} 설명 보기`}
                              aria-expanded={openHelpTypeId === item.id}
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                            </button>

                            {openHelpTypeId === item.id && (
                              <div className="absolute left-3 right-3 top-10 z-30 rounded-lg border border-slate-200 bg-white p-3 shadow-xl shadow-slate-200/70">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-[12px] font-bold text-slate-800">{item.label}</p>
                                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{item.studentTask}</p>
                                    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{item.description}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setOpenHelpTypeId(null)}
                                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600"
                                    aria-label="설명 닫기"
                                  >
                                    ×
                                  </button>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {item.outputUi.map((piece, pieceIndex) => (
                                    <span key={`${piece}-${pieceIndex}`} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                                      {piece}
                                    </span>
                                  ))}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {item.bestFor.map((point, pointIndex) => (
                                    <span key={`${point}-${pointIndex}`} className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-[10px] font-medium text-emerald-700 border border-emerald-100">
                                      {point}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-0.5 shrink-0">
                              {hasDetailSettings && (
                                <button
                                  type="button"
                                  title="상세 설정"
                                  onClick={() => {
                                    setOpenHelpTypeId(null);
                                    setExpandedTypeId(expanded ? null : item.id);
                                  }}
                                  className={`w-8 h-8 rounded-lg border flex items-center justify-center shadow-sm transition-all ${
                                    expanded
                                      ? "border-blue-600 bg-blue-600 text-white shadow-blue-200"
                                      : "border-blue-200 bg-white text-blue-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                                  }`}
                                  aria-label={`${item.label} 상세 설정 ${expanded ? "접기" : "펼치기"}`}
                                  aria-expanded={expanded}
                                >
                                  <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                                </button>
                              )}
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
                                onClick={() => setTypeCount(item.id, count + 1)}
                                className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 transition-colors"
                                aria-label={`${item.label} 개수 늘리기`}
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {expanded && item.id === "IRRELEVANT" && (
                            <DetailSettingsPanel active={active}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[12px] font-bold text-slate-800">선지 개수</span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">5 ~ {irrelevantMax}개</span>
                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">내신 변형형</span>
                                  </div>
                                  <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                                    문제에는 첫 문장을 제외한 원문 {irrelevantSourceSentencesShown}문장과 새 무관문 1문장이 표시됩니다.
                                  </p>
                                  {typeof irrelevantPassageSentenceCount === "number" && irrelevantUsable && (
                                    <p className={`mt-1.5 text-[10px] leading-snug font-medium ${
                                      irrelevantHiddenSourceSentences > 0 || irrelevantLongestHiddenSourceSentences > 0
                                        ? "text-amber-600"
                                        : "text-emerald-600"
                                    }`}>
                                      {irrelevantLimitSelectedCount > 1 && irrelevantLongestHiddenSourceSentences > 0
                                        ? `가장 짧은 지문은 첫 문장을 제외한 전체가 표시됩니다. 긴 지문은 현재 설정에서 추가로 원문 ${irrelevantLongestHiddenSourceSentences}문장이 문제에 보이지 않을 수 있습니다.`
                                        : irrelevantHiddenSourceSentences > 0
                                        ? `선택한 지문은 첫 문장을 제외하면 원문 ${irrelevantEligibleSourceSentenceCount ?? 0}문장을 사용할 수 있어, 현재 설정에서는 추가로 원문 ${irrelevantHiddenSourceSentences}문장이 문제에 보이지 않습니다.`
                                        : "현재 설정에서는 첫 문장을 제외한 원문 구간 전체가 문제에 표시됩니다."}
                                    </p>
                                  )}
                                  {!irrelevantUsable && (
                                    <p className="mt-1.5 text-[10px] leading-snug text-rose-600 font-medium">
                                      선택한 지문은 원문 {irrelevantPassageSentenceCount ?? 0}문장이라 무관한 문장 유형을 만들 수 없습니다. 첫 문장을 제외하고 출제하려면 원문 5문장 이상이 필요합니다.
                                    </p>
                                  )}
                                  {irrelevantUsable && typeof irrelevantPassageSentenceCount === "number" && (
                                    <p className="mt-1.5 text-[10px] leading-snug text-amber-600">
                                      첫 문장 제외 원문 {irrelevantEligibleSourceSentenceCount ?? 0}문장 + 새 무관문 1문장 기준 최대 {irrelevantMax}개입니다. 여러 지문 선택 시 가장 짧은 지문 기준입니다.
                                    </p>
                                  )}
                                  {irrelevantUsable && irrelevantLimitSelectedCount > 1 && irrelevantLimitTitle && (
                                    <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                                      현재 제한 기준: {irrelevantLimitTitle} ({irrelevantPassageSentenceCount ?? 0}문장)
                                      {irrelevantLongestHiddenSourceSentences > 0 && irrelevantLongestTitle
                                        ? ` · 긴 지문만 선택하면 더 늘릴 수 있습니다.`
                                        : ""}
                                    </p>
                                  )}
                                  {irrelevantUsable && canShowFullIrrelevantPassage && !isShowingFullIrrelevantPassage && (
                                    <button
                                      type="button"
                                      onClick={() => setIrrelevantSlotCount(irrelevantFullPassageSlotCount as number)}
                                      className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100"
                                    >
                                      원문 전체 표시로 맞춤
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setIrrelevantSlotCount(irrelevantSlotCount - 1)}
                                    disabled={!irrelevantUsable || irrelevantSlotCount <= 5}
                                    className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                                    aria-label="선지 개수 줄이기"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className={`w-6 text-center text-[12px] font-bold tabular-nums ${irrelevantUsable ? "text-blue-700" : "text-slate-300"}`}>
                                    {irrelevantSlotCount}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setIrrelevantSlotCount(irrelevantSlotCount + 1)}
                                    disabled={!irrelevantUsable || irrelevantSlotCount >= irrelevantMax}
                                    className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                                    aria-label="선지 개수 늘리기"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </DetailSettingsPanel>
                          )}

                          {expanded && item.id === "GRAMMAR_ERROR" && (
                            <DetailSettingsPanel active={active}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[12px] font-bold text-slate-800">밑줄 표현 개수</span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">5 ~ 10개</span>
                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">정답 개수 랜덤</span>
                                  </div>
                                  <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                                    지문에서 검토할 밑줄 표현 수. 실제로 어법상 틀린 정답 개수는 매번 달라지며 해설/오답 분석에 반영됩니다.
                                  </p>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setGrammarMarkerCount(grammarMarkerCount - 1)}
                                    disabled={grammarMarkerCount <= GRAMMAR_MARKER_COUNT_MIN}
                                    className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                                    aria-label="밑줄 표현 개수 줄이기"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">
                                    {grammarMarkerCount}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setGrammarMarkerCount(grammarMarkerCount + 1)}
                                    disabled={grammarMarkerCount >= GRAMMAR_MARKER_COUNT_MAX}
                                    className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                                    aria-label="밑줄 표현 개수 늘리기"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </DetailSettingsPanel>
                          )}

                          {expanded && item.id === "BLANK_INFERENCE" && (
                            <DetailSettingsPanel active={active}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[12px] font-bold text-slate-800">부정-부정 빈칸</span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">정답 변형</span>
                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">부정어 함정</span>
                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">킬러형</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={!!blankSettings.doubleNegative}
                                  onClick={() => updateBlankSetting({ doubleNegative: !blankSettings.doubleNegative })}
                                  className={`relative h-6 w-11 rounded-full border transition-colors ${
                                    blankSettings.doubleNegative
                                      ? "border-blue-300 bg-blue-500"
                                      : "border-slate-200 bg-slate-200"
                                  }`}
                                >
                                  <span
                                    className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                                      blankSettings.doubleNegative ? "translate-x-5" : "translate-x-0"
                                    }`}
                                  />
                                </button>
                              </div>
                            </DetailSettingsPanel>
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
              const unitCost = VOCAB_GENERATION_TYPE_IDS.has(typeId)
                ? CREDIT_COSTS.QUESTION_GEN_VOCAB
                : CREDIT_COSTS.QUESTION_GEN_SINGLE;
              return sum + unitCost * value;
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
