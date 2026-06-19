import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { PrismaClient } from "@prisma/client";
import { z } from "zod";

import {
  AI_QUESTION_SCHEMAS,
  getAiResponseSchema,
} from "@/lib/question-ai-schemas-mc";
import { postProcessQuestion } from "@/lib/question-postprocess";
import {
  buildQuestionTargetCandidateBlock,
  getTypeQualityRubric,
  validateQuestionQuality,
} from "@/lib/question-quality";
import {
  QUESTION_SCHEMAS,
  STRUCTURED_TYPE_PROMPTS,
} from "@/lib/question-schemas";
import {
  buildQuestionTypeSettingsPrompt,
  getQuestionTypeGenerationTokenFloor,
  resolveQuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import {
  DIFF_DESCRIPTION,
} from "@/app/api/ai/generate-questions-auto/_lib/constants";
import {
  STRUCTURED_OUTPUT_INSTRUCTIONS,
  UNSTRUCTURED_OUTPUT_INSTRUCTIONS,
  buildGenerationPrompt,
} from "@/app/api/ai/generate-questions-auto/_lib/prompts";
import {
  buildAnalysisContext,
  extractTeacherAnnotations,
} from "@/app/api/ai/generate-questions-auto/_lib/build-analysis-context";
import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";

type BenchmarkCase = {
  id: string;
  passageId: string;
  questionType: string;
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  count: number;
};

type AtlasUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    text_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
    text_tokens?: number;
  };
};

const MODEL = process.env.ATLASCLOUD_TEXT_MODEL?.trim() || "moonshotai/kimi-k2.7-code";
const BASE_URL = "https://api.atlascloud.ai/v1";
const OUTPUT_DIR = path.join(process.cwd(), ".tmp", "kimi-question-benchmark");
const PROMPT_PLAN =
  process.env.KIMI_PROMPT_PLAN?.trim() === "STANDARD" ? "STANDARD" : "PREMIUM";

const DEFAULT_CASES: BenchmarkCase[] = [
  {
    id: "blank-inference-killer",
    passageId: "cmqj21pj60001jm04b3356eu4",
    questionType: "BLANK_INFERENCE",
    difficulty: "KILLER",
    count: 1,
  },
  {
    id: "grammar-error-intermediate",
    passageId: "cmqj2xuw50001hu0cw5k8u0xe",
    questionType: "GRAMMAR_ERROR",
    difficulty: "INTERMEDIATE",
    count: 1,
  },
  {
    id: "vocab-choice-intermediate",
    passageId: "cmqj37uy80005le04qnjj66q3",
    questionType: "VOCAB_CHOICE",
    difficulty: "INTERMEDIATE",
    count: 1,
  },
  {
    id: "sentence-insert-killer",
    passageId: "cmqj1x5yj0001l504musdythc",
    questionType: "SENTENCE_INSERT",
    difficulty: "KILLER",
    count: 1,
  },
  {
    id: "summary-complete-mc-intermediate",
    passageId: "cmqj280xv0001j90b8rl57wiq",
    questionType: "SUMMARY_COMPLETE_MC",
    difficulty: "INTERMEDIATE",
    count: 1,
  },
  {
    id: "irrelevant-intermediate",
    passageId: "cmqj2fztb0001le04gjl6ojt7",
    questionType: "IRRELEVANT",
    difficulty: "INTERMEDIATE",
    count: 1,
  },
];

function loadDotenv() {
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue
        .trim()
        .replace(/^['"]|['"]$/g, "");
    }
  }
}

function elapsedSince(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Empty model content");

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() || trimmed;
  if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;

  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first >= 0 && last > first) return candidate.slice(first, last + 1);

  throw new Error("No JSON object found in model content");
}

function safeStringify(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function toPlainJsonSchema(schema: z.ZodType) {
  const jsonSchema = z.toJSONSchema(schema);
  return JSON.parse(JSON.stringify(jsonSchema));
}

function compactSchemaOutline(schema: unknown, maxChars = 4500) {
  const root = schema && typeof schema === "object" ? schema as any : null;
  const questionSchema = root?.properties?.questions?.items;
  if (!questionSchema?.properties) {
    return "Root object: { questions: array }";
  }

  const lines: string[] = [
    "Root object: { questions: Question[] }",
    `Question required fields: ${(questionSchema.required ?? []).join(", ")}`,
    "Question field outline:",
  ];

  for (const [name, value] of Object.entries(questionSchema.properties)) {
    lines.push(`- ${name}: ${describeJsonSchema(value, 0)}`);
    if (lines.join("\n").length > maxChars) break;
  }

  return lines.join("\n").slice(0, maxChars);
}

function describeJsonSchema(value: unknown, depth: number): string {
  const schema = value && typeof value === "object" ? value as any : {};
  if (schema.enum) return `enum(${schema.enum.join(" | ")})`;
  if (schema.type === "array") {
    const item = schema.items;
    const count = schema.minItems === schema.maxItems && schema.minItems
      ? ` exactly ${schema.minItems}`
      : "";
    return `array${count} of ${describeJsonSchema(item, depth + 1)}`;
  }
  if (schema.type === "object" && schema.properties) {
    const keys = Object.keys(schema.properties);
    if (depth >= 1) return `object { ${keys.join(", ")} }`;
    const nested = keys
      .slice(0, 10)
      .map((key) => `${key}: ${describeJsonSchema(schema.properties[key], depth + 1)}`)
      .join("; ");
    return `object { ${nested} }`;
  }
  return schema.type ?? "value";
}

async function callAtlasChat(args: {
  schemaName: string;
  system?: string;
  prompt: string;
  schema: z.ZodType;
  maxTokens: number;
}) {
  const apiKey = process.env.ATLASCLOUD_API_KEY?.trim();
  if (!apiKey) throw new Error("ATLASCLOUD_API_KEY is not set");

  const jsonSchema = toPlainJsonSchema(args.schema);
  const schemaOutline = compactSchemaOutline(jsonSchema);
  const messages = [
    ...(args.system
      ? [{ role: "system" as const, content: args.system }]
      : []),
    {
      role: "user" as const,
      content: [
        args.prompt,
        "",
        "Return only a valid JSON object. Do not use markdown, code fences, commentary, or hidden analysis.",
        "The JSON must match this compact schema outline:",
        schemaOutline,
      ].join("\n"),
    },
  ];

  const startedAt = performance.now();
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: args.maxTokens,
      temperature: 0.2,
      stream: false,
    }),
  });
  const httpMs = elapsedSince(startedAt);
  const text = await response.text();
  let envelope: any = null;
  try {
    envelope = JSON.parse(text);
  } catch {
    // Keep raw text in the report below.
  }

  if (!response.ok) {
    throw new Error(
      `Atlas request failed ${response.status}: ${text.slice(0, 600)}`,
    );
  }

  const message = envelope?.choices?.[0]?.message;
  const content = typeof message?.content === "string" ? message.content : "";
  return {
    httpMs,
    rawEnvelope: envelope,
    rawContent: content,
    finishReason: envelope?.choices?.[0]?.finish_reason,
    usage: envelope?.usage as AtlasUsage | undefined,
  };
}

async function runCase(prisma: PrismaClient, testCase: BenchmarkCase) {
  const totalStartedAt = performance.now();
  const passage = await prisma.passage.findUnique({
    where: { id: testCase.passageId },
    include: {
      school: { select: { type: true, name: true } },
      analysis: { select: { analysisData: true } },
      notes: { orderBy: { order: "asc" } },
    },
  });
  if (!passage) throw new Error(`Passage not found: ${testCase.passageId}`);

  const setupStartedAt = performance.now();
  const schoolType = passage.school?.type === "MIDDLE" ? "middle school" : "high school";
  const gradeInfo = passage.grade ? `grade ${passage.grade}` : "";
  const teacherAnnotations = extractTeacherAnnotations(passage);
  const teacherIntentBlock = buildQuestionAnnotationBlock(teacherAnnotations);
  const analysisContext = buildAnalysisContext(passage);
  const diffInstruction =
    DIFF_DESCRIPTION[testCase.difficulty] || DIFF_DESCRIPTION.INTERMEDIATE;
  const rawTypeSettings = undefined;
  const resolved = resolveQuestionTypeGenerationSettings(
    testCase.questionType,
    rawTypeSettings,
  );

  const {
    effectiveTypeSettings,
    irrelevantSlotCount,
    grammarMarkerCount,
    grammarAnswerCount,
    grammarCorrectionErrorCount,
    summaryCompleteMcBlankCount,
    summaryCompleteBlankCount,
    contentMatchOptionCount,
    contentMatchAnswerCount,
    vocabChoiceMarkerCount,
    vocabChoiceAnswerCount,
    sentenceInsertSlotCount,
    antonymPairCount,
    blankInferenceBlankCount,
    blankInferenceParaphraseAnswer,
    blankInferenceDoubleNegative,
    genericOptionCount,
    genericAnswerCount,
    contentMatchType,
    answerPolarity,
  } = resolved;

  const typePrompt =
    STRUCTURED_TYPE_PROMPTS[testCase.questionType] ||
    `${testCase.questionType} question`;
  const typeSettingsPrompt = buildQuestionTypeSettingsPrompt(
    testCase.questionType,
    effectiveTypeSettings,
  );
  const targetCandidateBlock = buildQuestionTargetCandidateBlock(
    testCase.questionType,
    passage.content,
    {
      irrelevantSlotCount,
      grammarMarkerCount,
      grammarAnswerCount,
      grammarCorrectionErrorCount,
      antonymPairCount,
      blankInferenceBlankCount,
      blankInferenceParaphraseAnswer,
      blankInferenceDoubleNegative,
      requestedDifficulty: testCase.difficulty,
    },
  );
  const typeQualityRubric = getTypeQualityRubric(
    testCase.questionType,
    testCase.difficulty,
  );
  const hasAiSchema = !!AI_QUESTION_SCHEMAS[testCase.questionType];
  const isStructured =
    hasAiSchema || !!QUESTION_SCHEMAS[testCase.questionType];
  const schema = hasAiSchema
    ? getAiResponseSchema(testCase.questionType, {
        irrelevantSlotCount,
        grammarMarkerCount,
        grammarAnswerCount,
        grammarCorrectionErrorCount,
        summaryCompleteMcBlankCount,
        summaryCompleteBlankCount,
        contentMatchOptionCount,
        contentMatchAnswerCount,
        vocabChoiceMarkerCount,
        vocabChoiceAnswerCount,
        sentenceInsertSlotCount,
        antonymPairCount,
        blankInferenceBlankCount,
        genericOptionCount,
        genericAnswerCount,
      })
    : z.object({
        questions: z.array(QUESTION_SCHEMAS[testCase.questionType]),
      });

  const { system, prompt } = buildGenerationPrompt({
    schoolType,
    gradeInfo,
    passageContent: passage.content,
    teacherIntentBlock,
    analysisContext,
    targetPoints: [],
    typePrompt,
    structuredInstructions: isStructured
      ? STRUCTURED_OUTPUT_INSTRUCTIONS
      : UNSTRUCTURED_OUTPUT_INSTRUCTIONS,
    targetCandidateBlock,
    typeQualityRubric,
    typeCount: testCase.count,
    diffLabel: testCase.difficulty,
    diffInstruction,
    generationPlan: PROMPT_PLAN,
    customPrompt: typeSettingsPrompt,
  });
  const setupMs = elapsedSince(setupStartedAt);

  const maxTokens = Math.min(
    20_000,
    Math.max(
      getQuestionTypeGenerationTokenFloor(testCase.questionType, resolved),
      testCase.count * getQuestionTypeGenerationTokenFloor(testCase.questionType, resolved),
    ),
  );

  const atlas = await callAtlasChat({
    schemaName: `${testCase.questionType}_${testCase.difficulty}`,
    system,
    prompt,
    schema,
    maxTokens: Math.min(maxTokens, 4_096),
  });

  const parseStartedAt = performance.now();
  let parsedObject: unknown = null;
  let schemaSuccess = false;
  let parseError: string | null = null;
  try {
    parsedObject = JSON.parse(extractJsonObject(atlas.rawContent));
    parsedObject = schema.parse(parsedObject);
    schemaSuccess = true;
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  const parseAndSchemaMs = elapsedSince(parseStartedAt);

  const postStartedAt = performance.now();
  const rawQuestions =
    parsedObject &&
    typeof parsedObject === "object" &&
    Array.isArray((parsedObject as { questions?: unknown }).questions)
      ? ((parsedObject as { questions: unknown[] }).questions.filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null && !Array.isArray(item),
        ))
      : [];

  const questionResults = rawQuestions.map((rawQuestion) => {
    const post = postProcessQuestion(
      testCase.questionType,
      passage.content,
      rawQuestion,
    );
    const finalQuestion = post.success
      ? {
          ...rawQuestion,
          ...post.data,
          type: "MULTIPLE_CHOICE",
          subType: testCase.questionType,
          difficulty: testCase.difficulty,
        }
      : {
          ...rawQuestion,
          type: "MULTIPLE_CHOICE",
          subType: testCase.questionType,
          difficulty: testCase.difficulty,
        };

    const qualityIssues = post.success
      ? validateQuestionQuality({
          typeId: testCase.questionType,
          question: finalQuestion,
          passage: passage.content,
          requestedDifficulty: testCase.difficulty,
          irrelevantSlotCount,
          grammarMarkerCount,
          grammarAnswerCount,
          grammarCorrectionErrorCount,
          vocabChoiceMarkerCount,
          vocabChoiceAnswerCount,
          sentenceInsertSlotCount,
          antonymPairCount,
          blankInferenceBlankCount,
          blankInferenceParaphraseAnswer,
          genericOptionCount,
          genericAnswerCount,
          contentMatchType,
          answerPolarity,
        })
      : [];

    return {
      postprocess: {
        success: post.success,
        warnings: post.warnings,
        error: post.error,
      },
      quality: {
        errors: qualityIssues.filter((issue) => issue.severity === "error"),
        warnings: qualityIssues.filter((issue) => issue.severity === "warning"),
      },
      question: finalQuestion,
    };
  });
  const postprocessAndQualityMs = elapsedSince(postStartedAt);

  const usage = atlas.usage ?? {};
  const totalMs = elapsedSince(totalStartedAt);
  return {
    case: testCase,
    passage: {
      id: passage.id,
      title: passage.title,
      chars: passage.content.length,
      hasAnalysis: !!passage.analysis,
      preview: passage.content.replace(/\s+/g, " ").slice(0, 240),
    },
    model: MODEL,
    timings: {
      setupMs,
      atlasHttpMs: atlas.httpMs,
      parseAndSchemaMs,
      postprocessAndQualityMs,
      totalMs,
    },
    usage,
    derived: {
      outputTextTokens:
        usage.completion_tokens_details?.text_tokens ??
        usage.completion_tokens ??
        null,
      reasoningTokens:
        usage.completion_tokens_details?.reasoning_tokens ?? null,
      promptTokens: usage.prompt_tokens ?? null,
      totalTokens: usage.total_tokens ?? null,
      textTokensPerSecond:
        usage.completion_tokens_details?.text_tokens && atlas.httpMs > 0
          ? Math.round(
              (usage.completion_tokens_details.text_tokens / atlas.httpMs) *
                100_000,
            ) / 100
          : null,
      completionTokensPerSecond:
        usage.completion_tokens && atlas.httpMs > 0
          ? Math.round((usage.completion_tokens / atlas.httpMs) * 100_000) /
            100
          : null,
    },
    promptStats: {
      promptPlan: PROMPT_PLAN,
      systemChars: system?.length ?? 0,
      promptChars: prompt.length,
      maxTokens,
    },
    atlas: {
      finishReason: atlas.finishReason,
      rawContentPreview: atlas.rawContent.slice(0, 1200),
    },
    parse: {
      schemaSuccess,
      error: parseError,
      rawQuestionCount: rawQuestions.length,
    },
    aggregateQuality: {
      postprocessSuccessCount: questionResults.filter((r) => r.postprocess.success)
        .length,
      qualityErrorCount: questionResults.reduce(
        (sum, r) => sum + r.quality.errors.length,
        0,
      ),
      qualityWarningCount: questionResults.reduce(
        (sum, r) => sum + r.quality.warnings.length,
        0,
      ),
      qualityErrorCodes: questionResults.flatMap((r) =>
        r.quality.errors.map((issue) => issue.code),
      ),
      qualityWarningCodes: questionResults.flatMap((r) =>
        r.quality.warnings.map((issue) => issue.code),
      ),
    },
    questionResults,
  };
}

async function main() {
  loadDotenv();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const selectedCaseIds = new Set(process.argv.slice(2));
  const cases = selectedCaseIds.size
    ? DEFAULT_CASES.filter((testCase) => selectedCaseIds.has(testCase.id))
    : DEFAULT_CASES;
  if (cases.length === 0) {
    throw new Error(`No benchmark cases matched: ${[...selectedCaseIds].join(", ")}`);
  }

  const prisma = new PrismaClient();
  const startedAt = new Date();
  const results: any[] = [];
  try {
    for (const testCase of cases) {
      console.log(
        `[kimi-benchmark] ${testCase.id} ${testCase.questionType} ${testCase.difficulty} started`,
      );
      const caseStartedAt = performance.now();
      try {
        const result = await runCase(prisma, testCase);
        results.push(result);
        console.log(
          `[kimi-benchmark] ${testCase.id} done atlas=${result.timings.atlasHttpMs}ms total=${result.timings.totalMs}ms schema=${result.parse.schemaSuccess} q=${result.parse.rawQuestionCount} errors=${result.aggregateQuality.qualityErrorCount}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed = {
          case: testCase,
          model: MODEL,
          error: {
            message,
            elapsedMs: elapsedSince(caseStartedAt),
          },
        };
        results.push(failed);
        console.log(
          `[kimi-benchmark] ${testCase.id} failed total=${failed.error.elapsedMs}ms message=${message.slice(0, 160)}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  const completedAt = new Date();
  const successResults = results.filter((item) => !item.error);
  const failedResults = results.filter((item) => item.error);
  const summary = {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    model: MODEL,
    baseUrl: BASE_URL,
    caseCount: results.length,
    successCount: successResults.length,
    failureCount: failedResults.length,
    totals: {
      wallMs: completedAt.getTime() - startedAt.getTime(),
      atlasHttpMs: successResults.reduce((sum, item) => sum + item.timings.atlasHttpMs, 0),
      totalTokens: successResults.reduce(
        (sum, item) => sum + (item.usage.total_tokens ?? 0),
        0,
      ),
      promptTokens: successResults.reduce(
        (sum, item) => sum + (item.usage.prompt_tokens ?? 0),
        0,
      ),
      completionTokens: successResults.reduce(
        (sum, item) => sum + (item.usage.completion_tokens ?? 0),
        0,
      ),
      reasoningTokens: successResults.reduce(
        (sum, item) =>
          sum + (item.usage.completion_tokens_details?.reasoning_tokens ?? 0),
        0,
      ),
      textTokens: successResults.reduce(
        (sum, item) =>
          sum + (item.usage.completion_tokens_details?.text_tokens ?? 0),
        0,
      ),
      schemaSuccessCount: successResults.filter((item) => item.parse.schemaSuccess).length,
      generatedQuestionCount: successResults.reduce(
        (sum, item) => sum + item.parse.rawQuestionCount,
        0,
      ),
      qualityErrorCount: successResults.reduce(
        (sum, item) => sum + item.aggregateQuality.qualityErrorCount,
        0,
      ),
      qualityWarningCount: successResults.reduce(
        (sum, item) => sum + item.aggregateQuality.qualityWarningCount,
        0,
      ),
    },
    perCase: results.map((item) =>
      item.error
        ? {
            id: item.case.id,
            questionType: item.case.questionType,
            difficulty: item.case.difficulty,
            error: item.error,
          }
        : {
            id: item.case.id,
            questionType: item.case.questionType,
            difficulty: item.case.difficulty,
            passageTitle: item.passage.title,
            timings: item.timings,
            usage: item.usage,
            derived: item.derived,
            schemaSuccess: item.parse.schemaSuccess,
            rawQuestionCount: item.parse.rawQuestionCount,
            qualityErrorCodes: item.aggregateQuality.qualityErrorCodes,
            qualityWarningCodes: item.aggregateQuality.qualityWarningCodes,
            postprocessSuccessCount: item.aggregateQuality.postprocessSuccessCount,
          },
    ),
  };

  const stamp = startedAt
    .toISOString()
    .replace(/[:.]/g, "-");
  const outputPath = path.join(OUTPUT_DIR, `${stamp}.json`);
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ summary, results }, null, 2),
    "utf8",
  );
  console.log(`[kimi-benchmark] report=${outputPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[kimi-benchmark] failed", error);
  process.exitCode = 1;
});
