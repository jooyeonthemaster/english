import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import type { PlanResult } from "@/app/api/ai/generate-questions-auto/_lib/schemas";
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import { compileCustomType } from "@/lib/custom-question-types/compiler";
import { generateFromCustomType } from "@/lib/custom-question-types/generator";
import type { QuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";

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

function toEngineTypeSettings(
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
      if (optionCount == null && answerCount == null) {
        return undefined;
      }
      return {
        CONTENT_MATCH: {
          ...(optionCount != null ? { optionCount } : {}),
          ...(answerCount != null ? { answerCount } : {}),
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
    case "BLANK_INFERENCE":
      if (!ts.blankDoubleNegative) return undefined;
      return { BLANK_INFERENCE: { doubleNegative: true } };
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
