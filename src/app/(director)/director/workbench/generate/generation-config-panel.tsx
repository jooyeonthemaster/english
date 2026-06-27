// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Cpu,
  FileText,
  GripVertical,
  Minus,
  Plus,
  Target,
  Gem,
  Settings2,
  ChevronDown,
} from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EXAM_TYPE_GROUPS } from "./generate-page-types";
import { PromptSection } from "./prompt-section";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { SetBuilderPanel } from "@/components/workbench/set-builder-panel";
import {
  QUESTION_GENERATION_PLANS,
  getQuestionGenerationCreditCost,
} from "@/lib/question-generation-plans";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";
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
  SUMMARY_WRITING_BLANK_COUNT_DEFAULT,
  SUMMARY_WRITING_BLANK_COUNT_MAX,
  SUMMARY_WRITING_BLANK_COUNT_MIN,
  SUMMARY_WRITING_DISTRACTOR_COUNT_DEFAULT,
  SUMMARY_WRITING_DISTRACTOR_COUNT_MAX,
  SUMMARY_WRITING_DISTRACTOR_COUNT_MIN,
  SUMMARY_WRITING_TARGET_WORDS_DEFAULT,
  SUMMARY_WRITING_TARGET_WORDS_MAX,
  SUMMARY_WRITING_TARGET_WORDS_MIN,
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
  readQuestionTypeGenerationPlanSetting,
  readSentenceInsertSlotCountSetting,
  readStemLanguageSetting,
  readVocabChoiceAnswerCountSetting,
  readVocabChoiceMarkerCountSetting,
  supportsGenericOptionCount,
  supportsGistAnswerPolarity,
} from "@/lib/question-type-generation-settings";
import {
  DIFFICULTY_TONES,
  GROUP_COLLAPSE_STORAGE_KEY,
  GROUP_LABELS,
  GROUP_ORDER,
  TYPE_ORDER_STORAGE_KEY,
  VOCAB_GENERATION_TYPE_IDS,
} from "./generation-config-panel-parts/constants";
import { Collapsible } from "./generation-config-panel-parts/collapsible";
import {
  renderNumberSetting,
  renderLanguageSetting,
  renderSegSetting,
  renderToggleSetting,
} from "./generation-config-panel-parts/setting-fields";
import * as TypeNumericDetail from "./generation-config-panel-parts/type-numeric-detail";
import type { GenerationConfigPanelProps } from "./generation-config-panel-parts/types";

// ─── Component ───────────────────────────────────────

export function GenerationConfigPanel({
  genMode,
  setGenMode,
  editingRow = false,
  hideGenerateButtons = false,
  activePassageId = null,
  setPresetId,
  onSetPresetChange,
  setPresetCounts,
  onSetPresetCountsChange,
  setMemberOverrides,
  onSetMemberOverridesChange,
  setMemberOverridesByPreset,
  onSetMemberOverridesByPresetChange,
  generationPlan,
  setGenerationPlan,
  typeCounts,
  setTypeCount,
  setTypeCounts,
  questionTypeSettings,
  setQuestionTypeSettings,
  totalQuestions,
  passageSentenceCount,
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
  workspaceSelectedOnlyCount = 0,
  workspaceRowCount = 0,
  workspaceTotalQuestions = 0,
  workspaceCreditCost = 0,
  workspaceVariantCount = 0,
  workspaceGenerating = false,
  onWorkspaceGenerate,
  tourActive = false,
}: GenerationConfigPanelProps) {
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  // 카테고리 그룹 접힘 상태 — localStorage 영속(UI 취향). 투어 중엔 무시(강제 펼침).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(GROUP_COLLAPSE_STORAGE_KEY) || "[]",
      );
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((p) => typeof p === "string"));
      }
    } catch {
      // 그룹 접힘은 편의 설정 — 저장 실패는 무시.
    }
    return new Set();
  });
  const toggleGroup = (prefix: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      try {
        window.localStorage.setItem(
          GROUP_COLLAPSE_STORAGE_KEY,
          JSON.stringify([...next]),
        );
      } catch {
        // 무시.
      }
      return next;
    });
  };
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
  // 유형 목록을 3개 카테고리로 분할(렌더 시에만). 그룹 순서는 수능→내신→어휘 고정,
  // 그룹 내부 순서는 사용자의 드래그 정렬(orderedTypeItems)을 그대로 따른다.
  const groupedTypeItems = useMemo(
    () =>
      GROUP_ORDER.map((prefix) => ({
        prefix,
        label: GROUP_LABELS[prefix],
        items: orderedTypeItems.filter((item) =>
          (item.groupLabel || "").startsWith(prefix),
        ),
      })).filter((group) => group.items.length > 0),
    [orderedTypeItems],
  );
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
  const summaryCompleteMcSettings =
    questionTypeSettings.SUMMARY_COMPLETE_MC || {};
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
  const grammarChoiceComboSettings =
    questionTypeSettings.GRAMMAR_CHOICE_COMBO || {};
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

  const grammarCorrectionSettings =
    questionTypeSettings.GRAMMAR_CORRECTION || {};
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

  // ── SENTENCE_INSERT 짧은 지문 게이팅 ──────────────────────────────────
  // 문장삽입은 한 문장을 보기로 빼고 나머지 사이에 slotCount 개의 후보 위치를
  // 만들어야 한다 → 최소 (slotCount + 1) 문장이 필요. 지문이 그보다 짧으면
  // 5회 재생성 후 "유효 marker 위치 부족"으로 전멸하므로(프로덕션 1위 실패),
  // 애초에 선택할 수 없게 막는다.
  // sentenceInsertSlotCount 는 위에서 readSentenceInsertSlotCountSetting 으로 이미 계산됨.
  const sentenceInsertRequiredSentences = sentenceInsertSlotCount + 1;
  const sentenceInsertTooShort =
    typeof passageSentenceCount === "number" &&
    passageSentenceCount > 0 &&
    passageSentenceCount < sentenceInsertRequiredSentences;
  const isTypeDisabledForPassage = (id: string) =>
    id === "SENTENCE_INSERT" && sentenceInsertTooShort;

  const applyTypeCount = (id: string, count: number) => {
    // 짧은 지문에서는 문장삽입 추가를 차단(모든 진입점이 이 함수로 수렴).
    if (count > 0 && isTypeDisabledForPassage(id)) return;
    const ordered = normalizeTypeOrder(typeOrder);
    setTypeCounts((prev) => {
      const draft = { ...prev };
      if (count <= 0) delete draft[id];
      else draft[id] = count;
      return orderTypeCounts(ordered, draft);
    });
    if (count > 0) {
      dispatchGenerateTourMilestone("generation-type-selected");
    }
  };

  const incrementTypeCount = (id: string) => {
    const ordered = normalizeTypeOrder(typeOrder);
    setTypeCounts((prev) => {
      const draft = { ...prev };
      draft[id] = Number(prev[id] || 0) + 1;
      return orderTypeCounts(ordered, draft);
    });
    dispatchGenerateTourMilestone("generation-type-selected");
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

  // 카테고리별 닷 색 — 범례와 유형 목록이 같은 색을 쓰도록 group 문자열로 매핑한다.
  const getCategoryDotClass = (category: string) => {
    if (category.startsWith("수능")) return "bg-blue-400";
    if (category.startsWith("내신")) return "bg-emerald-400";
    if (category.startsWith("어휘")) return "bg-amber-400";
    return "bg-slate-300";
  };

  const renderTypeNumericDetailContent = (typeId: string) => {
    if (typeId === "CONTENT_MATCH") return TypeNumericDetail.renderContentMatchDetail({ contentMatchAnswerCount, contentMatchAnswerMax, contentMatchOptionCount, contentMatchSettings, setContentMatchAnswerCount, setContentMatchOptionCount, setQuestionTypeSettings });

    if (typeId === "IRRELEVANT") return TypeNumericDetail.renderIrrelevantDetail({ irrelevantSlotCount, setIrrelevantSlotCount });

    if (typeId === "SUMMARY_COMPLETE") return TypeNumericDetail.renderSummaryCompleteDetail({ setSummaryCompleteBlankCount, summaryCompleteBlankCount });

    if (typeId === "SUMMARY_WRITING") return TypeNumericDetail.renderSummaryWritingDetail({ patchTypeSettings, questionTypeSettings });

    if (typeId === "GRAMMAR_CHOICE_COMBO") return TypeNumericDetail.renderGrammarChoiceComboDetail({ grammarChoiceComboSettings, patchTypeSettings });

    if (typeId === "GRAMMAR_ERROR") return TypeNumericDetail.renderGrammarErrorDetail({ grammarAnswerCount, grammarAnswerMax, grammarErrorSettings, grammarMarkerCount, patchTypeSettings, setGrammarAnswerCount, setGrammarMarkerCount });

    if (typeId === "GRAMMAR_CORRECTION") return TypeNumericDetail.renderGrammarCorrectionDetail({ grammarCorrectionErrorCount, grammarCorrectionSettings, patchTypeSettings, setGrammarCorrectionErrorCount });

    if (typeId === "SUMMARY_COMPLETE_MC") return TypeNumericDetail.renderSummaryCompleteMcDetail({ setSummaryCompleteMcBlankCount, summaryCompleteMcBlankCount });

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
          <div className="border-t border-slate-100 pt-3">
            {renderSegSetting({
              title: "빈칸 단위",
              description:
                "빈칸으로 잡는 표현의 크기입니다. 자동은 모델이 지문 논리에 맞춰 고르고, 단어·구·절은 그 크기로 빈칸과 선지를 강제합니다.",
              value:
                (blankSettings.blankGranularity as string | undefined) || "auto",
              options: [
                { value: "auto", label: "자동" },
                { value: "word", label: "단어" },
                { value: "phrase", label: "구" },
                { value: "clause", label: "절" },
              ],
              onChange: (next) =>
                updateBlankSetting({
                  blankGranularity: next as
                    | "auto"
                    | "word"
                    | "phrase"
                    | "clause",
                }),
            })}
          </div>
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

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-800">
                  출제 포인트 집중
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  {blankSettings.pointFocus ? "핵심 논리 집중" : "폭넓게 출제"}
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  인과·개념명명·재진술·대조
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                켜면 정답을 기출 최빈출 추론 논리(인과·기제, 추상 개념 명명,
                재진술·환언, 대조 전환)에 집중합니다. 끄면 다양한 논리로 폭넓게
                출제합니다.
              </p>
              {blankSettings.pointFocus ? (
                <p className="mt-1 text-[10px] leading-snug text-slate-500">
                  집중 모드는 출제 논리를 좁히므로, 같은 지문에서 많은 문항을
                  생성하면 중복 가능성이 높아집니다.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!blankSettings.pointFocus}
              onClick={() =>
                updateBlankSetting({
                  pointFocus: !blankSettings.pointFocus,
                })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                blankSettings.pointFocus
                  ? "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  blankSettings.pointFocus ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      );
    }

    if (typeId === "VOCAB_CHOICE") {
      const vocabSynonymVariants =
        questionTypeSettings.VOCAB_CHOICE?.synonymVariants === true;
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
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="min-w-0">
              <span className="text-[12px] font-bold text-slate-800">
                동의어 변형 (암기 무력화)
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  지문 암기 방지
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  난이도 ↑
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                밑줄 친 어휘를 모두 동의어로 바꿔 표시합니다. 지문을 외워도 표면
                매칭으로는 못 풀고 뜻으로 판단해야 합니다.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={vocabSynonymVariants}
              onClick={() =>
                patchTypeSettings("VOCAB_CHOICE", {
                  synonymVariants: !vocabSynonymVariants,
                })
              }
              className={`relative h-6 w-11 rounded-full border transition-colors ${
                vocabSynonymVariants
                  ? "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  vocabSynonymVariants ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      );
    }

    if (typeId === "SENTENCE_INSERT") {
      const sentenceInsertParaphrasePrefix =
        questionTypeSettings.SENTENCE_INSERT?.paraphrasePrefix === true;
      const sentenceInsertPointFocus =
        questionTypeSettings.SENTENCE_INSERT?.pointFocus === true;
      return (
        <div className="space-y-3">
          {renderNumberSetting({
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
          })}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="min-w-0">
              <span className="text-[12px] font-bold text-slate-800">
                주어진 문장 앞부분 변형
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  지문 암기 방지
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  난이도 ↑
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                주어진(삽입) 문장의 앞부분을 같은 의미로 바꿔, 표면 표현을 외워
                푸는 것을 막습니다. 정답 위치는 그대로입니다.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={sentenceInsertParaphrasePrefix}
              onClick={() =>
                patchTypeSettings("SENTENCE_INSERT", {
                  paraphrasePrefix: !sentenceInsertParaphrasePrefix,
                })
              }
              className={`relative h-6 w-11 rounded-full border transition-colors ${
                sentenceInsertParaphrasePrefix
                  ? "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  sentenceInsertParaphrasePrefix ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="min-w-0">
              <span className="text-[12px] font-bold text-slate-800">
                출제 포인트 집중
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  {sentenceInsertPointFocus ? "핵심 장치 집중" : "폭넓게 출제"}
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                  참조 해소·대조 전환
                </span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                켜면 정답 자리를 기출 최빈출 응집장치(지시어·정관사로 앞 문장을
                가리키는 참조 해소, 내용을 뒤집는 대조 전환)로 고정하도록 집중합니다.
                끄면 다양한 응집장치로 폭넓게 출제합니다.
              </p>
              {sentenceInsertPointFocus ? (
                <p className="mt-1 text-[10px] leading-snug text-slate-500">
                  집중 모드는 출제 장치를 좁히므로, 같은 지문에서 많은 문항을
                  생성하면 중복 가능성이 높아집니다.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={sentenceInsertPointFocus}
              onClick={() =>
                patchTypeSettings("SENTENCE_INSERT", {
                  pointFocus: !sentenceInsertPointFocus,
                })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                sentenceInsertPointFocus
                  ? "border-blue-300 bg-blue-500"
                  : "border-slate-200 bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                  sentenceInsertPointFocus ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      );
    }

    if (typeId === "SENTENCE_ORDER") {
      const sentenceOrderPrefixVariationCount = Math.min(
        3,
        Math.max(
          0,
          Math.round(
            Number(
              questionTypeSettings.SENTENCE_ORDER?.prefixVariationCount,
            ) || 0,
          ),
        ),
      );
      return renderNumberSetting({
        title: "앞문장 변형 문단 수",
        badges: [
          "0 ~ 3",
          sentenceOrderPrefixVariationCount > 0 ? "암기 무력화" : "끄기",
        ],
        description:
          "(A)(B)(C) 중 앞 문장을 같은 의미로 변형할 문단 수입니다. 0이면 변형하지 않습니다. 주어진 글과 정답 순서는 그대로 유지됩니다.",
        value: sentenceOrderPrefixVariationCount,
        min: 0,
        max: 3,
        onChange: (next) =>
          patchTypeSettings("SENTENCE_ORDER", {
            prefixVariationCount: Math.min(3, Math.max(0, Math.round(next))),
          }),
        ariaBase: "sentence order prefix variation count",
      });
    }

    if (typeId === "ANTONYM") return TypeNumericDetail.renderAntonymDetail({ antonymPairCount, setAntonymPairCount });

    if (supportsGenericOptionCount(typeId)) {
      const genericOptionCount = getGenericOptionCount(typeId);
      const genericAnswerCount = getGenericAnswerCount(typeId);
      const genericAnswerMax = Math.max(1, genericOptionCount - 1);
      const showGistPolarity = supportsGistAnswerPolarity(typeId);
      const gistPolarity =
        (questionTypeSettings[typeId] as { answerPolarity?: string } | undefined)
          ?.answerPolarity === "NEGATIVE"
          ? "NEGATIVE"
          : "POSITIVE";
      const gistPolarityKind =
        typeId === "TITLE" ? "제목" : typeId === "MAIN_IDEA" ? "요지" : "주제";
      const gistPolarityOptions: { value: "POSITIVE" | "NEGATIVE"; label: string }[] = [
        { value: "POSITIVE", label: "적절한 것" },
        { value: "NEGATIVE", label: "적절하지 않은 것" },
      ];
      return (
        <div className="space-y-3">
          {showGistPolarity ? (
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[12px] font-bold text-slate-800">정답 유형</span>
                  <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                    {gistPolarityKind}로 &apos;적절한 것&apos;을 고를지, &apos;적절하지 않은 것&apos;을 고를지 정합니다.
                  </p>
                </div>
                <div className="flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5">
                  {gistPolarityOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => patchTypeSettings(typeId, { answerPolarity: item.value })}
                      className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${
                        gistPolarity === item.value
                          ? "bg-white text-blue-700 shadow-sm"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {renderNumberSetting({
            title: "보기 개수",
            badges: [
              `${GENERIC_OPTION_COUNT_MIN} ~ ${GENERIC_OPTION_COUNT_MAX}`,
              "선택지",
            ],
            description: "학생에게 표시할 보기 수입니다. 기본값은 5개입니다.",
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

  // 유형별 난이도 — 전역 난이도가 기본값(상속)이고, 이 유형만 다르게 출제하고
  // 싶을 때 override 한다. 값은 questionTypeSettings[typeId].difficulty 에 쓰며,
  // 서버는 readQuestionTypeDifficultySetting(…, 전역 difficulty) 로 이를 우선 적용한다.
  // undefined = 전역 따름(오늘과 동일 동작). 순수 프런트엔드(백엔드 변경 0).
  const renderPerTypeDifficulty = (typeId: string) => {
    const raw = questionTypeSettings[typeId]?.difficulty as
      | "BASIC"
      | "INTERMEDIATE"
      | "KILLER"
      | undefined;
    // 미설정이면 기본 난이도(전역 difficulty, 보통 중급)가 선택된 것으로 표시한다.
    const effective = raw ?? difficulty;
    return (
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          난이도 · 이 유형만
        </span>
        <div className="mt-1.5 flex h-8 rounded-lg bg-slate-100 p-0.5">
          {DIFFICULTY_TONES.map((d) => {
            const isActive = effective === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() =>
                  patchTypeSettings(typeId, { difficulty: d.value })
                }
                className={`flex flex-1 items-center justify-center gap-1 rounded-[6px] text-[12px] transition-all duration-150 ${
                  isActive
                    ? `font-bold shadow-sm ${d.on}`
                    : "font-semibold text-slate-500 hover:text-slate-700"
                }`}
                aria-pressed={isActive}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${d.dot}`}
                  aria-hidden="true"
                />
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Every type gets language toggles; numeric/special settings render above them.
  const renderTypeDetailContent = (typeId: string) => {
    const numericContent = renderTypeNumericDetailContent(typeId);
    const languageScope = getQuestionLanguageToggleScope(typeId);
    // 유형별 생성 플랜 개별지정(예: 어법만 PREMIUM). per-type generationPlan 을
    // questionTypeSettings[typeId] 에 써넣으면 서버(fast route·워커)가
    // readQuestionTypeGenerationPlanSetting 으로 전역값 대신 우선 적용한다.
    const typePlan = readQuestionTypeGenerationPlanSetting(
      questionTypeSettings[typeId],
      generationPlan,
    );
    return (
      <div className="space-y-3">
        {FEATURE_FLAGS.SHOW_MODEL_SELECTOR ? (
          <div
            className={
              numericContent ? "border-b border-slate-100 pb-3" : undefined
            }
          >
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              생성 플랜 · 이 유형만
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["STANDARD", "PREMIUM"] as const).map((planId) => {
                const plan = QUESTION_GENERATION_PLANS[planId];
                const active = typePlan === planId;
                const Icon = planId === "PREMIUM" ? Gem : PearlIcon;
                return (
                  <button
                    key={planId}
                    type="button"
                    onClick={() =>
                      patchTypeSettings(typeId, { generationPlan: planId })
                    }
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors ${
                      active
                        ? "border-blue-300 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`}
                    />
                    <span className="truncate text-[12px] font-bold">
                      {plan.shortLabel}
                    </span>
                    <span
                      className={`ml-auto text-[10px] font-bold tabular-nums ${active ? "text-blue-600" : "text-slate-400"}`}
                    >
                      {plan.creditMultiplier}x
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {numericContent}
        <div
          className={
            numericContent ? "border-t border-slate-100 pt-3" : undefined
          }
        >
          {renderLanguageSetting({
            title: "질문 언어",
            value: getTypeStemLanguage(typeId),
            description: "학생에게 보이는 질문(지시문) 언어입니다.",
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
          <div
            className="flex h-9 rounded-lg bg-slate-100 p-0.5"
            data-generate-tour="generation-mode"
          >
            {(
              [
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
                  onClick={() => {
                    setGenMode(mode);
                    if (mode === "manual") {
                      dispatchGenerateTourMilestone(
                        "generation-mode-manual-opened",
                      );
                    }
                  }}
                  data-generate-tour={`generation-mode-${mode}`}
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
          {/* 총 문제 수 / 안내 — 유형 지정/장문 세트 버튼 바로 아래. */}
          {genMode === "manual" ? (
            totalQuestions > 0 ? (
              <div className="mt-2 flex h-9 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-1.5">
                <span className="text-[12px] font-semibold text-slate-700">
                  총{" "}
                  <strong className="font-bold text-slate-900">
                    {totalQuestions}
                  </strong>
                  문제
                  <span className="ml-1 font-medium text-slate-500">
                    · {activeTypeItems.length}개 유형
                  </span>
                </span>
                <button
                  onClick={() => setTypeCounts({})}
                  className="h-6 rounded-md px-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  초기화
                </button>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-blue-200 bg-blue-50/50 px-3 py-2 text-[11px] font-semibold text-blue-700">
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>유형 이름이나 + 를 눌러 문제 수를 더하세요.</span>
              </div>
            )
          ) : null}
        </div>

        {/* 생성 모델(플랜)은 글로벌 셀렉터를 두지 않는다 — 유형별 세부옵션의
            "생성 플랜 · 이 유형만"에서만 정의한다. 미설정 유형은 기본(STANDARD)으로
            생성된다. (전역 generationPlan 은 미설정 유형의 fallback 으로만 남는다.) */}

        {/* Manual Mode Config */}
        {genMode === "manual" && (
          <div className="px-4 py-3 space-y-3">
            {/* 난이도는 유형별로만 설정한다 — 전역 세그먼트는 제거하고, 각 유형의
                '설정'에서 지정(미지정 시 기본 난이도로 출제). */}

            {/* Type selection — 3개 카테고리 그룹 카드 (긴 평면 리스트 해소) */}
            <div className="space-y-3">
              <div>
                <span className="block px-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  문제 유형
                </span>
                <div className="mt-1.5 space-y-2" data-generate-tour="type-list">
                  {groupedTypeItems.map((group) => {
                    const groupOpen =
                      tourActive || !collapsedGroups.has(group.prefix);
                    const selectedCount = group.items.filter(
                      (it) => (typeCounts[it.id] || 0) > 0,
                    ).length;
                    return (
                      <div
                        key={group.prefix}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.prefix)}
                          className="flex h-10 w-full items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-3 text-left transition-colors hover:bg-slate-100/80"
                          aria-expanded={groupOpen}
                          title={`${group.label} ${groupOpen ? "접기" : "펼치기"}`}
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${getCategoryDotClass(group.label)}`}
                            aria-hidden="true"
                          />
                          <span className="text-[12px] font-bold text-slate-700">
                            {group.label}
                          </span>
                          {selectedCount > 0 ? (
                            <span className="ml-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 ring-1 ring-inset ring-slate-200">
                              선택 {selectedCount}
                            </span>
                          ) : null}
                          <span className="text-[10px] font-medium tabular-nums text-slate-300">
                            {group.items.length}
                          </span>
                          <ChevronDown
                            className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ${groupOpen ? "" : "-rotate-90"}`}
                            aria-hidden="true"
                          />
                        </button>
                        <Collapsible open={groupOpen}>
                          <div className="p-2">
                            {/* 유형 타일 그리드 — 블록형 선택 UI */}
                            <div className="grid grid-cols-2 gap-2">
                              {group.items.map((item) => {
                                const count = typeCounts[item.id] || 0;
                                const active = count > 0;
                                const itemDisabled = isTypeDisabledForPassage(
                                  item.id,
                                );
                                const expanded = expandedTypeId === item.id;
                                const dragging = draggingTypeId === item.id;
                                const dragOver =
                                  dragOverTypeId === item.id &&
                                  draggingTypeId !== item.id;
                                // 이 유형의 실제 난이도(미설정이면 기본 난이도).
                                const effDiff =
                                  (questionTypeSettings[item.id]?.difficulty as
                                    | "BASIC"
                                    | "INTERMEDIATE"
                                    | "KILLER"
                                    | undefined) ?? difficulty;
                                const overrideDot =
                                  effDiff === difficulty
                                    ? ""
                                    : effDiff === "BASIC"
                                      ? "bg-blue-500"
                                      : effDiff === "INTERMEDIATE"
                                        ? "bg-amber-500"
                                        : "bg-red-500";

                                return (
                                  <Popover
                                    key={item.id}
                                    open={expanded}
                                    onOpenChange={(o) => {
                                      if (o) {
                                        dispatchGenerateTourMilestone(
                                          "type-detail-opened",
                                        );
                                      }
                                      setExpandedTypeId(o ? item.id : null);
                                    }}
                                  >
                                    <PopoverAnchor asChild>
                                  <div
                                    data-question-type-id={item.id}
                                    onDragOver={(event) => {
                                      event.preventDefault();
                                      if (
                                        !draggingTypeId ||
                                        draggingTypeId === item.id
                                      )
                                        return;
                                      // 같은 카테고리 안에서만 정렬 — 그룹 간 이동 차단.
                                      const src = allTypeItems.find(
                                        (t) => t.id === draggingTypeId,
                                      );
                                      if (
                                        src &&
                                        item.groupLabel &&
                                        src.groupLabel !== item.groupLabel
                                      )
                                        return;
                                      setDragOverTypeId(item.id);
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      const sourceId =
                                        draggingTypeId ||
                                        event.dataTransfer.getData("text/plain");
                                      const src = allTypeItems.find(
                                        (t) => t.id === sourceId,
                                      );
                                      if (
                                        !src ||
                                        !item.groupLabel ||
                                        src.groupLabel === item.groupLabel
                                      ) {
                                        dropTypeBlock(sourceId, item.id);
                                      }
                                      setDraggingTypeId(null);
                                      setDragOverTypeId(null);
                                    }}
                                    className={`relative flex flex-col overflow-hidden rounded-lg border transition-colors ${
                                      dragOver
                                        ? "border-blue-300 bg-blue-100 ring-1 ring-inset ring-blue-300"
                                        : active
                                          ? "border-blue-300 bg-blue-50/70"
                                          : expanded
                                            ? "border-blue-300 bg-blue-50/40"
                                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                                    } ${dragging ? "opacity-50" : ""} ${expanded ? "rounded-b-none" : ""}`}
                                  >
                                    {/* 타일 헤더 — 손잡이 + 유형명 + 펼치기 토글 */}
                                    <div className="flex items-center gap-0.5 pl-1 pr-1.5 pt-1.5">
                                      <button
                                        type="button"
                                        draggable
                                        onDragStart={(event) => {
                                          setDraggingTypeId(item.id);
                                          event.dataTransfer.effectAllowed =
                                            "move";
                                          event.dataTransfer.setData(
                                            "text/plain",
                                            item.id,
                                          );
                                        }}
                                        onDragEnd={() => {
                                          setDraggingTypeId(null);
                                          setDragOverTypeId(null);
                                        }}
                                        className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
                                        title={`${item.label} 순서 드래그`}
                                        aria-label={`${item.label} 순서 드래그`}
                                      >
                                        <GripVertical className="h-3.5 w-3.5" />
                                      </button>
                                      <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        data-generate-tour={
                                          expanded
                                            ? undefined
                                            : "type-detail-toggle"
                                        }
                                        className="flex min-w-0 flex-1 items-center gap-1 text-left"
                                        title={`${item.label} 세부 옵션 ${expanded ? "접기" : "펼치기"}`}
                                      >
                                        <span
                                          className={`min-w-0 truncate text-[12px] ${
                                            active
                                              ? "font-bold text-slate-800"
                                              : "font-semibold text-slate-600"
                                          }`}
                                        >
                                          {item.label}
                                        </span>
                                        {active && overrideDot ? (
                                          <span
                                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${overrideDot}`}
                                            title="이 유형만 개별 난이도"
                                            aria-hidden="true"
                                          />
                                        ) : null}
                                        <ChevronDown
                                          className={`ml-auto size-4 shrink-0 text-blue-300 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
                                          aria-hidden="true"
                                        />
                                      </button>
                                      </PopoverTrigger>
                                    </div>

                                    {itemDisabled ? (
                                      <span
                                        className="ml-1.5 mt-1 inline-flex w-fit shrink-0 whitespace-nowrap rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-400"
                                        title={`이 지문은 문장이 적어 문장삽입에 적합하지 않아요 (최소 ${sentenceInsertRequiredSentences}문장 필요).`}
                                      >
                                        문장 부족
                                      </span>
                                    ) : null}

                                    {/* 문항 수 스테퍼 */}
                                    <div className="mt-1 flex items-center justify-between gap-1 px-1.5 pb-1.5">
                                      <span className="whitespace-nowrap pl-0.5 text-[10px] font-semibold text-slate-400">
                                        문항 수
                                      </span>
                                      <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            applyTypeCount(
                                              item.id,
                                              Math.max(0, count - 1),
                                            )
                                          }
                                          disabled={count <= 0}
                                          className="flex h-7 w-7 items-center justify-center text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                                          aria-label={`${item.label} 개수 줄이기`}
                                        >
                                          <Minus className="h-3.5 w-3.5" />
                                        </button>
                                        <span
                                          className={`flex h-7 w-7 items-center justify-center border-x border-slate-200 text-[12.5px] font-bold tabular-nums ${
                                            count > 0
                                              ? "bg-blue-50/50 text-blue-700"
                                              : "bg-slate-50/60 text-slate-300"
                                          }`}
                                        >
                                          {count}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            applyTypeCount(item.id, count + 1)
                                          }
                                          disabled={itemDisabled}
                                          data-generate-tour="type-add-button"
                                          className="flex h-7 w-7 items-center justify-center text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                                          aria-label={`${item.label} 개수 늘리기`}
                                        >
                                          <Plus className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                    </PopoverAnchor>
                                    <PopoverContent
                                      align="start"
                                      sideOffset={0}
                                      collisionPadding={12}
                                      className="max-h-[60vh] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-t-none border border-t-0 border-blue-300 p-0 shadow-lg"
                                    >
                                      <div className="flex h-9 items-center gap-2 border-b border-slate-200 bg-white px-3">
                                        <Settings2
                                          className="h-3.5 w-3.5 shrink-0 text-blue-500"
                                          aria-hidden="true"
                                        />
                                        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-800">
                                          {item.label} 세부 설정
                                        </span>
                                      </div>
                                      <div className="space-y-2.5 bg-slate-100 px-3 pb-3 pt-2.5">
                                        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                          {renderPerTypeDifficulty(item.id)}
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                          {renderTypeDetailContent(item.id)}
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                );
                              })}
                            </div>
                          </div>
                        </Collapsible>
                      </div>
                    );
                  })}
                </div>
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

        {genMode === "set" && (
          <>
            {!editingRow && workspaceActive ? (
              <p className="mx-4 mt-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-slate-500">
                장문 세트는 ‘내 지문’에서 체크한 지문 1개로 동작합니다 —
                워크스페이스에 불러온 지문({workspaceRowCount}개)은 여기에
                사용되지 않아요.
              </p>
            ) : null}
            <div data-generate-tour="set-builder-panel">
              <SetBuilderPanel
                passageId={
                  editingRow
                    ? activePassageId
                    : selectedIds && selectedIds.size > 0
                      ? Array.from(selectedIds)[0]
                      : null
                }
                generationPlan={generationPlan}
                presetId={editingRow ? (setPresetId ?? null) : undefined}
                onPresetChange={editingRow ? onSetPresetChange : undefined}
                presetCounts={editingRow ? (setPresetCounts ?? {}) : undefined}
                onPresetCountsChange={
                  editingRow ? onSetPresetCountsChange : undefined
                }
                difficulty={editingRow ? difficulty : undefined}
                onDifficultyChange={editingRow ? setDifficulty : undefined}
                memberOverrides={editingRow ? (setMemberOverrides ?? []) : undefined}
                onMemberOverridesChange={
                  editingRow ? onSetMemberOverridesChange : undefined
                }
                memberOverridesByPreset={
                  editingRow ? (setMemberOverridesByPreset ?? {}) : undefined
                }
                onMemberOverridesByPresetChange={
                  editingRow ? onSetMemberOverridesByPresetChange : undefined
                }
                embedded={editingRow}
              />
            </div>
          </>
        )}
      </div>

      {/* Generate Button — 워크스페이스 모드.
          지문별 설정(editingRow)에서는 장문 세트도 이 공용 버튼으로 생성한다.
          hideGenerateButtons(=지문별 모달) 일 때는 모달 푸터가 CTA 를 제공하므로 숨긴다. */}
      {!hideGenerateButtons && (genMode !== "set" || editingRow) && workspaceActive && (
        <div className="px-4 py-3 border-t border-slate-100 bg-white shrink-0">
          {workspaceVariantCount > 0 ? (
            <p className="mb-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-slate-500">
              수정·범위 지정된 {workspaceVariantCount}개 지문은 생성 시 ‘변형본’
              지문으로 저장된 뒤 출제됩니다. 원본 지문은 그대로 보존돼요.
            </p>
          ) : null}
          {workspaceSelectedOnlyCount > 0 ? (
            <p className="mb-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-slate-500">
              워크스페이스 지문과 ‘내 지문’에서 체크한{" "}
              {workspaceSelectedOnlyCount}개 지문을 함께 생성합니다. 이미
              워크스페이스에 있는 지문은 중복 생성하지 않아요.
            </p>
          ) : null}
          <Button
            data-generate-tour="generate-button"
            className={`h-12 w-full min-w-0 rounded-xl px-3 text-[14px] font-bold whitespace-normal transition-all duration-200 ${
              workspaceTotalQuestions > 0 && !workspaceGenerating
                ? "bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200/50 hover:shadow-lg hover:shadow-blue-200/60"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
            onClick={() => {
              dispatchGenerateTourMilestone("question-generation-started");
              onWorkspaceGenerate?.();
            }}
            disabled={workspaceTotalQuestions === 0 || workspaceGenerating}
          >
            {workspaceGenerating ? (
              <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
                <Cpu className="w-4.5 h-4.5 animate-pulse" />
                <span className="min-w-0 truncate">생성 중…</span>
              </span>
            ) : workspaceTotalQuestions > 0 ? (
              <span className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden">
                <Cpu className="w-4.5 h-4.5" />
                <span className="min-w-0 truncate">
                  {`${workspaceTotalQuestions}문제 생성`}
                </span>
              </span>
            ) : (
              <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
                <Target className="w-4.5 h-4.5" />
                <span className="min-w-0 truncate">유형을 선택하세요</span>
              </span>
            )}
            {workspaceTotalQuestions > 0 &&
              workspaceCreditCost > 0 &&
              !workspaceGenerating && (
                <CreditCostChip
                  amount={workspaceCreditCost}
                  className="ml-1 shrink-0 gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] text-white"
                />
              )}
          </Button>
        </div>
      )}

      {/* Generate Button — 기존 라이브러리 선택 모드 */}
      {!hideGenerateButtons && genMode !== "set" && !workspaceActive && (
        <div className="px-4 py-3 border-t border-slate-100 bg-white shrink-0">
          {(() => {
            // 크레딧 비용 계산 — 유형 지정(MANUAL) 전용.
            const baseCreditCost =
              selectedIds.size *
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
                  data-generate-tour="generate-button"
                  className={`h-12 w-full min-w-0 rounded-xl px-3 text-[14px] font-bold whitespace-normal transition-all duration-200 ${
                    canGenerate
                      ? "bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200/50 hover:shadow-lg hover:shadow-blue-200/60"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                  onClick={() => {
                    dispatchGenerateTourMilestone(
                      "question-generation-started",
                    );
                    handleBatchGenerate();
                  }}
                  disabled={!canGenerate}
                >
                  {selectedIds.size === 0 ? (
                    <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
                      <FileText className="w-4.5 h-4.5" />
                      <span className="min-w-0 truncate">
                        지문을 선택하세요
                      </span>
                    </span>
                  ) : totalQuestions > 0 ? (
                    <span className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden">
                      <Cpu className="w-4.5 h-4.5" />
                      <span className="min-w-0 truncate">
                        {selectedIds.size === 1
                          ? `${totalQuestions}문제 생성`
                          : `${selectedIds.size}개 지문 × ${totalQuestions}문제 생성`}
                      </span>
                    </span>
                  ) : (
                    <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
                      <Target className="w-4.5 h-4.5" />
                      <span className="min-w-0 truncate">
                        유형을 선택하세요
                      </span>
                    </span>
                  )}
                  {canGenerate && creditCost > 0 && (
                    <CreditCostChip
                      amount={creditCost}
                      className="ml-1 shrink-0 gap-1 rounded-lg bg-white/20 px-2 py-1 text-[11px] text-white"
                    />
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
