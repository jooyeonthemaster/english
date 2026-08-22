"use client";

import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  FileText,
  GripVertical,
  Layers,
  Minus,
  Plus,
  Settings2,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EXAM_TYPE_GROUPS } from "./generate-page-types";
import { QUESTION_TYPE_GROUPS_KO } from "@/lib/question-type-ui";
import { PromptSection } from "./prompt-section";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
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
import {
  GROUP_COLLAPSE_STORAGE_KEY,
  GROUP_LABELS,
  GROUP_ORDER,
  TYPE_ORDER_STORAGE_KEY,
} from "./generation-config-panel-parts/constants";
import { Collapsible } from "./generation-config-panel-parts/collapsible";
import { KoSetBuilderSection } from "./generation-config-panel-parts/ko-set-builder";
import { KoTypeDetailContent } from "./generation-config-panel-parts/ko-type-detail";
import * as TypeNumericDetail from "./generation-config-panel-parts/type-numeric-detail";
import type { GenerationConfigPanelProps } from "./generation-config-panel-parts/types";

// ─── Component ───────────────────────────────────────

export function GenerationConfigPanel({
  genMode,
  setGenMode,
  editingRow = false,
  hideGenerateButtons = false,
  activePassageId = null,
  passageSubject = null,
  koPassageContent = "",
  koPassageKind = null,
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
  // 포인트 짚어주기(point-picker-design.md §4) — 진입 콜백·유형별 선택 수는 상위
  // (generate-page-client/모달) 소유. 미전달이면 진입 행 자체를 렌더하지 않는다.
  onOpenPointPicker,
  teacherPointCounts,
}: GenerationConfigPanelProps) {
  // ── 국어 지문 게이트 ─────────────────────────────────────────────────
  // passageSubject === "KOREAN" 이면 국어 유형 그룹만, 그 외(영어·null)면 기존
  // 영어 그룹만 노출한다. 미전달 기본값(null)에서는 아래 모든 파생값이 기존과
  // 동일해 영어 패널은 픽셀 하나 바뀌지 않는다. 드래그 정렬 저장 키는 과목별로
  // 분리해 국어 패널이 영어 정렬(localStorage)을 덮어쓰지 않게 한다.
  const koPanel = passageSubject === "KOREAN";
  const panelTypeGroups = koPanel ? QUESTION_TYPE_GROUPS_KO : EXAM_TYPE_GROUPS;
  const typeOrderStorageKey = koPanel
    ? `${TYPE_ORDER_STORAGE_KEY}.ko`
    : TYPE_ORDER_STORAGE_KEY;

  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  // 픽커 진입 콜백 통과 — 진입 직전에 세부설정 팝오버(expandedTypeId)를 닫는다.
  // 픽커가 열리면 콘솔 폭이 440px 로 줄어 열려 있던 팝오버(trigger 폭 추종)가
  // 세로 1글자로 붕괴하기 때문. (칩·배지 등 팝오버 밖 진입은 Radix 외부 클릭
  // 닫힘이 이미 처리하고, 팝오버 안 진입 행은 이 래퍼가 닫는다.)
  const openPointPicker = onOpenPointPicker
    ? (typeId: string) => {
        setExpandedTypeId(null);
        onOpenPointPicker(typeId);
      }
    : undefined;
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
      panelTypeGroups.flatMap((group) =>
        group.items.map((item) => ({ ...item, groupLabel: group.group })),
      ),
    [panelTypeGroups],
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
    const fallback = panelTypeGroups.flatMap((group) =>
      group.items.map((item) => item.id),
    );
    if (typeof window === "undefined") return fallback;
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(typeOrderStorageKey) || "[]",
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
      // 타입가드: filter(Boolean) 은 undefined 를 못 좁혀 하류 전체가 'possibly
      // undefined' 가 된다 — 런타임 동일(Boolean(item) 호출)한 술어로만 교체.
      .filter((item): item is (typeof allTypeItems)[number] => Boolean(item));
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
        // 캐스트 사유: correctAnswerCount 는 타입 미선언 레거시 분석 필드(저장된
        // 구설정 호환 읽기) — CONTENT_MATCH 와 동일 관례. 읽기 전용 좁은 캐스트.
        (grammarErrorSettings as { correctAnswerCount?: number })
          .correctAnswerCount,
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
        // 캐스트 사유: answerCount 는 타입 미선언 레거시 별칭 필드(저장된 구설정
        // 호환 읽기) — errorCount 로 해석. 읽기 전용 좁은 캐스트.
        (grammarCorrectionSettings as { answerCount?: number }).answerCount,
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
        typeOrderStorageKey,
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

  const handleTypeSectionClick = (
    event: ReactMouseEvent<HTMLElement>,
    id: string,
  ) => {
    const target = event.target as HTMLElement | null;
    if (isTypeControlTarget(target)) {
      return;
    }
    incrementTypeCount(id);
  };

  const handleTypeSurfaceClick = (
    event: ReactMouseEvent<HTMLElement>,
    id: string,
  ) => {
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
    if (category.startsWith("국어")) return "bg-indigo-400";
    if (category.startsWith("수능")) return "bg-blue-400";
    if (category.startsWith("내신")) return "bg-emerald-400";
    if (category.startsWith("어휘")) return "bg-amber-400";
    return "bg-slate-300";
  };

  const renderTypeNumericDetailContent = (typeId: string) => {
    // KO_ 게이트 — 국어 유형은 레지스트리 knob 일반 렌더러로 위임 (영어 case 무변경).
    if (typeId.startsWith("KO_")) {
      return (
        <KoTypeDetailContent
          typeId={typeId}
          questionTypeSettings={
            // 캐스트 사유: QuestionTypeGenerationSettings 의 인덱스 시그니처가
            // unknown 이라 KO 상세가 기대하는 Record 형과 불일치 — 런타임 값은
            // 유형별 설정 객체 그대로(무변경)라 좁은 캐스트로 맞춘다.
            questionTypeSettings as Record<
              string,
              Record<string, unknown> | undefined
            >
          }
          patchTypeSettings={patchTypeSettings}
        />
      );
    }

    if (typeId === "CONTENT_MATCH") return TypeNumericDetail.renderContentMatchDetail({ contentMatchAnswerCount, contentMatchAnswerMax, contentMatchOptionCount, contentMatchSettings, setContentMatchAnswerCount, setContentMatchOptionCount, setQuestionTypeSettings });

    if (typeId === "IRRELEVANT") return TypeNumericDetail.renderIrrelevantDetail({ irrelevantSlotCount, setIrrelevantSlotCount });

    if (typeId === "SUMMARY_COMPLETE") return TypeNumericDetail.renderSummaryCompleteDetail({ setSummaryCompleteBlankCount, summaryCompleteBlankCount });

    if (typeId === "SUMMARY_WRITING") return TypeNumericDetail.renderSummaryWritingDetail({ patchTypeSettings, questionTypeSettings });

    // 주제문 영작 — SUMMARY_WRITING과 달리 "선택한 난이도의 프리셋"을 패널에 반영하기 위해
    // 이 유형의 실제 난이도(미설정이면 전역 difficulty)를 함께 넘긴다.
    if (typeId === "TOPIC_SENTENCE_WRITING") return TypeNumericDetail.renderTopicSentenceWritingDetail({ patchTypeSettings, questionTypeSettings, difficulty: (questionTypeSettings.TOPIC_SENTENCE_WRITING?.difficulty as "BASIC" | "INTERMEDIATE" | "KILLER" | undefined) ?? difficulty });

    if (typeId === "GRAMMAR_CHOICE_COMBO") return TypeNumericDetail.renderGrammarChoiceComboDetail({ grammarChoiceComboSettings, patchTypeSettings });

    if (typeId === "GRAMMAR_ERROR") return TypeNumericDetail.renderGrammarErrorDetail({ grammarAnswerCount, grammarAnswerMax, grammarErrorSettings, grammarMarkerCount, patchTypeSettings, setGrammarAnswerCount, setGrammarMarkerCount });

    if (typeId === "GRAMMAR_CORRECTION") return TypeNumericDetail.renderGrammarCorrectionDetail({ grammarCorrectionErrorCount, grammarCorrectionSettings, patchTypeSettings, setGrammarCorrectionErrorCount });

    if (typeId === "SUMMARY_COMPLETE_MC") return TypeNumericDetail.renderSummaryCompleteMcDetail({ setSummaryCompleteMcBlankCount, summaryCompleteMcBlankCount });

    if (typeId === "BLANK_INFERENCE") return TypeNumericDetail.renderBlankInferenceDetail({ blankInferenceBlankCount, blankSettings, setBlankInferenceBlankCount, updateBlankSetting });

    if (typeId === "VOCAB_CHOICE") return TypeNumericDetail.renderVocabChoiceDetail({ patchTypeSettings, questionTypeSettings, setVocabChoiceAnswerCount, setVocabChoiceMarkerCount, vocabChoiceAnswerCount, vocabChoiceAnswerMax, vocabChoiceMarkerCount });

    if (typeId === "SENTENCE_INSERT") return TypeNumericDetail.renderSentenceInsertDetail({ patchTypeSettings, questionTypeSettings, sentenceInsertSlotCount, setSentenceInsertSlotCount });

    if (typeId === "SENTENCE_ORDER") return TypeNumericDetail.renderSentenceOrderDetail({ patchTypeSettings, questionTypeSettings });

    if (typeId === "ANTONYM") return TypeNumericDetail.renderAntonymDetail({ antonymPairCount, setAntonymPairCount });

    if (supportsGenericOptionCount(typeId)) return TypeNumericDetail.renderGenericGistDetail({ getGenericAnswerCount, getGenericOptionCount, patchTypeSettings, questionTypeSettings, setGenericAnswerCount, setGenericOptionCount, typeId });

    return null;
  };

  // 유형별 난이도 — 전역 난이도가 기본값(상속)이고, 이 유형만 다르게 출제하고
  // 싶을 때 override 한다. 값은 questionTypeSettings[typeId].difficulty 에 쓰며,
  // 서버는 readQuestionTypeDifficultySetting(…, 전역 difficulty) 로 이를 우선 적용한다.
  // undefined = 전역 따름(오늘과 동일 동작). 순수 프런트엔드(백엔드 변경 0).
  const renderPerTypeDifficulty = (typeId: string) => TypeNumericDetail.renderPerTypeDifficultyImpl({ typeId, difficulty, patchTypeSettings, questionTypeSettings });

  // Every type gets language toggles; numeric/special settings render above them.
  // KO 유형은 언어토글(영어 stem/option 전용)·플랜 셀렉터 없이 KO 전용 상세만 렌더.
  const renderTypeDetailContent = (typeId: string) =>
    typeId.startsWith("KO_")
      ? renderTypeNumericDetailContent(typeId)
      : TypeNumericDetail.renderTypeDetailContentImpl({ typeId, generationPlan, getTypeOptionLanguage, getTypeStemLanguage, patchTypeSettings, questionTypeSettings, renderTypeNumericDetailContent, setTypeLanguage });

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
                // 국어 패널은 KO 세트 생성이 항상 열려 있다(전용 라우트, 플래그
                // 불필요). 영어 패널은 기존 그대로 장문 세트 플래그 게이트.
                ...(koPanel
                  ? [{ mode: "set", label: "세트 생성", Icon: Layers }]
                  : FEATURE_FLAGS.ENABLE_LONG_PASSAGE_SETS
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
                    // 캐스트 사유: as const 가 스프레드 삼항 분기 내부 리터럴까지
                    // 전파되지 않아 mode 가 string 으로 넓혀짐 — 실제 리터럴 값은
                    // "manual"|"set" 뿐(런타임 무변경).
                    setGenMode(mode as "manual" | "set");
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
                <span>+ 를 눌러 문제 수를 더하세요.</span>
              </div>
            )
          ) : null}
        </div>

        {/* 단일 상품(26-07-21 사용자 결정): 생성 티어 셀렉터 미노출 — 서버가 전
            요청을 일반 레인으로 접는다(resolveEffectiveGenerationPlan). 이원 티어
            복귀 시(env QUESTION_GENERATION_SINGLE_TIER=off) 여기 셀렉터를 복원. */}

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
                            {/* 유형 타일 그리드 — 블록형 선택 UI. 모바일은 1열로 두어
                                타일(=팝오버 트리거) 폭을 넓혀 세부설정 팝오버가 좁아서
                                잘리거나 과도하게 줄바꿈되지 않게 한다.
                                data-type-tile-grid: 픽커 모드(440px 콘솔)에서 모달이
                                컨테이너 조건으로 1컬럼을 강제하는 데 쓰는 훅. */}
                            <div
                              className="grid grid-cols-1 gap-2 lg:grid-cols-2"
                              data-type-tile-grid=""
                            >
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
                                // 캐스트 사유: 인덱스 시그니처(unknown) 키 접근이라
                                // 공통 필드(difficulty)만 읽는 좁은 캐스트를 앞단에
                                // 추가 — 기존 as 난이도 단언 의미 그대로(런타임 무변경).
                                const effDiff =
                                  ((
                                    questionTypeSettings[item.id] as
                                      | { difficulty?: unknown }
                                      | undefined
                                  )?.difficulty as
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
                                    className={`relative flex items-center gap-1 overflow-hidden rounded-lg border px-1 py-1 transition-colors ${
                                      dragOver
                                        ? "border-blue-300 bg-blue-100 ring-1 ring-inset ring-blue-300"
                                        : active
                                          ? "border-blue-300 bg-blue-50/70"
                                          : expanded
                                            ? "border-blue-300 bg-blue-50/40"
                                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                                    } ${dragging ? "opacity-50" : ""} ${expanded ? "rounded-b-none" : ""}`}
                                  >
                                    {/* 한 줄 타일 — 손잡이 + 유형명 + 스테퍼 + 펼치기 토글 */}
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
                                      className="flex h-7 w-3.5 shrink-0 cursor-grab items-center justify-center rounded text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
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
                                        {itemDisabled ? (
                                          <span
                                            className="shrink-0 whitespace-nowrap rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-400"
                                            title={`이 지문은 문장이 적어 문장삽입에 적합하지 않아요 (최소 ${sentenceInsertRequiredSentences}문장 필요).`}
                                          >
                                            문장 부족
                                          </span>
                                        ) : null}
                                      </button>
                                    </PopoverTrigger>
                                    {/* 포인트 짚어주기 진입 — 등재 유형 타일에 상주.
                                        포인트 없으면 과녁 아이콘, 있으면 "포인트 N" 배지. */}
                                    {TypeNumericDetail.renderTypePointBadge({
                                      typeId: item.id,
                                      pointCount:
                                        teacherPointCounts?.[item.id] ?? 0,
                                      onOpenPointPicker: openPointPicker,
                                      questionTypeSettings,
                                    })}
                                    {/* 문항 수 스테퍼 */}
                                    <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
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
                                        onClick={() => {
                                          applyTypeCount(item.id, count + 1);
                                          // 문항 수를 늘리면 세부 설정(난이도 등)을 바로
                                          // 만질 수 있도록 토글을 자동으로 펼친다.
                                          setExpandedTypeId(item.id);
                                        }}
                                        disabled={itemDisabled}
                                        data-generate-tour="type-add-button"
                                        className="flex h-7 w-7 items-center justify-center text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                                        aria-label={`${item.label} 개수 늘리기`}
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    {/* 펼치기 토글 */}
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="flex h-7 w-6 shrink-0 items-center justify-center rounded text-blue-300 transition-colors hover:bg-blue-50 hover:text-blue-500"
                                        title={`${item.label} 세부 옵션 ${expanded ? "접기" : "펼치기"}`}
                                        aria-label={`${item.label} 세부 옵션 ${expanded ? "접기" : "펼치기"}`}
                                      >
                                        <ChevronDown
                                          className={`size-4 shrink-0 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
                                          aria-hidden="true"
                                        />
                                      </button>
                                    </PopoverTrigger>
                                  </div>
                                    </PopoverAnchor>
                                    <PopoverContent
                                      align="start"
                                      sideOffset={0}
                                      collisionPadding={12}
                                      className="max-h-[var(--radix-popover-content-available-height)] lg:max-h-[60vh] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-t-none border border-t-0 border-blue-300 p-0 shadow-lg"
                                    >
                                      <div className="flex h-8 lg:h-9 items-center gap-2 border-b border-slate-200 bg-white px-3">
                                        <Settings2
                                          className="h-3.5 w-3.5 shrink-0 text-blue-500"
                                          aria-hidden="true"
                                        />
                                        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-800">
                                          {item.label} 세부 설정
                                        </span>
                                      </div>
                                      {/* 모바일은 조밀하게(mobile-first) — 팝오버는 위 available-height로
                                          뷰포트에 맞춰 잘리고 내부 overflow-y-auto로 자연스럽게 스크롤된다. */}
                                      <div className="space-y-1.5 lg:space-y-2.5 bg-slate-100 px-2 lg:px-3 pb-2 lg:pb-3 pt-1.5 lg:pt-2.5">
                                        <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 lg:px-2.5 lg:py-2">
                                          {renderPerTypeDifficulty(item.id)}
                                        </div>
                                        <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 lg:px-3 lg:py-2.5">
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

        {/* KO 세트 빌더 — 국어 패널(koPanel) 전용. 영어 장문 세트 빌더와 완전 분기. */}
        {genMode === "set" && koPanel ? (
          <KoSetBuilderSection
            passageContent={koPassageContent ?? ""}
            passageKind={koPassageKind ?? null}
            presetCounts={setPresetCounts ?? {}}
            onPresetCountsChange={onSetPresetCountsChange ?? (() => {})}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
          />
        ) : null}
        {genMode === "set" && !koPanel && TypeNumericDetail.renderSetBuilderSection({ activePassageId, difficulty, editingRow, generationPlan, onSetMemberOverridesByPresetChange, onSetMemberOverridesChange, onSetPresetChange, onSetPresetCountsChange, selectedIds, setDifficulty, setMemberOverrides, setMemberOverridesByPreset, setPresetCounts, setPresetId, workspaceActive, workspaceRowCount })}
      </div>

      {/* Generate Button — 워크스페이스 모드.
          지문별 설정(editingRow)에서는 장문 세트도 이 공용 버튼으로 생성한다.
          hideGenerateButtons(=지문별 모달) 일 때는 모달 푸터가 CTA 를 제공하므로 숨긴다. */}
      {!hideGenerateButtons && (genMode !== "set" || editingRow) && workspaceActive && TypeNumericDetail.renderWorkspaceGenerateButton({ onWorkspaceGenerate, workspaceCreditCost, workspaceGenerating, workspaceSelectedOnlyCount, workspaceTotalQuestions, workspaceVariantCount })}

      {/* Generate Button — 기존 라이브러리 선택 모드 */}
      {/* 26-08-18 난이도 기반 티어: 견적이 유형별 난이도(KILLER=2배)를 보도록 difficulty·questionTypeSettings 도 넘긴다. */}
      {!hideGenerateButtons && genMode !== "set" && !workspaceActive && TypeNumericDetail.renderLibraryGenerateButton({ canGenerate, difficulty, generationPlan, handleBatchGenerate, questionTypeSettings, selectedIds, totalQuestions, typeCounts })}
    </div>
  );
}
