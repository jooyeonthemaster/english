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

function passageForSlot(args: {
  profile: ExamPatternProfile;
  slot: QuestionSlot;
  passages: SelectedPassageForGeneration[];
}) {
  const groupIndex = args.slot.stimulusGroupId
    ? args.profile.stimulusGroups.findIndex((group) => group.id === args.slot.stimulusGroupId)
    : -1;
  if (groupIndex >= 0) return args.passages[groupIndex % args.passages.length];
  return args.passages[(args.slot.number - 1) % args.passages.length];
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
  const eligible: GenerationItem[] = [];

  for (const slot of args.profile.questionSlots) {
    if (!isEligibleSlot(slot)) {
      skippedByReason.NOT_GENERATABLE = (skippedByReason.NOT_GENERATABLE ?? 0) + 1;
      continue;
    }
    eligible.push({
      slot,
      passage: passageForSlot({ profile: args.profile, slot, passages: args.passages }),
    });
  }

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
