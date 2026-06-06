import { z } from "zod";

export const similarExamStageSchema = z.enum([
  "UPLOADING",
  "OCR",
  "ANALYZING_PATTERN",
  "ASSIGNING_PASSAGES",
  "GENERATING_QUESTIONS",
  "SAVING",
  "COMPLETED",
  "FAILED",
]);

export const difficultySchema = z.enum(["BASIC", "INTERMEDIATE", "KILLER"]);

export const stimulusTypeSchema = z.enum([
  "PASSAGE",
  "LISTENING",
  "TABLE",
  "CHART",
  "IMAGE",
  "NOTICE",
  "DIALOGUE",
  "FORM",
  "NONE",
  "MIXED",
]);

// Canonical question-generation type IDs accepted by the shared generation
// engine (`runQuestionGenerationWithEmptyRetry`). Source of truth:
// `src/app/api/ai/generate-questions-auto/_lib/constants.ts` TYPE_LABELS +
// `src/lib/question-postprocess/index.ts` processor registry + PASSTHROUGH_TYPES.
// Keep this list aligned with those so analysis output maps 1:1 onto the engine.
export const GENERATION_SUB_TYPES = [
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "GRAMMAR_CORRECTION",
  "VOCAB_CHOICE",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "WORD_ORDER",
  "FILL_BLANK_KEY",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
] as const;

export const generationSubTypeSchema = z.enum(GENERATION_SUB_TYPES);
export type GenerationSubType = z.infer<typeof generationSubTypeSchema>;

// Per-slot structured generation settings. These map directly onto the engine's
// `QuestionTypeGenerationSettings` (see `src/lib/question-type-generation-settings.ts`)
// during plan aggregation — no free-text re-parsing required.
export const slotTypeSettingsSchema = z
  .object({
    // GRAMMAR_ERROR: number of marked judgment positions (5~10) and answers (1~markerCount).
    grammarMarkerCount: z.number().int().min(5).max(10).nullable().optional(),
    grammarAnswerCount: z.number().int().min(1).max(10).nullable().optional(),
    // GRAMMAR_CORRECTION: number of wrong underlined segments (1~5).
    grammarCorrectionErrorCount: z.number().int().min(1).max(5).nullable().optional(),
    // IRRELEVANT: number of displayed slots (>=5).
    irrelevantSlotCount: z.number().int().min(5).max(10).nullable().optional(),
    // BLANK_INFERENCE: negative-paraphrase blank mode.
    blankDoubleNegative: z.boolean().nullable().optional(),
  })
  .default({});

export type SlotTypeSettings = z.infer<typeof slotTypeSettingsSchema>;

const headerSchema = z
  .object({
    examTitle: z.string().max(200).default(""),
    schoolName: z.string().max(120).default(""),
    subject: z.string().max(80).default("영어"),
    grade: z.string().max(40).default(""),
    examCategory: z.string().max(60).default(""), // 중간고사/기말고사/모의고사/기타
    examDate: z.string().max(60).default(""),
    durationMinutes: z.number().int().min(1).max(300).nullable().optional(),
    totalPoints: z.number().int().min(1).max(500).nullable().optional(),
    hasStudentNameField: z.boolean().default(true),
    hasStudentIdField: z.boolean().default(true),
    notices: z.array(z.string().min(1).max(600)).max(20).default([]),
  })
  .default({
    examTitle: "",
    schoolName: "",
    subject: "영어",
    grade: "",
    examCategory: "",
    examDate: "",
    hasStudentNameField: true,
    hasStudentIdField: true,
    notices: [],
  });

export const examPatternProfileSchema = z.object({
  sourceExam: z.object({
    title: z.string().min(1).max(200),
    subject: z.string().default("ENGLISH"),
    totalQuestionCount: z.number().int().min(1).max(100),
    durationMinutes: z.number().int().min(1).max(300).nullable().optional(),
    totalPoints: z.number().int().min(1).max(500).nullable().optional(),
    summary: z.string().max(2500).optional(),
  }),
  // Provenance / source observation (출처·신뢰도). Drives QA triage, never reproduced verbatim.
  sourceMeta: z
    .object({
      schoolName: z.string().max(120).default(""),
      year: z.number().int().min(1990).max(2100).nullable().optional(),
      semester: z.string().max(40).default(""),
      publisher: z.string().max(120).default(""),
      source: z.string().max(200).default(""),
      examCategory: z.string().max(60).default(""),
      confidence: z.enum(["high", "medium", "low"]).default("medium"),
      uncertaintyNotes: z.array(z.string().min(1).max(600)).max(40).default([]),
    })
    .default({
      schoolName: "",
      semester: "",
      publisher: "",
      source: "",
      examCategory: "",
      confidence: "medium",
      uncertaintyNotes: [],
    }),
  // Visual / assembly spec consumed by the exam-paper builder.
  paperLayout: z.object({
    paperSize: z.enum(["A4", "B4", "LETTER"]).default("A4"),
    pageCount: z.number().int().min(1).max(300).default(1),
    columns: z.number().int().min(1).max(3).default(2),
    density: z.enum(["compact", "comfortable"]).default("compact"),
    numberingStyle: z.string().max(300).default("printed question number"),
    pointAnnotationStyle: z.string().max(300).default("[N점] after question number"),
    choiceMarkerStyle: z.string().max(120).default("①②③④⑤"),
    passageBoxed: z.boolean().default(true),
    sectionOrder: z.array(z.string().min(1).max(80)).max(20).default([]),
    globalDirections: z.array(z.string().min(1).max(800)).max(20).default([]),
    visualLayoutNotes: z.string().max(2000).default(""),
    header: headerSchema,
  }),
  sections: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        label: z.string().min(1).max(120),
        questionNumbers: z.array(z.number().int().min(1).max(150)).min(1),
        instructionStyle: z.string().max(1000).default(""),
        layoutHints: z.string().max(1000).default(""),
      }),
    )
    .default([]),
  stimulusGroups: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        type: stimulusTypeSchema,
        questionNumbers: z.array(z.number().int().min(1).max(150)).min(1),
        sourceSummary: z.string().max(1500).default(""),
        wordCount: z.number().int().min(0).max(3000).nullable().optional(),
        paragraphCount: z.number().int().min(0).max(20).nullable().optional(),
        topicStyle: z.string().max(1000).default(""),
        discourseStructure: z.string().max(1500).default(""),
        visualDataShape: z.string().max(1500).default(""),
        listeningSituation: z.string().max(1500).default(""),
        reuseWithSelectedPassageStrategy: z.string().max(1500).default(""),
      }),
    )
    .default([]),
  questionSlots: z
    .array(
      z.object({
        number: z.number().int().min(1).max(150),
        sectionId: z.string().max(40).nullable().optional(),
        stimulusGroupId: z.string().max(40).nullable().optional(),
        stimulusType: stimulusTypeSchema.default("PASSAGE"),
        // Free-text description of the original item's type (for traceability).
        subType: z.string().min(1).max(80),
        // Canonical engine ID — drives generation. Must be one of GENERATION_SUB_TYPES.
        generationSubType: generationSubTypeSchema.default("TOPIC"),
        difficulty: difficultySchema.default("INTERMEDIATE"),
        points: z.number().int().min(1).max(100).default(1),
        choiceCount: z.number().int().min(0).max(10).default(5),
        // Structured per-type settings → engine typeSettings.
        typeSettings: slotTypeSettingsSchema,
        stemStyle: z.string().max(1200).default(""),
        optionStyle: z.string().max(1200).default(""),
        answerFormat: z.string().max(800).default(""),
        reasoningPattern: z.string().max(1500).default(""),
        generationRequirements: z.string().max(2000).default(""),
        layoutHints: z.string().max(1200).default(""),
        canGenerateFromSelectedPassage: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(100),
  // Statistical fingerprint of the original exam — the basis of "동형성".
  // Derived from questionSlots during normalization for consistency.
  distribution: z
    .object({
      byType: z
        .array(
          z.object({
            type: z.string().min(1).max(80),
            count: z.number().int().min(0).max(150),
          }),
        )
        .max(60)
        .default([]),
      byDifficulty: z
        .object({
          BASIC: z.number().int().min(0).max(150).default(0),
          INTERMEDIATE: z.number().int().min(0).max(150).default(0),
          KILLER: z.number().int().min(0).max(150).default(0),
        })
        .default({ BASIC: 0, INTERMEDIATE: 0, KILLER: 0 }),
      byStimulusType: z
        .array(
          z.object({
            type: stimulusTypeSchema,
            count: z.number().int().min(0).max(150),
          }),
        )
        .max(20)
        .default([]),
      byPoints: z
        .array(
          z.object({
            points: z.number().int().min(1).max(100),
            count: z.number().int().min(0).max(150),
          }),
        )
        .max(20)
        .default([]),
      skillCoverage: z.array(z.string().min(1).max(80)).max(30).default([]),
    })
    .default({
      byType: [],
      byDifficulty: { BASIC: 0, INTERMEDIATE: 0, KILLER: 0 },
      byStimulusType: [],
      byPoints: [],
      skillCoverage: [],
    }),
  generationPlan: z
    .object({
      preserveQuestionOrder: z.boolean().default(true),
      preserveSectionOrder: z.boolean().default(true),
      preserveStimulusGrouping: z.boolean().default(true),
      passageAssignmentStrategy: z
        .string()
        .max(1500)
        .default("cycle selected passages across stimulus groups"),
      fallbackRules: z.array(z.string().min(1).max(600)).max(20).default([]),
    })
    .default({
      preserveQuestionOrder: true,
      preserveSectionOrder: true,
      preserveStimulusGrouping: true,
      passageAssignmentStrategy: "cycle selected passages across stimulus groups",
      fallbackRules: [],
    }),
  extractedInsights: z.array(z.string().min(1).max(800)).max(40).default([]),
});

export type ExamPatternProfile = z.infer<typeof examPatternProfileSchema>;
export type QuestionSlot = ExamPatternProfile["questionSlots"][number];
export type StimulusGroup = ExamPatternProfile["stimulusGroups"][number];

export interface SelectedPassageForGeneration {
  id: string;
  title: string;
  content: string;
  analysisData?: unknown;
}

/** One generated question (post-processed engine output) bound to its source slot. */
export interface GeneratedSlotQuestion {
  slot: QuestionSlot;
  passage: SelectedPassageForGeneration;
  /** Post-processed question record from the shared generation engine. */
  question: Record<string, unknown>;
}

export interface GeneratedPatternGroup {
  groupId: string | null;
  passage: SelectedPassageForGeneration;
  questions: GeneratedSlotQuestion[];
}

type ExamDistribution = ExamPatternProfile["distribution"];

function deriveDistribution(
  slots: QuestionSlot[],
): Omit<ExamDistribution, "skillCoverage"> {
  const byTypeMap = new Map<string, number>();
  const byStimulusMap = new Map<string, number>();
  const byPointsMap = new Map<number, number>();
  const byDifficulty = { BASIC: 0, INTERMEDIATE: 0, KILLER: 0 };

  for (const slot of slots) {
    byTypeMap.set(slot.generationSubType, (byTypeMap.get(slot.generationSubType) ?? 0) + 1);
    byStimulusMap.set(slot.stimulusType, (byStimulusMap.get(slot.stimulusType) ?? 0) + 1);
    byPointsMap.set(slot.points, (byPointsMap.get(slot.points) ?? 0) + 1);
    byDifficulty[slot.difficulty] += 1;
  }

  return {
    byType: [...byTypeMap.entries()].map(([type, count]) => ({ type, count })),
    byDifficulty,
    byStimulusType: [...byStimulusMap.entries()].map(([type, count]) => ({
      type: type as z.infer<typeof stimulusTypeSchema>,
      count,
    })),
    byPoints: [...byPointsMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([points, count]) => ({ points, count })),
  };
}

export function normalizePatternProfile(profile: ExamPatternProfile): ExamPatternProfile {
  const questionNumbers = new Set(profile.questionSlots.map((slot) => slot.number));
  const groupIds = new Set(profile.stimulusGroups.map((group) => group.id));
  const sectionIds = new Set(profile.sections.map((section) => section.id));

  const questionSlots = profile.questionSlots
    .map((slot) => ({
      ...slot,
      sectionId: slot.sectionId && sectionIds.has(slot.sectionId) ? slot.sectionId : null,
      stimulusGroupId:
        slot.stimulusGroupId && groupIds.has(slot.stimulusGroupId)
          ? slot.stimulusGroupId
          : null,
    }))
    .sort((a, b) => a.number - b.number);

  const derived = deriveDistribution(questionSlots);

  return {
    ...profile,
    sourceExam: {
      ...profile.sourceExam,
      totalQuestionCount: questionSlots.length,
    },
    sections: profile.sections.map((section) => ({
      ...section,
      questionNumbers: section.questionNumbers
        .filter((number) => questionNumbers.has(number))
        .sort((a, b) => a - b),
    })),
    stimulusGroups: profile.stimulusGroups.map((group) => ({
      ...group,
      questionNumbers: group.questionNumbers
        .filter((number) => questionNumbers.has(number))
        .sort((a, b) => a - b),
    })),
    questionSlots,
    distribution: {
      ...derived,
      // skillCoverage stays AI-provided; counts are derived from slots.
      skillCoverage: profile.distribution.skillCoverage,
    },
  };
}
