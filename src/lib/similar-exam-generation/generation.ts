import { buildAnalysisContext } from "@/app/api/ai/generate-questions-auto/_lib/build-analysis-context";
import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import type { PlanResult } from "@/app/api/ai/generate-questions-auto/_lib/schemas";
import {
  runQuestionGenerationWithEmptyRetry,
  type QuestionGenerationUsageEvent,
} from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import type { QuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";

import {
  type ExamPatternProfile,
  type GeneratedPatternGroup,
  type GeneratedSlotQuestion,
  type QuestionSlot,
  type SelectedPassageForGeneration,
} from "./schemas";

const DEFAULT_MAX_GENERATED_QUESTIONS = 25;

export interface BatchGenerationSummary {
  totalSlots: number;
  eligibleSlots: number;
  generatedSlots: number;
  skippedSlots: number;
  skippedByReason: Record<string, number>;
  groupCount: number;
  llmCalls: number;
  llmAttempts: number;
  relaxedFallbackGroups: number;
  maxGeneratedQuestions: number;
}

interface GenerationItem {
  slot: QuestionSlot;
  passage: SelectedPassageForGeneration;
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isEligibleSlot(slot: QuestionSlot) {
  return slot.canGenerateFromSelectedPassage !== false;
}

// Assignment unit: slots sharing a stimulusGroup are ONE unit (they must share
// the same passage — a real shared-stimulus set like "[18~19]"). Every other
// slot is its own unit. Passages are distributed across units to (1) spread
// usage evenly (each passage used as few times as possible) and (2) AVOID giving
// the same passage two questions of the same type ("유형 매칭 가드") — so a
// reused passage never produces e.g. two BLANK_INFERENCE items. This keeps
// distinct questions on distinct passages and minimizes redundancy when there
// are fewer selected passages than question slots.
function assignmentUnitKey(slot: QuestionSlot): string {
  return slot.stimulusGroupId ? `group:${slot.stimulusGroupId}` : `solo:${slot.number}`;
}

function assignPassagesToSlots(
  slots: QuestionSlot[],
  passages: SelectedPassageForGeneration[],
): Map<number, SelectedPassageForGeneration> {
  // Build ordered units with their generationSubType set.
  const unitMap = new Map<string, { types: Set<string>; slotNumbers: number[] }>();
  const unitOrder: string[] = [];
  for (const slot of slots) {
    const key = assignmentUnitKey(slot);
    let unit = unitMap.get(key);
    if (!unit) {
      unit = { types: new Set(), slotNumbers: [] };
      unitMap.set(key, unit);
      unitOrder.push(key);
    }
    unit.types.add(slot.generationSubType);
    unit.slotNumbers.push(slot.number);
  }

  const usageCount = passages.map(() => 0);
  const typesByPassage = passages.map(() => new Set<string>());
  const bySlot = new Map<number, SelectedPassageForGeneration>();

  for (const key of unitOrder) {
    const unit = unitMap.get(key)!;
    // Pick the passage that (1) doesn't already hold one of this unit's types,
    // then (2) has been used the fewest times, then (3) earliest index.
    // conflict is weighted high enough to always dominate usage/index.
    let bestIndex = 0;
    let bestScore = Infinity;
    for (let i = 0; i < passages.length; i += 1) {
      const conflict = [...unit.types].some((type) => typesByPassage[i].has(type)) ? 1 : 0;
      const score = conflict * 1_000_000 + usageCount[i] * 100 + i;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    const passage = passages[bestIndex];
    usageCount[bestIndex] += 1;
    for (const type of unit.types) typesByPassage[bestIndex].add(type);
    for (const slotNumber of unit.slotNumbers) bySlot.set(slotNumber, passage);
  }

  return bySlot;
}

/** Map a slot's structured settings onto the engine's QuestionTypeGenerationSettings entry. */
function slotEngineSettings(slot: QuestionSlot): QuestionTypeGenerationSettings | undefined {
  const ts = slot.typeSettings ?? {};
  switch (slot.generationSubType) {
    case "GRAMMAR_ERROR":
      if (ts.grammarMarkerCount == null && ts.grammarAnswerCount == null) return undefined;
      return {
        GRAMMAR_ERROR: {
          ...(ts.grammarMarkerCount != null ? { markerCount: ts.grammarMarkerCount } : {}),
          ...(ts.grammarAnswerCount != null ? { answerCount: ts.grammarAnswerCount } : {}),
        },
      };
    case "GRAMMAR_CORRECTION":
      if (ts.grammarCorrectionErrorCount == null) return undefined;
      return { GRAMMAR_CORRECTION: { errorCount: ts.grammarCorrectionErrorCount } };
    case "IRRELEVANT":
      if (ts.irrelevantSlotCount == null) return undefined;
      return { IRRELEVANT: { slotCount: ts.irrelevantSlotCount } };
    case "BLANK_INFERENCE":
      if (!ts.blankDoubleNegative) return undefined;
      return { BLANK_INFERENCE: { doubleNegative: true } };
    default:
      return undefined;
  }
}

function buildAnalysisContextFor(passage: SelectedPassageForGeneration): string {
  const raw = passage.analysisData;
  const analysisData =
    typeof raw === "string"
      ? raw
      : raw != null
        ? JSON.stringify(raw)
        : null;
  return buildAnalysisContext({ analysis: analysisData ? { analysisData } : null });
}

function buildItems(args: {
  profile: ExamPatternProfile;
  passages: SelectedPassageForGeneration[];
}) {
  const skippedByReason: Record<string, number> = {};
  const eligibleSlots: QuestionSlot[] = [];

  for (const slot of args.profile.questionSlots) {
    if (!isEligibleSlot(slot)) {
      skippedByReason.NOT_GENERATABLE = (skippedByReason.NOT_GENERATABLE ?? 0) + 1;
      continue;
    }
    eligibleSlots.push(slot);
  }

  const passageBySlot = assignPassagesToSlots(eligibleSlots, args.passages);
  const eligible: GenerationItem[] = eligibleSlots.map((slot) => ({
    slot,
    passage: passageBySlot.get(slot.number)!,
  }));

  const maxGeneratedQuestions = readPositiveIntegerEnv(
    "SIMILAR_EXAM_MAX_GENERATED_QUESTIONS",
    DEFAULT_MAX_GENERATED_QUESTIONS,
  );
  const capped = eligible.slice(0, maxGeneratedQuestions);
  const overLimit = eligible.length - capped.length;
  if (overLimit > 0) skippedByReason.OVER_LIMIT = overLimit;

  return {
    items: capped,
    eligibleSlots: eligible.length,
    skippedByReason,
    maxGeneratedQuestions,
  };
}

/** Group items so each engine call shares one passage + one difficulty. */
function groupForGeneration(items: GenerationItem[]) {
  const groups = new Map<string, GenerationItem[]>();
  for (const item of items) {
    const key = `${item.passage.id}__${item.slot.difficulty}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.values()];
}

function buildPlanAndSettings(items: GenerationItem[]) {
  const bySubType = new Map<string, GenerationItem[]>();
  for (const item of items) {
    const list = bySubType.get(item.slot.generationSubType) ?? [];
    list.push(item);
    bySubType.set(item.slot.generationSubType, list);
  }

  const plan: PlanResult["plan"] = [];
  let typeSettings: QuestionTypeGenerationSettings | undefined;

  for (const [subType, group] of bySubType) {
    plan.push({
      subType,
      count: group.length,
      reason: "Recreated from source exam pattern.",
      targetPoints: [],
    });
    // Representative slot settings for this subType (engine settings are per-subType per call).
    const repSettings = slotEngineSettings(group[0].slot);
    if (repSettings) typeSettings = { ...(typeSettings ?? {}), ...repSettings };
  }

  return { plan, typeSettings, bySubType };
}

function toGroups(generated: GeneratedSlotQuestion[]): GeneratedPatternGroup[] {
  const groups = new Map<string, GeneratedPatternGroup>();
  for (const item of generated) {
    const groupKey = item.slot.stimulusGroupId ?? `slot:${item.slot.number}`;
    const existing =
      groups.get(groupKey) ??
      ({
        groupId: item.slot.stimulusGroupId ?? null,
        passage: item.passage,
        questions: [],
      } satisfies GeneratedPatternGroup);
    existing.questions.push(item);
    groups.set(groupKey, existing);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    questions: group.questions.sort((a, b) => a.slot.number - b.slot.number),
  }));
}

export async function generateEligibleQuestionGroups(args: {
  profile: ExamPatternProfile;
  passages: SelectedPassageForGeneration[];
}) {
  const { items, eligibleSlots, skippedByReason, maxGeneratedQuestions } = buildItems(args);
  const groups = groupForGeneration(items);

  const generated: GeneratedSlotQuestion[] = [];
  const usageEvents: QuestionGenerationUsageEvent[] = [];
  let llmAttempts = 0;
  let relaxedFallbackGroups = 0;
  const gradeInfo = args.profile.paperLayout.header.grade || "";

  for (const groupItems of groups) {
    const passage = groupItems[0].passage;
    const diffLabel = groupItems[0].slot.difficulty;
    const { plan, typeSettings, bySubType } = buildPlanAndSettings(groupItems);

    const result = await runQuestionGenerationWithEmptyRetry(
      {
        plan,
        schoolType: "고등학교",
        gradeInfo,
        passageContent: passage.content,
        teacherIntentBlock: "",
        analysisContext: buildAnalysisContextFor(passage),
        diffLabel,
        diffInstruction: DIFF_DESCRIPTION[diffLabel] ?? DIFF_DESCRIPTION.INTERMEDIATE,
        generationPlan: "STANDARD",
        typeSettings,
      },
      { logPrefix: "SIMILAR-EXAM-GEN" },
    );

    llmAttempts += result.attempts;
    usageEvents.push(...result.usageEvents);
    if (result.relaxedFallback) relaxedFallbackGroups += 1;

    // Bind generated questions back to their source slots (by subType, in order).
    const questionsBySubType = new Map<string, Record<string, unknown>[]>();
    for (const question of result.questions) {
      const typeId =
        typeof question._typeId === "string"
          ? question._typeId
          : typeof question.subType === "string"
            ? question.subType
            : "";
      const list = questionsBySubType.get(typeId) ?? [];
      list.push(question);
      questionsBySubType.set(typeId, list);
    }

    for (const [subType, subGroup] of bySubType) {
      const produced = questionsBySubType.get(subType) ?? [];
      const slots = subGroup
        .map((item) => item.slot)
        .sort((a, b) => a.number - b.number);
      const pairCount = Math.min(slots.length, produced.length);
      for (let index = 0; index < pairCount; index += 1) {
        generated.push({ slot: slots[index], passage, question: produced[index] });
      }
    }
  }

  const totalSlots = args.profile.questionSlots.length;
  const summary: BatchGenerationSummary = {
    totalSlots,
    eligibleSlots,
    generatedSlots: generated.length,
    skippedSlots: totalSlots - generated.length,
    skippedByReason,
    groupCount: groups.length,
    llmCalls: usageEvents.length,
    llmAttempts,
    relaxedFallbackGroups,
    maxGeneratedQuestions,
  };

  return {
    groups: toGroups(generated),
    summary,
    usageEvents,
  };
}
