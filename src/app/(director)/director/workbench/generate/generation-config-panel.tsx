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
  VOCAB_CHOICE_ANSWER_COUNT_MIN,
  VOCAB_CHOICE_MARKER_COUNT_MAX,
  VOCAB_CHOICE_MARKER_COUNT_MIN,
  GENERIC_OPTION_COUNT_MAX,
  GENERIC_OPTION_COUNT_MIN,
  SENTENCE_INSERT_SLOT_COUNT_MAX,
  SENTENCE_INSERT_SLOT_COUNT_MIN,
  ANTONYM_PAIR_COUNT_MAX,
  ANTONYM_PAIR_COUNT_MIN,
  BLANK_INFERENCE_BLANK_COUNT_MAX,
  BLANK_INFERENCE_BLANK_COUNT_MIN,
  getQuestionLanguageToggleScope,
  readAntonymPairCountSetting,
  readBlankInferenceBlankCountSetting,
  readGenericAnswerCountSetting,
  readGenericOptionCountSetting,
  readOptionLanguageSetting,
  readSentenceInsertSlotCountSetting,
  readStemLanguageSetting,
  readVocabChoiceAnswerCountSetting,
  readVocabChoiceMarkerCountSetting,
  supportsGenericOptionCount,
} from "@/lib/question-type-generation-settings";

const VOCAB_GENERATION_TYPE_IDS = new Set([
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
]);
const TYPE_ORDER_STORAGE_KEY =
  "smoat.workbench.questions.generate.typeOrder.v1";

// Difficulty — 세그먼트 컨트롤. 단계 식별은 컬러 닷으로만 (면색 남용 금지).
const DIFFICULTY_TONES = [
  { value: "BASIC", label: "기본", dot: "bg-blue-500" },
  { value: "INTERMEDIATE", label: "중급", dot: "bg-violet-500" },
  { value: "KILLER", label: "킬러", dot: "bg-red-500" },
] as const;

// 난이도 세그먼트 — 자동/유형지정 모드 공통.
function DifficultySegment({
  difficulty,
  setDifficulty,
}: {
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  setDifficulty: (v: "BASIC" | "INTERMEDIATE" | "KILLER") => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        난이도
      </span>
      <div className="flex h-8 flex-1 rounded-lg bg-slate-100 p-0.5">
        {DIFFICULTY_TONES.map((d) => {
          const active = difficulty === d.value;
          return (
            <button
              key={d.value}
              type="button"
              onClick={() => setDifficulty(d.value)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-[6px] text-[12px] transition-all duration-150 ${
                active
                  ? "bg-white font-bold text-slate-800 shadow-sm"
                  : "font-semibold text-slate-400 hover:text-slate-600"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.dot} ${
                  active ? "" : "opacity-40"
                }`}
                aria-hidden="true"
              />
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  const patchTypeSettings = (
    typeId: string,
    patch: Record<string, unknown>,
  ) => {
    setQuestionTypeSettings((prev) => {
      const current = prev[typeId];
      const currentRecord =
        current && typeof current === "object" && !Array.isArray(current)
          ? current
          : {};
      return {
        ...prev,
        [typeId]: {
          ...currentRecord,
          ...patch,
        },
      };
    });
  };
  const getTypeStemLanguage = (typeId: string) =>
    readStemLanguageSetting(questionTypeSettings[typeId], typeId);
  const getTypeOptionLanguage = (typeId: string) =>
    readOptionLanguageSetting(questionTypeSettings[typeId], typeId);
  const setTypeLanguage = (
    typeId: string,
    key: "stemLanguage" | "optionLanguage",
    next: "ko" | "en",
  ) => {
    patchTypeSettings(typeId, { [key]: next });
  };
  const vocabChoiceMarkerCount = readVocabChoiceMarkerCountSetting(
    questionTypeSettings.VOCAB_CHOICE,
  );
  const vocabChoiceAnswerCount = readVocabChoiceAnswerCountSetting(
    questionTypeSettings.VOCAB_CHOICE,
    vocabChoiceMarkerCount,
  );
  const vocabChoiceAnswerMax = vocabChoiceMarkerCount;
  const setVocabChoiceMarkerCount = (next: number) => {
    const clamped = Math.min(
      VOCAB_CHOICE_MARKER_COUNT_MAX,
      Math.max(VOCAB_CHOICE_MARKER_COUNT_MIN, Math.round(next)),
    );
    patchTypeSettings("VOCAB_CHOICE", {
      markerCount: clamped,
      answerCount: Math.min(clamped, vocabChoiceAnswerCount),
    });
  };
  const setVocabChoiceAnswerCount = (next: number) => {
    const clamped = Math.min(
      vocabChoiceAnswerMax,
      Math.max(VOCAB_CHOICE_ANSWER_COUNT_MIN, Math.round(next)),
    );
    patchTypeSettings("VOCAB_CHOICE", {
      markerCount: vocabChoiceMarkerCount,
      answerCount: clamped,
    });
  };
  const sentenceInsertSlotCount = readSentenceInsertSlotCountSetting(
    questionTypeSettings.SENTENCE_INSERT,
  );
  const setSentenceInsertSlotCount = (next: number) => {
    const clamped = Math.min(
      SENTENCE_INSERT_SLOT_COUNT_MAX,
      Math.max(SENTENCE_INSERT_SLOT_COUNT_MIN, Math.round(next)),
    );
    patchTypeSettings("SENTENCE_INSERT", { slotCount: clamped });
  };
  const blankInferenceBlankCount = readBlankInferenceBlankCountSetting(
    questionTypeSettings.BLANK_INFERENCE,
  );
  const setBlankInferenceBlankCount = (next: number) => {
    const clamped = Math.min(
      BLANK_INFERENCE_BLANK_COUNT_MAX,
      Math.max(BLANK_INFERENCE_BLANK_COUNT_MIN, Math.round(next)),
    );
    patchTypeSettings("BLANK_INFERENCE", { blankCount: clamped });
  };
  const antonymPairCount = readAntonymPairCountSetting(
    questionTypeSettings.ANTONYM,
  );
  const setAntonymPairCount = (next: number) => {
    const clamped = Math.min(
      ANTONYM_PAIR_COUNT_MAX,
      Math.max(ANTONYM_PAIR_COUNT_MIN, Math.round(next)),
    );
    patchTypeSettings("ANTONYM", { pairCount: clamped });
  };
  const getGenericOptionCount = (typeId: string) =>
    readGenericOptionCountSetting(questionTypeSettings[typeId], typeId);
  const getGenericAnswerCount = (typeId: string) =>
    readGenericAnswerCountSetting(
      questionTypeSettings[typeId],
      typeId,
      getGenericOptionCount(typeId),
    );
  const setGenericOptionCount = (typeId: string, next: number) => {
    const clamped = Math.min(
      GENERIC_OPTION_COUNT_MAX,
      Math.max(GENERIC_OPTION_COUNT_MIN, Math.round(next)),
    );
    patchTypeSettings(typeId, {
      optionCount: clamped,
      answerCount: Math.min(clamped - 1, getGenericAnswerCount(typeId)),
    });
  };
  const setGenericAnswerCount = (typeId: string, next: number) => {
    const optionCount = getGenericOptionCount(typeId);
    const clamped = Math.min(
      Math.max(1, optionCount - 1),
      Math.max(1, Math.round(next)),
    );
    patchTypeSettings(typeId, { optionCount, answerCount: clamped });
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

  // 카테고리는 행마다 텍스트 배지를 반복하지 않고 컬러 닷 + 상단 범례로 표기.
  const getCategoryDotClass = (category: string) => {
    if (category === "수능/모의고사 객관식") return "bg-sky-400";
    if (category === "내신 서술형") return "bg-emerald-400";
    if (category === "어휘") return "bg-violet-400";
    return "bg-slate-300";
  };

  const categoryLegend = [
    { label: "수능·모의", dot: "bg-sky-400" },
    { label: "내신 서술", dot: "bg-emerald-400" },
    { label: "어휘", dot: "bg-violet-400" },
  ];

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

  const renderLanguageSetting = ({
    title,
    value,
    onChange,
    description,
  }) => (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="text-[12px] font-bold text-slate-800">
          {title}
        </span>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
          {description}
        </p>
      </div>
      <div className="flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5">
        {[
          { value: "ko", label: "한국어" },
          { value: "en", label: "영어" },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${
              value === item.value
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );

  const renderTypeNumericDetailContent = (typeId: string) => {
    if (typeId === "CONTENT_MATCH") {
      return (
        <div className="space-y-3">
          {renderNumberSetting({
            title: "보기 개수",
            badges: [
              `${CONTENT_MATCH_OPTION_COUNT_MIN} ~ ${CONTENT_MATCH_OPTION_COUNT_MAX}`,
              "진술문",
            ],
            description:
              "학생에게 표시할 내용 일치 진술문 수입니다. 기본값은 5개입니다.",
            value: contentMatchOptionCount,
            min: CONTENT_MATCH_OPTION_COUNT_MIN,
            max: CONTENT_MATCH_OPTION_COUNT_MAX,
            onChange: setContentMatchOptionCount,
            ariaBase: "content match option count",
          })}
          <div className="border-t border-slate-100 pt-3">
            {renderNumberSetting({
              title: "정답 개수",
              badges: [
                `1 ~ ${contentMatchAnswerMax}`,
                contentMatchAnswerCount >= 2 ? "복수 정답" : "단일 정답",
              ],
              description:
                "2개 이상이면 복수 정답 문항으로 생성하고 모든 정답 라벨을 함께 저장합니다.",
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
      const isMultiBlank = blankInferenceBlankCount >= 2;
      return (
        <div className="space-y-3">
          {renderNumberSetting({
            title: "빈칸 개수",
            badges: [
              `${BLANK_INFERENCE_BLANK_COUNT_MIN} ~ ${BLANK_INFERENCE_BLANK_COUNT_MAX}`,
              isMultiBlank ? "(A)(B) 조합 보기" : "단일 빈칸",
            ],
            description:
              "기본값 1개는 수능형 단일 빈칸입니다. 2개 이상이면 (A)(B)(C) 빈칸과 조합 보기로 생성합니다.",
            value: blankInferenceBlankCount,
            min: BLANK_INFERENCE_BLANK_COUNT_MIN,
            max: BLANK_INFERENCE_BLANK_COUNT_MAX,
            onChange: setBlankInferenceBlankCount,
            ariaBase: "blank inference blank count",
          })}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-800">
                  빈칸 변형
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  정답 패러프레이즈
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  난이도별 어휘
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  오답 균질화
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                정답 선지를 원문 그대로 내지 않고, 지문 의미를 보존한
                패러프레이즈로 생성합니다.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!blankSettings.paraphraseAnswer}
              onClick={() => {
                const next = !blankSettings.paraphraseAnswer;
                updateBlankSetting({
                  paraphraseAnswer: next,
                  ...(next ? { doubleNegative: false } : {}),
                });
              }}
              className={`relative h-6 w-11 rounded-full border transition-colors ${
                blankSettings.paraphraseAnswer
                  ? "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  blankSettings.paraphraseAnswer
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[12px] font-bold ${isMultiBlank ? "text-slate-400" : "text-slate-800"}`}
                >
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
              {isMultiBlank ? (
                <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                  빈칸 1개일 때만 사용할 수 있습니다.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!isMultiBlank && !!blankSettings.doubleNegative}
              disabled={isMultiBlank}
              onClick={() => {
                const next = !blankSettings.doubleNegative;
                updateBlankSetting({
                  doubleNegative: next,
                  ...(next ? { paraphraseAnswer: false } : {}),
                });
              }}
              className={`relative h-6 w-11 rounded-full border transition-colors ${
                isMultiBlank
                  ? "cursor-not-allowed border-slate-200 bg-slate-100"
                  : blankSettings.doubleNegative
                    ? "border-blue-300 bg-blue-500"
                    : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  !isMultiBlank && blankSettings.doubleNegative
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      );
    }

    if (typeId === "VOCAB_CHOICE") {
      return (
        <div className="space-y-3">
          {renderNumberSetting({
            title: "밑줄 어휘 개수",
            badges: [
              `${VOCAB_CHOICE_MARKER_COUNT_MIN} ~ ${VOCAB_CHOICE_MARKER_COUNT_MAX}`,
              "표시 위치",
            ],
            description:
              "지문에 밑줄 칠 어휘 수입니다. 정답(부적절한 어휘) 수는 아래에서 따로 지정합니다.",
            value: vocabChoiceMarkerCount,
            min: VOCAB_CHOICE_MARKER_COUNT_MIN,
            max: VOCAB_CHOICE_MARKER_COUNT_MAX,
            onChange: setVocabChoiceMarkerCount,
            ariaBase: "vocab choice marker count",
          })}
          <div className="border-t border-slate-100 pt-3">
            {renderNumberSetting({
              title: "정답 개수",
              badges: [
                `1 ~ ${vocabChoiceAnswerMax}`,
                vocabChoiceAnswerCount >= 2 ? "모두 고르기" : "단일 정답",
              ],
              description:
                "기본값은 1개입니다. 2개 이상이면 발문에 개수를 쓰지 않고 부적절한 어휘를 모두 고르라고 안내합니다.",
              value: vocabChoiceAnswerCount,
              min: VOCAB_CHOICE_ANSWER_COUNT_MIN,
              max: vocabChoiceAnswerMax,
              onChange: setVocabChoiceAnswerCount,
              ariaBase: "vocab choice answer count",
            })}
          </div>
        </div>
      );
    }

    if (typeId === "SENTENCE_INSERT") {
      return renderNumberSetting({
        title: "삽입 위치 개수",
        badges: [
          `${SENTENCE_INSERT_SLOT_COUNT_MIN} ~ ${SENTENCE_INSERT_SLOT_COUNT_MAX}`,
          "①~ 마커",
        ],
        description:
          "지문에 표시할 삽입 위치(①~) 수입니다. 정답은 항상 1곳이며, 위치 수만큼 지문 문장이 필요해 짧은 지문은 생성에 실패할 수 있습니다.",
        value: sentenceInsertSlotCount,
        min: SENTENCE_INSERT_SLOT_COUNT_MIN,
        max: SENTENCE_INSERT_SLOT_COUNT_MAX,
        onChange: setSentenceInsertSlotCount,
        ariaBase: "sentence insert slot count",
      });
    }

    if (typeId === "ANTONYM") {
      return renderNumberSetting({
        title: "단어 쌍 개수",
        badges: [
          `${ANTONYM_PAIR_COUNT_MIN} ~ ${ANTONYM_PAIR_COUNT_MAX}`,
          "(A)~ 쌍",
        ],
        description:
          "지문 단어와 짝 단어 쌍의 수입니다. 정답(잘못 짝지어진 쌍)은 항상 1개입니다.",
        value: antonymPairCount,
        min: ANTONYM_PAIR_COUNT_MIN,
        max: ANTONYM_PAIR_COUNT_MAX,
        onChange: setAntonymPairCount,
        ariaBase: "antonym pair count",
      });
    }

    if (supportsGenericOptionCount(typeId)) {
      const genericOptionCount = getGenericOptionCount(typeId);
      const genericAnswerCount = getGenericAnswerCount(typeId);
      const genericAnswerMax = Math.max(1, genericOptionCount - 1);
      return (
        <div className="space-y-3">
          {renderNumberSetting({
            title: "보기 개수",
            badges: [
              `${GENERIC_OPTION_COUNT_MIN} ~ ${GENERIC_OPTION_COUNT_MAX}`,
              "선택지",
            ],
            description:
              "학생에게 표시할 보기 수입니다. 기본값은 5개입니다.",
            value: genericOptionCount,
            min: GENERIC_OPTION_COUNT_MIN,
            max: GENERIC_OPTION_COUNT_MAX,
            onChange: (next) => setGenericOptionCount(typeId, next),
            ariaBase: `${typeId} option count`,
          })}
          <div className="border-t border-slate-100 pt-3">
            {renderNumberSetting({
              title: "정답 개수",
              badges: [
                `1 ~ ${genericAnswerMax}`,
                genericAnswerCount >= 2 ? "모두 고르기" : "단일 정답",
              ],
              description:
                "기본값은 1개입니다. 2개 이상이면 발문에 개수를 쓰지 않고 적절한 것을 모두 고르라고 안내합니다.",
              value: genericAnswerCount,
              min: 1,
              max: genericAnswerMax,
              onChange: (next) => setGenericAnswerCount(typeId, next),
              ariaBase: `${typeId} answer count`,
            })}
          </div>
        </div>
      );
    }

    return null;
  };

  // Every type gets language toggles; numeric/special settings render above them.
  const renderTypeDetailContent = (typeId: string) => {
    const numericContent = renderTypeNumericDetailContent(typeId);
    const languageScope = getQuestionLanguageToggleScope(typeId);
    return (
      <div className="space-y-3">
        {numericContent}
        <div
          className={numericContent ? "border-t border-slate-100 pt-3" : undefined}
        >
          {renderLanguageSetting({
            title: "발문 언어",
            value: getTypeStemLanguage(typeId),
            description: "학생에게 보이는 발문(지시문) 언어입니다.",
            onChange: (value) => setTypeLanguage(typeId, "stemLanguage", value),
          })}
        </div>
        {languageScope === "stem-option" ? (
          <div className="border-t border-slate-100 pt-3">
            {renderLanguageSetting({
              title: "보기 언어",
              value: getTypeOptionLanguage(typeId),
              description: "학생에게 보이는 보기(선택지) 언어입니다.",
              onChange: (value) =>
                setTypeLanguage(typeId, "optionLanguage", value),
            })}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-1 min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white">
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
        {/* Mode Toggle — white-active 세그먼트 (난이도 세그먼트와 동일 문법) */}
        <div className="px-4 pt-4 pb-3 shrink-0">
          <div className="flex h-9 rounded-lg bg-slate-100 p-0.5">
            {(
              [
                { mode: "auto", label: "자동 생성", Icon: Zap },
                { mode: "manual", label: "유형 지정", Icon: Settings2 },
                ...(FEATURE_FLAGS.ENABLE_LONG_PASSAGE_SETS
                  ? [{ mode: "set", label: "장문 세트", Icon: FileText }]
                  : []),
              ] as const
            ).map(({ mode, label, Icon }) => {
              const active = genMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGenMode(mode)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-[6px] text-[12.5px] transition-all duration-150 ${
                    active
                      ? "bg-white font-bold text-blue-700 shadow-sm"
                      : "font-semibold text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 ${active ? "text-blue-600" : "text-slate-400"}`}
                  />
                  {label}
                </button>
              );
            })}
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
          <div className="px-4 py-3 flex flex-1 min-h-0 flex-col gap-3">
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
            <div className="shrink-0">
              <DifficultySegment
                difficulty={difficulty}
                setDifficulty={setDifficulty}
              />
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
          <div className="px-4 py-3 space-y-3">
            {/* Difficulty */}
            <DifficultySegment
              difficulty={difficulty}
              setDifficulty={setDifficulty}
            />

            {/* Type selection blocks — 단일 컨테이너 리스트 (카드 더미 금지) */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    문제 유형
                  </span>
                  <div className="flex items-center gap-2.5">
                    {categoryLegend.map((c) => (
                      <span
                        key={c.label}
                        className="flex items-center gap-1 text-[10px] font-medium text-slate-400"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${c.dot}`}
                          aria-hidden="true"
                        />
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-1.5 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                {orderedTypeItems.map((item) => {
                  const count = typeCounts[item.id] || 0;
                  const active = count > 0;
                  // Language toggles exist for every type, so every block expands.
                  const expanded = expandedTypeId === item.id;
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
                      className={`group cursor-pointer transition-colors ${
                        dragOver
                          ? "bg-blue-50 ring-1 ring-inset ring-blue-300"
                          : active
                            ? "bg-blue-50/40"
                            : "hover:bg-slate-50/80"
                      } ${dragging ? "opacity-50" : ""}`}
                    >
                      <div
                        onClick={(event) =>
                          handleTypeSurfaceClick(event, item.id)
                        }
                        className="flex h-10 items-center gap-0.5 pl-1 pr-1.5"
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
                          className="flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
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
                          className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left"
                          aria-label={`${item.label} 1개 추가`}
                        >
                          <span
                            title={item.groupLabel}
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${getCategoryDotClass(item.groupLabel)}`}
                            aria-hidden="true"
                          />
                          <span
                            className={`min-w-0 flex-1 truncate text-[12px] ${
                              active
                                ? "font-bold text-blue-800"
                                : "font-semibold text-slate-600"
                            }`}
                          >
                            {item.label}
                          </span>
                        </button>

                        <div className="grid w-[100px] shrink-0 grid-cols-[72px_28px] items-center">
                          <div className="flex items-center justify-end gap-0.5">
                            {/* 0개 행은 +만 — 죽은 −/0 을 14행에 반복하지 않는다.
                                +는 항상 같은 칸이라 세로 정렬이 유지된다. */}
                            {active ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    applyTypeCount(
                                      item.id,
                                      Math.max(0, count - 1),
                                    )
                                  }
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-blue-600"
                                  aria-label={`${item.label} 개수 줄이기`}
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="w-5 text-center text-[12.5px] font-bold tabular-nums text-blue-700">
                                  {count}
                                </span>
                              </>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => applyTypeCount(item.id, count + 1)}
                              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                                active
                                  ? "text-blue-500 hover:bg-white hover:text-blue-700"
                                  : "text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                              }`}
                              aria-label={`${item.label} 개수 늘리기`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {/* jay 파라미터 확장으로 모든 유형에 세부 옵션이 생겨
                              항상 노출 — 스타일은 워크스페이스 재설계 톤 유지 */}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTypeId(expanded ? null : item.id)
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                            title={`${item.label} 세부 옵션 ${expanded ? "접기" : "펼치기"}`}
                            aria-label={`${item.label} 세부 옵션 ${expanded ? "접기" : "펼치기"}`}
                          >
                            {expanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {expanded ? (
                        <div
                          onClick={(event) =>
                            handleTypeSurfaceClick(event, item.id)
                          }
                          className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-3"
                        >
                          {renderTypeDetailContent(item.id)}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
                </div>
              </div>

              {totalQuestions > 0 && (
                <div className="flex h-9 items-center justify-between rounded-lg border border-blue-200/70 bg-blue-50 pl-3 pr-1.5">
                  <span className="text-[12px] font-semibold text-blue-800">
                    총{" "}
                    <strong className="font-bold text-blue-700">
                      {totalQuestions}
                    </strong>
                    문제
                    <span className="ml-1 font-medium text-blue-500">
                      · {activeTypeItems.length}개 유형
                    </span>
                  </span>
                  <button
                    onClick={() => setTypeCounts({})}
                    className="h-6 rounded-md px-2 text-[11px] font-semibold text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-700"
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
        <div className="px-4 py-3 border-t border-slate-100 bg-white shrink-0">
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
              워크스페이스에 없어요 — ‘선택 지문 편집하기’를 눌러야 생성에
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
                {`지문 ${workspaceRowCount}개 · ${workspaceTotalQuestions}문제 생성`}
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
      <div className="px-4 py-3 border-t border-slate-100 bg-white shrink-0">
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
