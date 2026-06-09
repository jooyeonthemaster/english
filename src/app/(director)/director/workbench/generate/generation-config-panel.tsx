// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Coins,
  Cpu,
  FileText,
  GripVertical,
  Minus,
  Plus,
  Target,
  Zap,
  Gem,
  Sparkles,
  Settings2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXAM_TYPE_GROUPS } from "./generate-page-types";
import { PromptSection } from "./prompt-section";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { SetBuilderPanel } from "@/components/workbench/set-builder-panel";
import {
  QUESTION_GENERATION_PLANS,
  getQuestionGenerationCreditCost,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import type { QuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
import {
  CONTENT_MATCH_ANSWER_COUNT_DEFAULT,
  CONTENT_MATCH_ANSWER_COUNT_MIN,
  CONTENT_MATCH_OPTION_COUNT_DEFAULT,
  CONTENT_MATCH_OPTION_COUNT_MAX,
  CONTENT_MATCH_OPTION_COUNT_MIN,
  GRAMMAR_ANSWER_COUNT_DEFAULT,
  GRAMMAR_ANSWER_COUNT_MIN,
  GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT,
  GRAMMAR_CORRECTION_ERROR_COUNT_MAX,
  GRAMMAR_CORRECTION_ERROR_COUNT_MIN,
  GRAMMAR_MARKER_COUNT_DEFAULT,
  GRAMMAR_MARKER_COUNT_MAX,
  GRAMMAR_MARKER_COUNT_MIN,
  IRRELEVANT_SLOT_COUNT_DEFAULT,
  IRRELEVANT_SLOT_COUNT_MAX,
  IRRELEVANT_SLOT_COUNT_MIN,
  SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT,
  SUMMARY_COMPLETE_BLANK_COUNT_MAX,
  SUMMARY_COMPLETE_BLANK_COUNT_MIN,
  SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT,
  SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX,
  SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN,
} from "@/lib/question-type-generation-settings";

const VOCAB_GENERATION_TYPE_IDS = new Set([
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
]);
const DETAIL_SETTING_TYPE_IDS = new Set([
  "BLANK_INFERENCE",
  "CONTENT_MATCH",
  "GRAMMAR_ERROR",
  "GRAMMAR_CORRECTION",
  "IRRELEVANT",
  "SUMMARY_COMPLETE",
  "SUMMARY_COMPLETE_MC",
]);
const TYPE_ORDER_STORAGE_KEY =
  "smoat.workbench.questions.generate.typeOrder.v1";

// Difficulty tones — unified palette: 기본 파랑 / 중급 노랑 / 킬러 빨강.
const DIFFICULTY_TONES = [
  {
    value: "BASIC",
    label: "기본",
    selected: "bg-blue-50 text-blue-700 border-blue-300 shadow-sm shadow-blue-50",
    idle: "bg-white text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600",
  },
  {
    value: "INTERMEDIATE",
    label: "중급",
    selected:
      "bg-amber-50 text-amber-700 border-amber-300 shadow-sm shadow-amber-50",
    idle: "bg-white text-slate-400 border-slate-200 hover:border-amber-200 hover:text-amber-600",
  },
  {
    value: "KILLER",
    label: "킬러",
    selected: "bg-red-50 text-red-700 border-red-300 shadow-sm shadow-red-50",
    idle: "bg-white text-slate-400 border-slate-200 hover:border-red-200 hover:text-red-600",
  },
] as const;

// ─── Props ───────────────────────────────────────────

interface GenerationConfigPanelProps {
  // Mode
  genMode: "auto" | "manual" | "set";
  setGenMode: (v: "auto" | "manual" | "set") => void;
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
  setQuestionTypeSettings: (
    v:
      | QuestionTypeGenerationSettings
      | ((
          prev: QuestionTypeGenerationSettings,
        ) => QuestionTypeGenerationSettings),
  ) => void;
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

  // 지문 워크스페이스 모드 — 행이 1개라도 불러와지면 생성 버튼은 워크스페이스
  // 기준으로 동작한다 (라이브러리 직접 선택 생성 대신).
  workspaceActive?: boolean;
  /** 체크된 지문 중 아직 워크스페이스에 불러오지 않은 수 (안내문용). */
  workspaceUnloadedSelectedCount?: number;
  workspaceRowCount?: number;
  workspaceTotalQuestions?: number;
  workspaceCreditCost?: number;
  workspaceVariantCount?: number;
  workspaceGenerating?: boolean;
  onWorkspaceGenerate?: () => void;
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
  workspaceActive = false,
  workspaceUnloadedSelectedCount = 0,
  workspaceRowCount = 0,
  workspaceTotalQuestions = 0,
  workspaceCreditCost = 0,
  workspaceVariantCount = 0,
  workspaceGenerating = false,
  onWorkspaceGenerate,
}: GenerationConfigPanelProps) {
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(
    "BLANK_INFERENCE",
  );
  const allTypeItems = useMemo(
    () =>
      EXAM_TYPE_GROUPS.flatMap((group) =>
        group.items.map((item) => ({ ...item, groupLabel: group.group })),
      ),
    [],
  );
  const allTypeIds = useMemo(
    () => allTypeItems.map((item) => item.id),
    [allTypeItems],
  );
  const normalizeTypeOrder = (order: string[]) => {
    const known = new Set(allTypeIds);
    const next = order.filter(
      (id, index) => known.has(id) && order.indexOf(id) === index,
    );
    for (const id of allTypeIds) {
      if (!next.includes(id)) next.push(id);
    }
    return next;
  };
  const [typeOrder, setTypeOrder] = useState<string[]>(() => {
    const fallback = EXAM_TYPE_GROUPS.flatMap((group) =>
      group.items.map((item) => item.id),
    );
    if (typeof window === "undefined") return fallback;
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(TYPE_ORDER_STORAGE_KEY) || "[]",
      );
      if (Array.isArray(parsed)) {
        const known = new Set(fallback);
        const stored = parsed.filter(
          (id) => typeof id === "string" && known.has(id),
        );
        return [...stored, ...fallback.filter((id) => !stored.includes(id))];
      }
    } catch {
      // Type order is a UI preference; ignore storage failures.
    }
    return fallback;
  });
  const orderedTypeItems = useMemo(() => {
    const byId = new Map(allTypeItems.map((item) => [item.id, item]));
    return normalizeTypeOrder(typeOrder)
      .map((id) => byId.get(id))
      .filter(Boolean);
  }, [allTypeItems, allTypeIds, typeOrder]);
  const [draggingTypeId, setDraggingTypeId] = useState<string | null>(null);
  const [dragOverTypeId, setDragOverTypeId] = useState<string | null>(null);
  const activeTypeItems = useMemo(() => {
    return orderedTypeItems.filter((item) => (typeCounts[item.id] || 0) > 0);
  }, [orderedTypeItems, typeCounts]);
  const blankSettings = questionTypeSettings.BLANK_INFERENCE || {};
  const updateBlankSetting = (
    next: Partial<
      NonNullable<QuestionTypeGenerationSettings["BLANK_INFERENCE"]>
    >,
  ) => {
    setQuestionTypeSettings((prev) => ({
      ...prev,
      BLANK_INFERENCE: {
        ...(prev.BLANK_INFERENCE || {}),
        ...next,
      },
    }));
  };
  const contentMatchSettings = questionTypeSettings.CONTENT_MATCH || {};
  const rawContentMatchOptionCount = Math.round(
    Number(contentMatchSettings.optionCount) ||
      CONTENT_MATCH_OPTION_COUNT_DEFAULT,
  );
  const contentMatchOptionCount = Math.min(
    CONTENT_MATCH_OPTION_COUNT_MAX,
    Math.max(CONTENT_MATCH_OPTION_COUNT_MIN, rawContentMatchOptionCount),
  );
  const rawContentMatchAnswerCount = Math.round(
    Number(
      contentMatchSettings.answerCount ??
        contentMatchSettings.correctAnswerCount,
    ) || CONTENT_MATCH_ANSWER_COUNT_DEFAULT,
  );
  const contentMatchAnswerMax = Math.max(
    CONTENT_MATCH_ANSWER_COUNT_MIN,
    contentMatchOptionCount,
  );
  const contentMatchAnswerCount = Math.min(
    contentMatchAnswerMax,
    Math.max(CONTENT_MATCH_ANSWER_COUNT_MIN, rawContentMatchAnswerCount),
  );
  const setContentMatchOptionCount = (next: number) => {
    const clamped = Math.min(
      CONTENT_MATCH_OPTION_COUNT_MAX,
      Math.max(CONTENT_MATCH_OPTION_COUNT_MIN, Math.round(next)),
    );
    setQuestionTypeSettings((prev) => ({
      ...prev,
      CONTENT_MATCH: {
        ...(prev.CONTENT_MATCH || {}),
        optionCount: clamped,
        answerCount: Math.min(
          clamped,
          Math.max(
            CONTENT_MATCH_ANSWER_COUNT_MIN,
            Math.round(
              Number(prev.CONTENT_MATCH?.answerCount) ||
                CONTENT_MATCH_ANSWER_COUNT_DEFAULT,
            ),
          ),
        ),
      },
    }));
  };
  const setContentMatchAnswerCount = (next: number) => {
    const clamped = Math.min(
      contentMatchAnswerMax,
      Math.max(CONTENT_MATCH_ANSWER_COUNT_MIN, Math.round(next)),
    );
    setQuestionTypeSettings((prev) => ({
      ...prev,
      CONTENT_MATCH: {
        ...(prev.CONTENT_MATCH || {}),
        optionCount: contentMatchOptionCount,
        answerCount: clamped,
      },
    }));
  };
  const summaryCompleteMcSettings = questionTypeSettings.SUMMARY_COMPLETE_MC || {};
  const rawSummaryCompleteMcBlankCount = Math.round(
    Number(summaryCompleteMcSettings.blankCount) ||
      SUMMARY_COMPLETE_MC_BLANK_COUNT_DEFAULT,
  );
  const summaryCompleteMcBlankCount = Math.min(
    SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX,
    Math.max(
      SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN,
      rawSummaryCompleteMcBlankCount,
    ),
  );
  const setSummaryCompleteMcBlankCount = (next: number) => {
    const clamped = Math.min(
      SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX,
      Math.max(SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN, Math.round(next)),
    );
    setQuestionTypeSettings((prev) => ({
      ...prev,
      SUMMARY_COMPLETE_MC: {
        ...(prev.SUMMARY_COMPLETE_MC || {}),
        blankCount: clamped,
      },
    }));
  };
  const summaryCompleteSettings = questionTypeSettings.SUMMARY_COMPLETE || {};
  const rawSummaryCompleteBlankCount = Math.round(
    Number(
      summaryCompleteSettings.blankCount ??
        summaryCompleteSettings.summaryBlankCount,
    ) || SUMMARY_COMPLETE_BLANK_COUNT_DEFAULT,
  );
  const summaryCompleteBlankCount = Math.min(
    SUMMARY_COMPLETE_BLANK_COUNT_MAX,
    Math.max(SUMMARY_COMPLETE_BLANK_COUNT_MIN, rawSummaryCompleteBlankCount),
  );
  const setSummaryCompleteBlankCount = (next: number) => {
    const clamped = Math.min(
      SUMMARY_COMPLETE_BLANK_COUNT_MAX,
      Math.max(SUMMARY_COMPLETE_BLANK_COUNT_MIN, Math.round(next)),
    );
    setQuestionTypeSettings((prev) => ({
      ...prev,
      SUMMARY_COMPLETE: {
        ...(prev.SUMMARY_COMPLETE || {}),
        blankCount: clamped,
      },
    }));
  };
  const irrelevantSettings = questionTypeSettings.IRRELEVANT || {};
  const rawIrrelevantSlotCount = Math.round(
    Number(irrelevantSettings.slotCount) || IRRELEVANT_SLOT_COUNT_DEFAULT,
  );
  const irrelevantSlotCount = Math.min(
    IRRELEVANT_SLOT_COUNT_MAX,
    Math.max(IRRELEVANT_SLOT_COUNT_MIN, rawIrrelevantSlotCount),
  );
  const setIrrelevantSlotCount = (next: number) => {
    const clamped = Math.min(
      IRRELEVANT_SLOT_COUNT_MAX,
      Math.max(IRRELEVANT_SLOT_COUNT_MIN, Math.round(next)),
    );
    setQuestionTypeSettings((prev) => ({
      ...prev,
      IRRELEVANT: {
        ...(prev.IRRELEVANT || {}),
        slotCount: clamped,
      },
    }));
  };
  const grammarErrorSettings = questionTypeSettings.GRAMMAR_ERROR || {};
  const rawGrammarMarkerCount = Math.round(
    Number(
      grammarErrorSettings.markerCount ?? grammarErrorSettings.errorCount,
    ) || GRAMMAR_MARKER_COUNT_DEFAULT,
  );
  const grammarMarkerCount = Math.min(
    GRAMMAR_MARKER_COUNT_MAX,
    Math.max(GRAMMAR_MARKER_COUNT_MIN, rawGrammarMarkerCount),
  );
  const rawGrammarAnswerCount = Math.round(
    Number(
      grammarErrorSettings.answerCount ??
        grammarErrorSettings.correctAnswerCount,
    ) || GRAMMAR_ANSWER_COUNT_DEFAULT,
  );
  const grammarAnswerMax = Math.max(
    GRAMMAR_ANSWER_COUNT_MIN,
    grammarMarkerCount,
  );
  const grammarAnswerCount = Math.min(
    grammarAnswerMax,
    Math.max(GRAMMAR_ANSWER_COUNT_MIN, rawGrammarAnswerCount),
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
        answerCount: Math.min(
          Math.max(GRAMMAR_ANSWER_COUNT_MIN, clamped),
          Math.max(
            GRAMMAR_ANSWER_COUNT_MIN,
            Math.round(
              Number(prev.GRAMMAR_ERROR?.answerCount) ||
                GRAMMAR_ANSWER_COUNT_DEFAULT,
            ),
          ),
        ),
      },
    }));
  };
  const setGrammarAnswerCount = (next: number) => {
    const clamped = Math.min(
      grammarAnswerMax,
      Math.max(GRAMMAR_ANSWER_COUNT_MIN, Math.round(next)),
    );
    setQuestionTypeSettings((prev) => ({
      ...prev,
      GRAMMAR_ERROR: {
        ...(prev.GRAMMAR_ERROR || {}),
        markerCount: grammarMarkerCount,
        answerCount: clamped,
      },
    }));
  };
  useEffect(() => {
    if (rawGrammarAnswerCount !== grammarAnswerCount) {
      setGrammarAnswerCount(grammarAnswerCount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grammarAnswerMax]);

  const grammarCorrectionSettings = questionTypeSettings.GRAMMAR_CORRECTION || {};
  const rawGrammarCorrectionErrorCount = Math.round(
    Number(
      grammarCorrectionSettings.errorCount ??
        grammarCorrectionSettings.answerCount,
    ) || GRAMMAR_CORRECTION_ERROR_COUNT_DEFAULT,
  );
  const grammarCorrectionErrorCount = Math.min(
    GRAMMAR_CORRECTION_ERROR_COUNT_MAX,
    Math.max(
      GRAMMAR_CORRECTION_ERROR_COUNT_MIN,
      rawGrammarCorrectionErrorCount,
    ),
  );
  const setGrammarCorrectionErrorCount = (next: number) => {
    const clamped = Math.min(
      GRAMMAR_CORRECTION_ERROR_COUNT_MAX,
      Math.max(GRAMMAR_CORRECTION_ERROR_COUNT_MIN, Math.round(next)),
    );
    setQuestionTypeSettings((prev) => ({
      ...prev,
      GRAMMAR_CORRECTION: {
        ...(prev.GRAMMAR_CORRECTION || {}),
        errorCount: clamped,
      },
    }));
  };

  useEffect(() => {
    setTypeOrder((prev) => normalizeTypeOrder(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTypeIds.join("|")]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        TYPE_ORDER_STORAGE_KEY,
        JSON.stringify(normalizeTypeOrder(typeOrder)),
      );
    } catch {
      // Type order is a convenience setting; ignore storage failures.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeOrder]);

  const orderTypeCounts = (order: string[], source: Record<string, number>) => {
    const normalized = normalizeTypeOrder(order);
    const next: Record<string, number> = {};
    for (const id of normalized) {
      const value = Number(source[id] || 0);
      if (value > 0) next[id] = value;
    }
    for (const [id, value] of Object.entries(source)) {
      if (!normalized.includes(id) && Number(value) > 0) next[id] = value;
    }
    return next;
  };

  const applyTypeCount = (id: string, count: number) => {
    const ordered = normalizeTypeOrder(typeOrder);
    setTypeCounts((prev) => {
      const draft = { ...prev };
      if (count <= 0) delete draft[id];
      else draft[id] = count;
      return orderTypeCounts(ordered, draft);
    });
  };

  const incrementTypeCount = (id: string) => {
    const ordered = normalizeTypeOrder(typeOrder);
    setTypeCounts((prev) => {
      const draft = { ...prev };
      draft[id] = Number(prev[id] || 0) + 1;
      return orderTypeCounts(ordered, draft);
    });
  };

  const isTypeControlTarget = (target: HTMLElement | null) => {
    return Boolean(
      target?.closest(
        "button,a,input,textarea,select,label,[data-ignore-type-section-click]",
      ),
    );
  };

  const handleTypeSectionClick = (event, id: string) => {
    const target = event.target as HTMLElement | null;
    if (isTypeControlTarget(target)) {
      return;
    }
    incrementTypeCount(id);
  };

  const handleTypeSurfaceClick = (event, id: string) => {
    const target = event.target as HTMLElement | null;
    if (isTypeControlTarget(target)) {
      return;
    }
    event.stopPropagation();
    incrementTypeCount(id);
  };

  const dropTypeBlock = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return;
    const current = normalizeTypeOrder(typeOrder);
    const withoutSource = current.filter((id) => id !== sourceId);
    const targetIndex = withoutSource.indexOf(targetId);
    if (targetIndex < 0) return;
    const next = [...withoutSource];
    next.splice(targetIndex, 0, sourceId);
    setTypeOrder(next);
    setTypeCounts((prev) => orderTypeCounts(next, prev));
  };

  const getCategoryBadgeClass = (category: string) => {
    if (category === "수능/모의고사 객관식") {
      return "bg-sky-50 text-sky-700 ring-sky-100";
    }
    if (category === "내신 서술형") {
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    }
    if (category === "어휘") {
      return "bg-amber-50 text-amber-700 ring-amber-100";
    }
    return "bg-slate-50 text-slate-500 ring-slate-100";
  };

  const getCategoryShortLabel = (category: string) => {
    if (category === "수능/모의고사 객관식") return "수능모의";
    if (category === "내신 서술형") return "내신서술";
    return category;
  };

  const renderNumberSetting = ({
    title,
    badges,
    description,
    value,
    min,
    max,
    onChange,
    ariaBase,
  }) => (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold text-slate-800">
            {title}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {badges.map((badge) => (
            <span
              key={badge}
              className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600"
            >
              {badge}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
          {description}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
          aria-label={`${ariaBase} decrease`}
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
          aria-label={`${ariaBase} increase`}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  const renderTypeDetailContent = (typeId: string) => {
    if (typeId === "CONTENT_MATCH") {
      return (
        <div className="space-y-3">
          {renderNumberSetting({
            title: "Option count",
            badges: [
              `${CONTENT_MATCH_OPTION_COUNT_MIN} ~ ${CONTENT_MATCH_OPTION_COUNT_MAX}`,
              "Statements",
            ],
            description:
              "Number of visible content-match statements. Default is 5.",
            value: contentMatchOptionCount,
            min: CONTENT_MATCH_OPTION_COUNT_MIN,
            max: CONTENT_MATCH_OPTION_COUNT_MAX,
            onChange: setContentMatchOptionCount,
            ariaBase: "content match option count",
          })}
          <div className="border-t border-slate-100 pt-3">
            {renderNumberSetting({
              title: "Answer count",
              badges: [
                `1 ~ ${contentMatchAnswerMax}`,
                contentMatchAnswerCount >= 2 ? "Multi-answer" : "Single answer",
              ],
              description:
                "When this is 2 or more, the engine generates correctAnswers and a joined correctAnswer string.",
              value: contentMatchAnswerCount,
              min: CONTENT_MATCH_ANSWER_COUNT_MIN,
              max: contentMatchAnswerMax,
              onChange: setContentMatchAnswerCount,
              ariaBase: "content match answer count",
            })}
          </div>
        </div>
      );
    }

    if (typeId === "IRRELEVANT") {
      return renderNumberSetting({
        title: "Option count",
        badges: [
          `${IRRELEVANT_SLOT_COUNT_MIN} ~ ${IRRELEVANT_SLOT_COUNT_MAX}`,
          "Sentence slots",
        ],
        description:
          "Number of numbered sentence choices, including one inserted irrelevant sentence.",
        value: irrelevantSlotCount,
        min: IRRELEVANT_SLOT_COUNT_MIN,
        max: IRRELEVANT_SLOT_COUNT_MAX,
        onChange: setIrrelevantSlotCount,
        ariaBase: "irrelevant option count",
      });
    }

    if (typeId === "SUMMARY_COMPLETE") {
      return renderNumberSetting({
        title: "Blank count",
        badges: [
          `${SUMMARY_COMPLETE_BLANK_COUNT_MIN} ~ ${SUMMARY_COMPLETE_BLANK_COUNT_MAX}`,
          "Short answer",
        ],
        description:
          "Number of blanks students must fill in the short-answer summary.",
        value: summaryCompleteBlankCount,
        min: SUMMARY_COMPLETE_BLANK_COUNT_MIN,
        max: SUMMARY_COMPLETE_BLANK_COUNT_MAX,
        onChange: setSummaryCompleteBlankCount,
        ariaBase: "summary complete blank count",
      });
    }

    if (typeId === "GRAMMAR_ERROR") {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-800">
                  밑줄 표현 개수
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  5 ~ 10개
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  표시 위치
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                지문에서 검토할 밑줄 표현 수입니다. 정답 수는 아래에서 따로
                지정합니다.
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

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-800">
                  정답 개수
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  1 ~ {grammarAnswerMax}개
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  {grammarAnswerCount >= 2 ? "모두 고르기" : "단일 정답"}
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                기본값은 1개입니다. 2개 이상이면 발문에 개수를 쓰지 않고 어법상
                틀린 것을 모두 고르라고 안내합니다.
              </p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setGrammarAnswerCount(grammarAnswerCount - 1)}
                disabled={grammarAnswerCount <= GRAMMAR_ANSWER_COUNT_MIN}
                className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                aria-label="정답 개수 줄이기"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">
                {grammarAnswerCount}
              </span>
              <button
                type="button"
                onClick={() => setGrammarAnswerCount(grammarAnswerCount + 1)}
                disabled={grammarAnswerCount >= grammarAnswerMax}
                className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
                aria-label="정답 개수 늘리기"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (typeId === "GRAMMAR_CORRECTION") {
      return (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-bold text-slate-800">
                틀린 밑줄 개수
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                1 ~ 5개
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                밑줄=오류
              </span>
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
              지문에 밑줄 칠 문장/절 구간 수입니다. 선택한 모든 밑줄 구간 안에는
              어법 오류가 숨어 있어야 합니다.
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                setGrammarCorrectionErrorCount(grammarCorrectionErrorCount - 1)
              }
              disabled={
                grammarCorrectionErrorCount <=
                GRAMMAR_CORRECTION_ERROR_COUNT_MIN
              }
              className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
              aria-label="틀린 밑줄 개수 줄이기"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">
              {grammarCorrectionErrorCount}
            </span>
            <button
              type="button"
              onClick={() =>
                setGrammarCorrectionErrorCount(grammarCorrectionErrorCount + 1)
              }
              disabled={
                grammarCorrectionErrorCount >=
                GRAMMAR_CORRECTION_ERROR_COUNT_MAX
              }
              className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
              aria-label="틀린 밑줄 개수 늘리기"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      );
    }

    if (typeId === "SUMMARY_COMPLETE_MC") {
      return (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-bold text-slate-800">
                요약 빈칸 개수
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                2 ~ 4개
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                객관식 조합
              </span>
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
              기본값은 2개입니다. 3개 이상이면 각 선지에 모든 빈칸 값을 맞춰 생성합니다.
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                setSummaryCompleteMcBlankCount(summaryCompleteMcBlankCount - 1)
              }
              disabled={
                summaryCompleteMcBlankCount <=
                SUMMARY_COMPLETE_MC_BLANK_COUNT_MIN
              }
              className="w-7 h-7 rounded-md flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
              aria-label="요약 빈칸 개수 줄이기"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-6 text-center text-[12px] font-bold tabular-nums text-blue-700">
              {summaryCompleteMcBlankCount}
            </span>
            <button
              type="button"
              onClick={() =>
                setSummaryCompleteMcBlankCount(summaryCompleteMcBlankCount + 1)
              }
              disabled={
                summaryCompleteMcBlankCount >=
                SUMMARY_COMPLETE_MC_BLANK_COUNT_MAX
              }
              className="w-7 h-7 rounded-md flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-100 disabled:text-slate-200 disabled:hover:bg-transparent transition-colors"
              aria-label="요약 빈칸 개수 늘리기"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      );
    }

    if (typeId === "BLANK_INFERENCE") {
      return (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-bold text-slate-800">
                부정-부정 빈칸
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                정답 변형
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                부정어 함정
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                킬러형
              </span>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!blankSettings.doubleNegative}
            onClick={() =>
              updateBlankSetting({
                doubleNegative: !blankSettings.doubleNegative,
              })
            }
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
      );
    }

    return null;
  };

  return (
    <div className="flex flex-1 min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white">
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
        {/* Mode Toggle */}
        <div className="px-5 pt-5 pb-3 shrink-0">
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
            {FEATURE_FLAGS.ENABLE_LONG_PASSAGE_SETS && (
              <button
                onClick={() => setGenMode("set")}
                className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
                  genMode === "set"
                    ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <FileText className="w-4 h-4" />
                장문 세트
              </button>
            )}
          </div>
        </div>

        {/* Model selector */}
        {FEATURE_FLAGS.SHOW_MODEL_SELECTOR && (
          <div className="px-5 pb-3 shrink-0">
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
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`}
                        />
                        <span className="text-[12px] font-bold truncate">
                          {plan.shortLabel}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold tabular-nums ${active ? "text-blue-600" : "text-slate-400"}`}
                      >
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
          <div className="px-5 py-3 flex flex-1 min-h-0 flex-col gap-3">
            {/* 문제 수 — minimal inline control */}
            <div className="flex items-center justify-between gap-2 shrink-0">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                문제 수
              </span>
              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shrink-0">
                <button
                  onClick={() => setAutoCount(Math.max(1, autoCount - 1))}
                  className="w-7 h-8 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  aria-label="문제 수 줄이기"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 h-8 flex items-center justify-center text-[13px] font-bold text-slate-700 border-x border-slate-200 bg-slate-50/50 tabular-nums">
                  {autoCount}
                </span>
                <button
                  onClick={() => setAutoCount(Math.min(20, autoCount + 1))}
                  className="w-7 h-8 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  aria-label="문제 수 늘리기"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Difficulty */}
            <div className="flex gap-2 shrink-0">
              {DIFFICULTY_TONES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDifficulty(d.value)}
                  className={`flex-1 h-8 rounded-lg text-[12px] font-semibold transition-all duration-150 border ${
                    difficulty === d.value ? d.selected : d.idle
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Custom prompt */}
            <PromptSection
              fill
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
          <div className="px-5 py-3 space-y-3">
            {/* Difficulty */}
            <div className="flex gap-2">
              {DIFFICULTY_TONES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDifficulty(d.value)}
                  className={`flex-1 h-8 rounded-lg text-[12px] font-semibold transition-all duration-150 border ${
                    difficulty === d.value ? d.selected : d.idle
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Type selection blocks */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                {orderedTypeItems.map((item) => {
                  const count = typeCounts[item.id] || 0;
                  const active = count > 0;
                  const hasDetailSettings = DETAIL_SETTING_TYPE_IDS.has(
                    item.id,
                  );
                  const expanded =
                    hasDetailSettings && expandedTypeId === item.id;
                  const dragging = draggingTypeId === item.id;
                  const dragOver =
                    dragOverTypeId === item.id && draggingTypeId !== item.id;

                  return (
                    <section
                      key={item.id}
                      data-question-type-id={item.id}
                      onClick={(event) =>
                        handleTypeSectionClick(event, item.id)
                      }
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (draggingTypeId && draggingTypeId !== item.id) {
                          setDragOverTypeId(item.id);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId =
                          draggingTypeId ||
                          event.dataTransfer.getData("text/plain");
                        dropTypeBlock(sourceId, item.id);
                        setDraggingTypeId(null);
                        setDragOverTypeId(null);
                      }}
                      className={`group cursor-pointer overflow-hidden rounded-xl border bg-white transition-all ${
                        dragOver
                          ? "border-blue-300 shadow-[0_0_0_2px_rgba(59,130,246,0.12)]"
                          : active
                            ? "border-blue-300 shadow-sm shadow-blue-50"
                            : "border-slate-200 shadow-sm hover:border-slate-300"
                      } ${dragging ? "opacity-50" : ""}`}
                    >
                      <div
                        onClick={(event) =>
                          handleTypeSurfaceClick(event, item.id)
                        }
                        className={`flex items-center gap-1.5 border-b px-2.5 py-1 ${
                          active
                            ? "border-blue-100 bg-blue-50/70"
                            : "border-slate-100 bg-slate-50/70"
                        }`}
                      >
                        <button
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            setDraggingTypeId(item.id);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", item.id);
                          }}
                          onDragEnd={() => {
                            setDraggingTypeId(null);
                            setDragOverTypeId(null);
                          }}
                          className="flex h-7 w-7 cursor-grab items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-700 active:cursor-grabbing"
                          title={`${item.label} 순서 드래그`}
                          aria-label={`${item.label} 순서 드래그`}
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            applyTypeCount(item.id, count + 1);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-white"
                          aria-label={`${item.label} 1개 추가`}
                        >
                          <span
                            className={`min-w-0 flex-1 truncate text-[12px] font-black ${
                              active ? "text-blue-800" : "text-slate-700"
                            }`}
                          >
                            {item.label}
                          </span>
                          <span
                            title={item.groupLabel}
                            className={`min-w-0 max-w-[42px] shrink rounded px-1.5 py-0.5 text-[9.5px] font-bold ring-1 sm:max-w-[54px] ${getCategoryBadgeClass(item.groupLabel)}`}
                          >
                            <span className="block truncate">
                              {getCategoryShortLabel(item.groupLabel)}
                            </span>
                          </span>
                          {active && (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                          )}
                        </button>

                        <div className="grid w-[108px] shrink-0 grid-cols-[76px_28px] items-center gap-1">
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                applyTypeCount(item.id, Math.max(0, count - 1))
                              }
                              disabled={!active}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-blue-400 transition-colors hover:bg-white hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-200"
                              aria-label={`${item.label} 개수 줄이기`}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span
                              className={`w-5 text-center text-[12px] font-bold tabular-nums ${
                                active ? "text-blue-700" : "text-slate-300"
                              }`}
                            >
                              {count}
                            </span>
                            <button
                              type="button"
                              onClick={() => applyTypeCount(item.id, count + 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-blue-500 transition-colors hover:bg-white hover:text-blue-700"
                              aria-label={`${item.label} 개수 늘리기`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {hasDetailSettings ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedTypeId(expanded ? null : item.id)
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-500 ring-1 ring-blue-100 transition-colors hover:bg-blue-100 hover:text-blue-700"
                              title={`${item.label} ${expanded ? "접기" : "펼치기"}`}
                              aria-label={`${item.label} ${expanded ? "접기" : "펼치기"}`}
                            >
                              {expanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="h-7 w-7" aria-hidden="true" />
                          )}
                        </div>
                      </div>

                      {expanded ? (
                        <div
                          onClick={(event) =>
                            handleTypeSurfaceClick(event, item.id)
                          }
                          className="px-3 py-3"
                        >
                          {renderTypeDetailContent(item.id)}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>

              {totalQuestions > 0 && (
                <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200/60">
                  <div className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-[12px] font-semibold text-blue-800">
                      총{" "}
                      <strong className="text-blue-700">
                        {totalQuestions}
                      </strong>
                      문제
                      <span className="text-blue-500 font-medium ml-1">
                        ({activeTypeItems.length}개 유형)
                      </span>
                    </span>
                  </div>
                  <button
                    onClick={() => setTypeCounts({})}
                    className="text-[11px] text-blue-500 hover:text-blue-700 font-medium transition-colors"
                  >
                    초기화
                  </button>
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

        {genMode === "set" && (
          <>
            {workspaceActive ? (
              <p className="mx-4 mt-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-slate-500">
                장문 세트는 왼쪽 ‘내 지문’에서 체크한 지문 1개로 동작합니다 —
                워크스페이스에 불러온 지문({workspaceRowCount}개)은 여기에
                사용되지 않아요.
              </p>
            ) : null}
            <SetBuilderPanel
              passageId={
                selectedIds && selectedIds.size > 0
                  ? Array.from(selectedIds)[0]
                  : null
              }
              generationPlan={generationPlan}
            />
          </>
        )}
      </div>

      {/* Generate Button — 워크스페이스 모드 */}
      {genMode !== "set" && workspaceActive && (
        <div className="px-5 py-3 border-t border-slate-100 bg-white shrink-0">
          {workspaceVariantCount > 0 ? (
            <p className="mb-2 rounded-md bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-blue-600">
              수정·범위 지정된 {workspaceVariantCount}개 지문은 생성 시
              ‘변형본’ 지문으로 저장된 뒤 출제됩니다. 원본 지문은 그대로
              보존돼요.
            </p>
          ) : null}
          {workspaceUnloadedSelectedCount > 0 ? (
            <p className="mb-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-slate-500">
              왼쪽에서 체크한 {workspaceUnloadedSelectedCount}개 지문은 아직
              워크스페이스에 없어요 — ‘선택 지문 불러오기’를 눌러야 생성에
              포함됩니다.
            </p>
          ) : null}
          <Button
            className={`relative w-full h-12 rounded-xl text-[14px] font-bold transition-all duration-200 ${
              workspaceTotalQuestions > 0 && !workspaceGenerating
                ? "bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200/50 hover:shadow-lg hover:shadow-blue-200/60"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
            onClick={onWorkspaceGenerate}
            disabled={workspaceTotalQuestions === 0 || workspaceGenerating}
          >
            {workspaceTotalQuestions > 0 &&
              workspaceCreditCost > 0 &&
              !workspaceGenerating && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] font-bold tabular-nums text-white">
                  <Coins className="w-3 h-3" />
                  {workspaceCreditCost}크레딧
                </span>
              )}
            {workspaceGenerating ? (
              <span className="flex items-center gap-2">
                <Cpu className="w-4.5 h-4.5 animate-pulse" />
                생성 중…
              </span>
            ) : workspaceTotalQuestions > 0 ? (
              <span className="flex items-center gap-2">
                <Cpu className="w-4.5 h-4.5" />
                {`불러온 ${workspaceRowCount}개 지문 · ${workspaceTotalQuestions}문제 생성`}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Target className="w-4.5 h-4.5" />
                유형을 선택하세요
              </span>
            )}
          </Button>
        </div>
      )}

      {/* Generate Button — 기존 라이브러리 선택 모드 */}
      {genMode !== "set" && !workspaceActive && (
      <div className="px-5 py-3 border-t border-slate-100 bg-white shrink-0">
        {(() => {
          // 크레딧 비용 계산
          const baseCreditCost =
            genMode === "auto"
              ? CREDIT_COSTS.AUTO_GEN_BATCH * selectedIds.size
              : selectedIds.size *
                Object.entries(typeCounts).reduce((sum, [typeId, value]) => {
                  if (value <= 0) return sum;
                  const unitCost = VOCAB_GENERATION_TYPE_IDS.has(typeId)
                    ? CREDIT_COSTS.QUESTION_GEN_VOCAB
                    : CREDIT_COSTS.QUESTION_GEN_SINGLE;
                  return sum + unitCost * value;
                }, 0);
          const creditCost = getQuestionGenerationCreditCost(
            baseCreditCost,
            generationPlan,
          );
          return (
            <>
              <Button
                className={`relative w-full h-12 rounded-xl text-[14px] font-bold transition-all duration-200 ${
                  canGenerate
                    ? "bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200/50 hover:shadow-lg hover:shadow-blue-200/60"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
                onClick={handleBatchGenerate}
                disabled={!canGenerate}
              >
                {canGenerate && creditCost > 0 && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] font-bold tabular-nums text-white">
                    <Coins className="w-3 h-3" />
                    {creditCost}크레딧
                  </span>
                )}
                {selectedIds.size === 0 ? (
                  <span className="flex items-center gap-2">
                    <FileText className="w-4.5 h-4.5" />
                    지문을 선택하세요
                  </span>
                ) : genMode === "auto" ? (
                  <span className="flex items-center gap-2">
                    <Zap className="w-4.5 h-4.5" />
                    {selectedIds.size === 1
                      ? `${autoCount}문제 자동 생성`
                      : `${selectedIds.size}개 지문 × ${autoCount}문제 생성`}
                  </span>
                ) : totalQuestions > 0 ? (
                  <span className="flex items-center gap-2">
                    <Cpu className="w-4.5 h-4.5" />
                    {selectedIds.size === 1
                      ? `${totalQuestions}문제 생성`
                      : `${selectedIds.size}개 지문 × ${totalQuestions}문제 생성`}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Target className="w-4.5 h-4.5" />
                    유형을 선택하세요
                  </span>
                )}
              </Button>
            </>
          );
        })()}
      </div>
      )}
    </div>
  );
}
