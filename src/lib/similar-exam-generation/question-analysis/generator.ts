import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import type { PlanResult } from "@/app/api/ai/generate-questions-auto/_lib/schemas";
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import { compileCustomType } from "@/lib/custom-question-types/compiler";
import { generateFromCustomType } from "@/lib/custom-question-types/generator";
import {
  getQuestionLanguageToggleScope,
  type QuestionGenerationLanguage,
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";

import type { GenerationSubType } from "../schemas";
import { resolveSimilarGenerationRoute } from "./matching";
import type { QuestionAnalysis } from "./schema";

export interface GenerateSimilarQuestionArgs {
  analysis: QuestionAnalysis;
  passage: string;
  gradeInfo?: string;
}

export interface GenerateSimilarQuestionResult {
  question: Record<string, unknown>;
  subType: string;
  relaxedFallback: boolean;
  llmCalls: number;
  llmAttempts: number;
}

function sourceOptionCount(analysis: QuestionAnalysis): number {
  return analysis.source.optionCount || analysis.source.options.length;
}

function explicitCorrectAnswerCount(analysis: QuestionAnalysis): number | null {
  const labelCount = analysis.source.correctAnswerLabels.filter((label) => label.trim()).length;
  if (labelCount > 0) return labelCount;

  const flaggedCount = analysis.source.options.filter((option) => option.isCorrect).length;
  return flaggedCount > 0 ? flaggedCount : null;
}

function summaryBlankCount(analysis: QuestionAnalysis): number | null {
  const direct = analysis.classification.typeSettings.summaryBlankCount;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;

  const text = [
    analysis.source.direction,
    analysis.source.passage ?? "",
    analysis.reproductionSpec.stemFormat,
    analysis.reproductionSpec.optionFormat,
    analysis.reproductionSpec.answerFormat,
    analysis.reproductionSpec.structureNotes,
  ].join("\n");
  const markers = new Set<string>();
  for (const match of text.matchAll(/\(([A-Da-d])\)/g)) {
    markers.add(match[1].toUpperCase());
  }
  return markers.size > 0 ? markers.size : null;
}

function blankInferenceBlankCount(analysis: QuestionAnalysis): number | null {
  const direct = analysis.classification.typeSettings.blankCount;
  if (typeof direct === "number" && direct >= 1 && direct <= 3) return direct;

  // Textual fallback: labeled blanks "(A) ____" in the extracted passage, or a
  // "(A), (B)" blank stem. Mirrors the summaryBlankCount detection style.
  const passageText = analysis.source.passage ?? "";
  const labeledBlankMarkers = new Set<string>();
  for (const match of passageText.matchAll(/\(([A-Ca-c])\)\s*_{2,}/g)) {
    labeledBlankMarkers.add(match[1].toUpperCase());
  }
  if (labeledBlankMarkers.size >= 2) return Math.min(3, labeledBlankMarkers.size);

  const stemText = [
    analysis.source.direction,
    analysis.reproductionSpec.stemFormat,
  ].join("\n");
  if (/빈칸|blank/i.test(stemText)) {
    const stemLabels = new Set<string>();
    for (const match of stemText.matchAll(/\(([A-Ca-c])\)/g)) {
      stemLabels.add(match[1].toUpperCase());
    }
    if (stemLabels.size >= 2) return Math.min(3, stemLabels.size);
  }
  return null;
}

function inferVisibleOptionLanguage(
  analysis: QuestionAnalysis,
): QuestionGenerationLanguage | undefined {
  const optionText = analysis.source.options
    .map((option) => option.text)
    .filter(Boolean)
    .join("\n");
  const formatText = [
    analysis.reproductionSpec.optionFormat,
    analysis.reproductionSpec.structureNotes,
  ].join("\n");
  const combined = [optionText, formatText].join("\n");

  if (/\bEnglish\b|English-only|영어/i.test(combined)) return "en";
  if (/\bKorean\b|Korean-only|한국어|한글/i.test(combined)) return "ko";

  const latinCount = (optionText.match(/[A-Za-z]/g) ?? []).length;
  const hangulCount = (optionText.match(/[가-힣]/g) ?? []).length;
  if (latinCount >= 12 && latinCount > hangulCount * 2) return "en";
  if (hangulCount >= 6 && hangulCount >= latinCount) return "ko";
  return undefined;
}

function toEngineTypeSettings(
  subType: GenerationSubType,
  analysis: QuestionAnalysis,
): QuestionTypeGenerationSettings | undefined {
  const base = toEngineNumericTypeSettings(subType, analysis);
  // Reproduce the source's visible option language for free-language option types
  // (TOPIC/MAIN_IDEA/TITLE/IMPLIED_MEANING/CONTENT_MATCH/...). Structural types
  // ignore option language, so skip them entirely.
  if (getQuestionLanguageToggleScope(subType) !== "stem-option") return base;
  const optionLanguage = inferVisibleOptionLanguage(analysis);
  if (!optionLanguage) return base;
  const current = (base?.[subType] ?? {}) as Record<string, unknown>;
  return { ...(base ?? {}), [subType]: { ...current, optionLanguage } };
}

function toEngineNumericTypeSettings(
  subType: GenerationSubType,
  analysis: QuestionAnalysis,
): QuestionTypeGenerationSettings | undefined {
  const ts = analysis.classification.typeSettings;
  switch (subType) {
    case "GRAMMAR_ERROR": {
      const markerCount = ts.grammarMarkerCount ?? sourceOptionCount(analysis);
      const answerCount = ts.grammarAnswerCount ?? explicitCorrectAnswerCount(analysis);
      if (markerCount == null && answerCount == null) return undefined;
      return {
        GRAMMAR_ERROR: {
          ...(markerCount != null ? { markerCount } : {}),
          ...(answerCount != null ? { answerCount } : {}),
        },
      };
    }
    case "GRAMMAR_CORRECTION": {
      const errorCount = ts.grammarCorrectionErrorCount ?? explicitCorrectAnswerCount(analysis);
      if (errorCount == null) return undefined;
      return { GRAMMAR_CORRECTION: { errorCount } };
    }
    case "IRRELEVANT": {
      const slotCount = ts.irrelevantSlotCount ?? sourceOptionCount(analysis);
      if (slotCount == null) return undefined;
      return { IRRELEVANT: { slotCount } };
    }
    case "CONTENT_MATCH": {
      const optionCount = ts.optionCount ?? sourceOptionCount(analysis);
      const answerCount =
        ts.answerCount ?? ts.correctAnswerCount ?? explicitCorrectAnswerCount(analysis);
      if (optionCount == null && answerCount == null) return undefined;
      return {
        CONTENT_MATCH: {
          ...(optionCount != null ? { optionCount } : {}),
          ...(answerCount != null ? { answerCount } : {}),
        },
      };
    }
    case "VOCAB_CHOICE": {
      // Source underlined-word count = visible option count for this type.
      const markerCount = sourceOptionCount(analysis);
      const answerCount =
        ts.answerCount ?? ts.correctAnswerCount ?? explicitCorrectAnswerCount(analysis);
      const markerValid = markerCount >= 5 && markerCount <= 10;
      if (!markerValid && answerCount == null) return undefined;
      return {
        VOCAB_CHOICE: {
          ...(markerValid ? { markerCount } : {}),
          ...(answerCount != null ? { answerCount } : {}),
        },
      };
    }
    case "SENTENCE_INSERT": {
      // Only deviate from the default 5 when the source clearly shows more markers.
      const slotCount = sourceOptionCount(analysis);
      if (slotCount < 6 || slotCount > 8) return undefined;
      return { SENTENCE_INSERT: { slotCount } };
    }
    case "ANTONYM": {
      const pairCount = sourceOptionCount(analysis);
      if (pairCount < 6 || pairCount > 10) return undefined;
      return { ANTONYM: { pairCount } };
    }
    case "TOPIC":
    case "MAIN_IDEA":
    case "TITLE":
    case "IMPLIED_MEANING":
    case "CONTEXT_MEANING":
    case "SYNONYM": {
      // Free-text option types: reproduce the source option/answer counts.
      const optionCount = ts.optionCount ?? sourceOptionCount(analysis);
      const answerCount =
        ts.answerCount ?? ts.correctAnswerCount ?? explicitCorrectAnswerCount(analysis);
      const optionValid = optionCount >= 4 && optionCount <= 8;
      const answerValid = typeof answerCount === "number" && answerCount >= 2;
      if (!optionValid && !answerValid) return undefined;
      return {
        [subType]: {
          ...(optionValid ? { optionCount } : {}),
          ...(answerValid ? { answerCount } : {}),
        },
      };
    }
    case "SUMMARY_COMPLETE": {
      const blankCount = summaryBlankCount(analysis);
      if (blankCount == null) return undefined;
      return { SUMMARY_COMPLETE: { blankCount } };
    }
    case "SUMMARY_COMPLETE_MC": {
      const blankCount = summaryBlankCount(analysis);
      if (blankCount == null) return undefined;
      return { SUMMARY_COMPLETE_MC: { blankCount } };
    }
    case "BLANK_INFERENCE": {
      // Multi-blank combination source → reproduce the blank count. The
      // double-negative mode is single-blank-only, so it is dropped here.
      const blankCount = blankInferenceBlankCount(analysis);
      if (blankCount != null && blankCount >= 2) {
        return { BLANK_INFERENCE: { blankCount } };
      }
      if (!ts.blankDoubleNegative) return undefined;
      return { BLANK_INFERENCE: { doubleNegative: true } };
    }
    default:
      return undefined;
  }
}

function buildIsomorphicGuidance(analysis: QuestionAnalysis): string {
  const { testingPoint, transformation, reproductionSpec, variationAxes } = analysis;
  const lines: string[] = [
    "## Similar-question generation guidance",
    "Generate one isomorphic question from the supplied passage. Preserve the source testing point, structural format, answer shape, and scoring logic; change only the passage-specific content.",
  ];

  if (testingPoint.summary) lines.push(`- Testing point: ${testingPoint.summary}`);
  if (testingPoint.skills.length) lines.push(`- Skills: ${testingPoint.skills.join(", ")}`);

  if (transformation.applied) {
    if (transformation.description) lines.push(`- Transformation: ${transformation.description}`);
    if (transformation.rules.length) lines.push(`- Rules: ${transformation.rules.join(" / ")}`);
    if (transformation.changedSpans.length) {
      const spans = transformation.changedSpans
        .slice(0, 8)
        .map((span) => `"${span.from}" -> "${span.to}" (${span.rule})`)
        .join(", ");
      lines.push(`- Source transformation examples to imitate with new content: ${spans}`);
    }
  }

  if (reproductionSpec.stemFormat) lines.push(`- Stem format: ${reproductionSpec.stemFormat}`);
  if (reproductionSpec.optionFormat) lines.push(`- Option format: ${reproductionSpec.optionFormat}`);
  if (reproductionSpec.answerFormat) lines.push(`- Answer format: ${reproductionSpec.answerFormat}`);
  if (reproductionSpec.structureNotes) lines.push(`- Structure: ${reproductionSpec.structureNotes}`);
  if (variationAxes.length) {
    lines.push(`- Allowed variation axes, without copying the source: ${variationAxes.join(" / ")}`);
  }
  lines.push("- Do not reuse source passage sentences or source question wording verbatim.");

  if (analysis.classification.matchedType === "WORD_ORDER") {
    lines.push(
      "",
      "## Hard format rules for WORD_ORDER",
      "- Ask for the complete order of every provided chunk, not selected positions.",
      "- Use numeric labels only: 1, 2, 3, ... Do not use letters, Korean consonants, or circled numerals.",
      "- correctAnswer must be the full hyphen-joined numeric sequence, for example: 3-1-2-5-4.",
      "- Every chunk must be used exactly once; the number of labels in correctAnswer must equal the number of chunks.",
      "- Do not generate an nth-position question such as asking only for the 5th or 8th element.",
      "- The completed sentence must be grammatical and natural English.",
    );
  }

  return lines.join("\n");
}

async function generateCustomSimilarQuestion(args: {
  analysis: QuestionAnalysis;
  passage: string;
  gradeInfo?: string;
  reason: string;
}): Promise<GenerateSimilarQuestionResult> {
  console.info(
    `[SIMILAR-EXAM-ISOMORPHIC] routed to custom type generator: ${args.reason}`,
  );

  const compiled = await compileCustomType(args.analysis);
  const result = await generateFromCustomType({
    spec: compiled.spec,
    passage: args.passage,
    gradeInfo: args.gradeInfo,
  });

  return {
    question: {
      ...result.question,
      _similarGenerationRoute: "CUSTOM_TYPE",
      _similarMatchingFallbackReason: args.reason,
      _similarCompiledCustomType: compiled.spec,
    },
    subType: result.subType,
    relaxedFallback: result.relaxedFallback,
    llmCalls: result.llmCalls + 1,
    llmAttempts: result.llmAttempts + 1,
  };
}

export async function generateSimilarQuestion(
  args: GenerateSimilarQuestionArgs,
): Promise<GenerateSimilarQuestionResult> {
  const { analysis, passage } = args;
  const stimulusKind = analysis.classification.stimulusKind;
  if (stimulusKind === "LISTENING" || stimulusKind === "VISUAL") {
    throw new Error(
      "듣기, 도표, 그림 기반 문항은 텍스트 지문만으로 동형 생성할 수 없어 제외합니다.",
    );
  }

  const route = resolveSimilarGenerationRoute(analysis);
  if (route.kind === "custom") {
    return generateCustomSimilarQuestion({
      analysis,
      passage,
      gradeInfo: args.gradeInfo,
      reason: route.reason,
    });
  }

  const subType = route.subType;
  const diffLabel = analysis.classification.difficulty;
  const targetPoints = [
    ...analysis.testingPoint.skills,
    ...analysis.transformation.rules,
  ].slice(0, 12);

  const plan: PlanResult["plan"] = [
    {
      subType,
      count: 1,
      reason: "Generated as an isomorphic variant of the analyzed source question.",
      targetPoints,
    },
  ];

  const result = await runQuestionGenerationWithEmptyRetry(
    {
      plan,
      schoolType: "고등학교",
      gradeInfo: args.gradeInfo ?? "",
      passageContent: passage,
      teacherIntentBlock: "",
      analysisContext: "",
      diffLabel,
      diffInstruction: DIFF_DESCRIPTION[diffLabel] ?? DIFF_DESCRIPTION.INTERMEDIATE,
      generationPlan: "STANDARD",
      typeSettings: toEngineTypeSettings(subType, analysis),
      customPrompt: buildIsomorphicGuidance(analysis),
    },
    { logPrefix: "SIMILAR-EXAM-ISOMORPHIC" },
  );

  const question = result.questions[0];
  if (!question) {
    throw new Error("동형 문항 생성에 실패했습니다(빈 결과).");
  }

  return {
    question,
    subType,
    relaxedFallback: result.relaxedFallback,
    llmCalls: result.usageEvents.length,
    llmAttempts: result.attempts,
  };
}
