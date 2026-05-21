/**
 * Compare Gemini 3.5 Flash and Claude Sonnet 4.6 across all 19 question types.
 *
 * The audit measures:
 * - generation latency
 * - schema / post-process success
 * - automated quality errors and warnings
 * - JSON round-trip safety for structuredData
 * - actual React renderer safety via StructuredQuestionRenderer
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

import { GEMINI_MODEL_ID, model as geminiModel } from "../src/lib/ai";
import { StructuredQuestionRenderer } from "../src/components/workbench/question-renderers";
import { STRUCTURED_TYPE_PROMPTS, QUESTION_SCHEMAS } from "../src/lib/question-schemas";
import { AI_QUESTION_SCHEMAS, getAiResponseSchema } from "../src/lib/question-ai-schemas-mc";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import {
  buildQuestionTargetCandidateBlock,
  getTypeQualityRubric,
  type QuestionQualityIssue,
  validateQuestionQuality,
} from "../src/lib/question-quality";
import { buildQuestionGenerationPromptContract } from "../src/lib/question-generation-prompt-contract";

type GeneratedQuestion = Record<string, unknown>;
type TestProvider = "gemini" | "anthropic";

interface ProviderConfig {
  provider: TestProvider;
  label: string;
  modelId: string;
  defaultConcurrency: number;
  timeoutMs: number;
}

interface RenderCheck {
  success: boolean;
  htmlLength?: number;
  error?: string;
}

interface JsonCheck {
  success: boolean;
  bytes?: number;
  error?: string;
}

interface AuditItem {
  raw: GeneratedQuestion;
  processed: Record<string, unknown> | null;
  postProcess: {
    success: boolean;
    error?: string;
    warnings: string[];
  };
  qualityIssues: QuestionQualityIssue[];
  jsonRoundTrip: JsonCheck;
  render: RenderCheck;
  automatedScore: number;
}

type RunResult =
  | {
      provider: TestProvider;
      modelId: string;
      typeId: string;
      attempt: number;
      ok: true;
      expectedCount: number;
      generatedCount: number;
      countMismatch: boolean;
      retryAttempts: number;
      retryErrors: string[];
      usage: unknown;
      ms: number;
      items: AuditItem[];
    }
  | {
      provider: TestProvider;
      modelId: string;
      typeId: string;
      attempt: number;
      ok: false;
      error: string;
      ms: number;
    };

const PROVIDERS: Record<TestProvider, ProviderConfig> = {
  gemini: {
    provider: "gemini",
    label: "Gemini 3.5 Flash",
    modelId: GEMINI_MODEL_ID,
    defaultConcurrency: 4,
    timeoutMs: Number(process.env.GEMINI_QUESTION_TIMEOUT_MS ?? 120_000),
  },
  anthropic: {
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    modelId: "claude-sonnet-4-6",
    defaultConcurrency: 3,
    timeoutMs: 180_000,
  },
};

const ALL_TYPES = [
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "REFERENCE",
  "CONTENT_MATCH",
  "IRRELEVANT",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE",
  "WORD_ORDER",
  "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
];

const REQUESTED_TYPES = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);
const TYPES_TO_RUN = REQUESTED_TYPES.length > 0 ? REQUESTED_TYPES : ALL_TYPES;
const PROVIDERS_TO_RUN = getProvidersToRun();
const REPEATS = Math.max(1, Number(process.env.TEST_REPEATS || 1));
const GEMINI_THINKING_BUDGET = Number(process.env.GEMINI_QUESTION_THINKING_BUDGET ?? 4096);
const RUN_SCOPE_ID = REQUESTED_TYPES.length > 0 ? REQUESTED_TYPES.join("-").toLowerCase() : "all19";
const OUTDIR = path.join(process.cwd(), "scripts", "_gen_audit_out");

const PASSAGE = `Few mistakes in reasoning are as common as the tendency to throw good money after bad. Economists call it the sunk cost fallacy: the belief that past investments justify future commitments, even when the future looks dim. A factory that has spent millions developing a doomed product will often keep pouring resources into it, simply because so much has already been invested. The same logic infects everyday life: people sit through bad films because they paid for the ticket, stay in unproductive relationships because of the years already invested, and persist in failing careers because turning back would feel like an admission of defeat. Rational decision-making, by contrast, requires evaluating each new choice on its own merits, asking not what has been spent but what is still to gain. The hardest lesson in economics, then, may also be the hardest lesson in life.`;

const DIFFICULTY_RUBRIC = `## Difficulty quality bar
- KILLER must be genuinely top-tier, not merely labeled as hard.
- The correct answer should require at least two reasoning steps: passage evidence, discourse logic, grammar, or semantic nuance.
- All four distractors must be plausible. Do not make the answer obvious through length, tone, or absurd wording.
- Explanation must identify why the tempting wrong answers fail, not only why the correct answer is correct.`;

const MARKING_RUBRIC = `## Marking accuracy requirements
- Any underlinedPronoun, underlinedWord, originalExpression, markedWords, or markedExpressions must exist in the original passage.
- Very short words such as it, is, in, as, or to may only be selected when they appear as standalone tokens. Never select a substring inside digital, commitments, within, or similar words.
- surroundingText must be an exact 40-80 character slice around the selected expression.
- Do not generate full-passage display fields such as passageWithBlank, passageWithMarkers, passageWithUnderline, or passageWithNumbers. The server reconstructs them.`;

async function generateOnce(provider: ProviderConfig, typeId: string) {
  const typePrompt = STRUCTURED_TYPE_PROMPTS[typeId] || `${typeId} question type.`;
  const typeQualityRubric = getTypeQualityRubric(typeId, "KILLER");
  const targetCandidateBlock = buildQuestionTargetCandidateBlock(typeId, PASSAGE);
  const hasAiSchema = !!AI_QUESTION_SCHEMAS[typeId];
  const isStructured = hasAiSchema || !!QUESTION_SCHEMAS[typeId];
  const responseSchema = hasAiSchema
    ? getAiResponseSchema(typeId)
    : isStructured
      ? z.object({ questions: z.array(QUESTION_SCHEMAS[typeId]) })
      : z.object({ questions: z.array(z.any()) });

  const structuredInstructions = isStructured
    ? `## Structured output requirements
- Use exactly the field names required by this question type schema.
- direction must be written in Korean.
- correctAnswer must be the option label for multiple-choice items, or the exact answer text for constructed-response items.
- Do not include full passage display fields; the server will reconstruct them.`
    : "";
  const providerQualityContract = provider.provider === "gemini"
    ? buildQuestionGenerationPromptContract("STANDARD")
    : "";

  const prompt = `You are a Korean high-school English exam item writer.

## Passage
${PASSAGE}
${targetCandidateBlock ? `\n${targetCandidateBlock}\n` : ""}

## Question type instructions
${typePrompt}
${typeQualityRubric ? `\n${typeQualityRubric}` : ""}
${structuredInstructions}

## Generation requirements
- Generate exactly 1 question.
- Difficulty: KILLER
${DIFFICULTY_RUBRIC}
${MARKING_RUBRIC}
${providerQualityContract}
- difficulty field must be exactly "KILLER".
- Multiple-choice items must have exactly 5 options in {label, text} form.
- explanation: Korean, 3-5 sentences, evidence-based.
- keyPoints: 3 Korean learning points.
- wrongOptionExplanations: concise Korean explanation for each wrong option.
- wrongOptionExplanations is required for every multiple-choice item: include exactly four entries, one for each wrong option. If the schema is an array, each entry must be {label, explanation}. Never return an empty object.
- tags: Korean grammar/vocabulary/question-type tags.

Generate exactly 1 question.`;

  let lastError: unknown;
  let result: Awaited<ReturnType<typeof generateObject>> | null = null;
  const retryErrors: string[] = [];
  let attemptsUsed = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    attemptsUsed = attempt + 1;
    try {
      if (attempt > 0) {
        console.log(`[${provider.modelId}] retry ${typeId} attempt=${attempt}`);
      }
      result = await generateObject({
        model: provider.provider === "gemini" ? geminiModel : anthropic(provider.modelId),
        schema: responseSchema,
        prompt,
        abortSignal: AbortSignal.timeout(provider.timeoutMs),
        providerOptions: {
          ...(provider.provider === "gemini"
            ? { google: { thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET } } }
            : { anthropic: { structuredOutputMode: "jsonTool" } }),
        },
      });
      break;
    } catch (error) {
      lastError = error;
      retryErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!result) throw lastError;

  return {
    questions: getQuestionArray(result.object),
    usage: "usage" in result ? result.usage : undefined,
    retryAttempts: attemptsUsed,
    retryErrors,
  };
}

async function runType(provider: ProviderConfig, typeId: string, attempt: number): Promise<RunResult> {
  const startedAt = Date.now();
  try {
    console.log(`[${provider.modelId}] ${typeId} #${attempt}...`);
    const { questions, usage, retryAttempts, retryErrors } = await generateOnce(provider, typeId);
    const expectedCount = 1;
    const countMismatch = questions.length !== expectedCount;
    if (countMismatch) {
      console.log(`[${provider.modelId}] ${typeId} #${attempt} count mismatch: expected=${expectedCount}, actual=${questions.length}`);
    }
    const items = questions.map((raw) => {
      const pp = postProcessQuestion(typeId, PASSAGE, raw);
      const processed = pp.success ? (pp.data as Record<string, unknown>) : null;
      const renderReady = processed
        ? { ...processed, _typeId: typeId, _typeLabel: typeId, _generationPlan: provider.provider === "gemini" ? "STANDARD" : "PREMIUM" }
        : null;
      const jsonRoundTrip = renderReady ? checkJsonRoundTrip(renderReady) : { success: false, error: "post-process failed" };
      const render = jsonRoundTrip.success && renderReady
        ? checkRenderer(JSON.parse(JSON.stringify(renderReady)) as Record<string, unknown>)
        : { success: false, error: jsonRoundTrip.error ?? "json round-trip failed" };
      const qualityIssues = processed
        ? validateQuestionQuality({
            typeId,
            question: processed,
            passage: PASSAGE,
            requestedDifficulty: "KILLER",
          })
        : [];

      return {
        raw,
        processed,
        postProcess: {
          success: pp.success,
          error: pp.error,
          warnings: pp.warnings,
        },
        qualityIssues,
        jsonRoundTrip,
        render,
        automatedScore: scoreItem({
          postProcessOk: pp.success,
          qualityIssues,
          jsonOk: jsonRoundTrip.success,
          renderOk: render.success,
        }),
      };
    });
    const ms = Date.now() - startedAt;
    const errorCount = countIssues(items, "error");
    const warningCount = countIssues(items, "warning");
    const renderFailures = items.filter((item) => !item.render.success).length;
    const jsonFailures = items.filter((item) => !item.jsonRoundTrip.success).length;
    console.log(
      `[${provider.modelId}] ${typeId} #${attempt} done: ${items.length} item(s), errors=${errorCount}, warnings=${warningCount}, renderFailures=${renderFailures}, jsonFailures=${jsonFailures}, ${ms}ms`,
    );
    return {
      provider: provider.provider,
      modelId: provider.modelId,
      typeId,
      attempt,
      ok: true,
      expectedCount,
      generatedCount: questions.length,
      countMismatch,
      retryAttempts,
      retryErrors,
      usage,
      ms,
      items,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[${provider.modelId}] ${typeId} #${attempt} failed: ${message}`);
    return { provider: provider.provider, modelId: provider.modelId, typeId, attempt, ok: false, error: message, ms: Date.now() - startedAt };
  }
}

async function runProvider(provider: ProviderConfig) {
  const concurrency = Math.max(1, Number(process.env.TEST_CONCURRENCY || provider.defaultConcurrency));
  const jobs = TYPES_TO_RUN.flatMap((typeId) =>
    Array.from({ length: REPEATS }, (_, index) => ({ typeId, attempt: index + 1 })),
  );
  console.log(`\n[${provider.modelId}] running ${jobs.length} job(s), concurrency=${concurrency}`);
  const startedAt = Date.now();
  const results = await runWithConcurrency(jobs, concurrency, (job) =>
    runType(provider, job.typeId, job.attempt),
  );
  const aggregate = aggregateProvider(provider, results, Date.now() - startedAt);
  const outfile = path.join(
    OUTDIR,
    `${safeFileId(provider.modelId)}-${RUN_SCOPE_ID}.json`,
  );
  fs.writeFileSync(
    outfile,
    JSON.stringify({ provider, settings: { geminiThinkingBudget: GEMINI_THINKING_BUDGET }, passage: PASSAGE, results, aggregate }, null, 2),
    "utf-8",
  );
  return { provider, results, aggregate, outfile };
}

async function main() {
  validateEnv();
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  const providerRuns = [];
  for (const providerKey of PROVIDERS_TO_RUN) {
    providerRuns.push(await runProvider(PROVIDERS[providerKey]));
  }

  const comparison = buildComparison(providerRuns);
  const comparisonOutfile = path.join(
    OUTDIR,
    `comparison-${providerRuns.map((run) => safeFileId(run.provider.modelId)).join("-vs-")}-${RUN_SCOPE_ID}.json`,
  );
  fs.writeFileSync(
    comparisonOutfile,
    JSON.stringify({ generatedAt: new Date().toISOString(), comparison, providerRuns }, null, 2),
    "utf-8",
  );

  printComparison(providerRuns, comparison, comparisonOutfile);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function checkJsonRoundTrip(value: Record<string, unknown>): JsonCheck {
  try {
    const serialized = JSON.stringify(value);
    JSON.parse(serialized);
    return { success: true, bytes: Buffer.byteLength(serialized, "utf-8") };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function checkRenderer(question: Record<string, unknown>): RenderCheck {
  try {
    const html = renderToStaticMarkup(
      React.createElement(StructuredQuestionRenderer, {
        question,
        index: 0,
        hideHeader: true,
      }),
    );
    return {
      success: html.trim().length > 0,
      htmlLength: html.length,
      error: html.trim().length > 0 ? undefined : "empty renderer output",
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function scoreItem(input: {
  postProcessOk: boolean;
  qualityIssues: QuestionQualityIssue[];
  jsonOk: boolean;
  renderOk: boolean;
}) {
  let score = 100;
  if (!input.postProcessOk) score -= 45;
  if (!input.jsonOk) score -= 25;
  if (!input.renderOk) score -= 35;
  score -= input.qualityIssues.filter((issue) => issue.severity === "error").length * 20;
  score -= input.qualityIssues.filter((issue) => issue.severity === "warning").length * 5;
  return Math.max(0, score);
}

function aggregateProvider(provider: ProviderConfig, results: RunResult[], wallMs: number) {
  const okResults = results.filter((result): result is Extract<RunResult, { ok: true }> => result.ok);
  const items = okResults.flatMap((result) => result.items);
  const qualityErrors = items.flatMap((item) => item.qualityIssues.filter((issue) => issue.severity === "error"));
  const qualityWarnings = items.flatMap((item) => item.qualityIssues.filter((issue) => issue.severity === "warning"));
  const totalMs = results.reduce((sum, result) => sum + result.ms, 0);
  const generated = items.length;
  const score = generated > 0
    ? Number((items.reduce((sum, item) => sum + item.automatedScore, 0) / generated).toFixed(1))
    : 0;

  return {
    provider: provider.provider,
    label: provider.label,
    modelId: provider.modelId,
    requestedTypes: TYPES_TO_RUN.length,
    repeats: REPEATS,
    calls: results.length,
    callFailures: results.filter((result) => !result.ok).length,
    retriedCalls: okResults.filter((result) => result.retryAttempts > 1).length,
    retryErrors: okResults.flatMap((result) => result.retryErrors),
    generated,
    countMismatches: okResults.filter((result) => result.countMismatch).length,
    postProcessFailures: items.filter((item) => !item.postProcess.success).length,
    renderFailures: items.filter((item) => !item.render.success).length,
    jsonFailures: items.filter((item) => !item.jsonRoundTrip.success).length,
    qualityErrorCount: qualityErrors.length,
    qualityWarningCount: qualityWarnings.length,
    averageCallMs: results.length > 0 ? Math.round(totalMs / results.length) : 0,
    wallMs,
    automatedScore: score,
    issueCodes: summarizeIssueCodes(items),
  };
}

function buildComparison(providerRuns: Awaited<ReturnType<typeof runProvider>>[]) {
  const rows = providerRuns.map((run) => run.aggregate);
  const qualityWinner = [...rows].sort((a, b) => b.automatedScore - a.automatedScore)[0];
  const speedWinner = [...rows].sort((a, b) => a.averageCallMs - b.averageCallMs)[0];
  const reliabilityWinner = [...rows].sort((a, b) => {
    const aFailures = a.callFailures + a.countMismatches + a.postProcessFailures + a.renderFailures + a.jsonFailures + a.qualityErrorCount;
    const bFailures = b.callFailures + b.countMismatches + b.postProcessFailures + b.renderFailures + b.jsonFailures + b.qualityErrorCount;
    return aFailures - bFailures;
  })[0];

  return {
    rows,
    winners: {
      quality: qualityWinner?.modelId,
      speed: speedWinner?.modelId,
      reliability: reliabilityWinner?.modelId,
    },
    byType: TYPES_TO_RUN.map((typeId) => {
      const typeRows = providerRuns.map((run) => {
        const results = run.results.filter((result) => result.typeId === typeId);
        const okResults = results.filter((result): result is Extract<RunResult, { ok: true }> => result.ok);
        const items = okResults.flatMap((result) => result.items);
        const score = items.length
          ? Number((items.reduce((sum, item) => sum + item.automatedScore, 0) / items.length).toFixed(1))
          : 0;
        return {
          modelId: run.provider.modelId,
          okCalls: okResults.length,
          failedCalls: results.length - okResults.length,
          averageMs: results.length ? Math.round(results.reduce((sum, result) => sum + result.ms, 0) / results.length) : 0,
          generated: items.length,
          countMismatches: okResults.filter((result) => result.countMismatch).length,
          retriedCalls: okResults.filter((result) => result.retryAttempts > 1).length,
          retryErrors: okResults.flatMap((result) => result.retryErrors),
          qualityErrors: countIssues(items, "error"),
          qualityWarnings: countIssues(items, "warning"),
          renderFailures: items.filter((item) => !item.render.success).length,
          jsonFailures: items.filter((item) => !item.jsonRoundTrip.success).length,
          score,
        };
      });
      return { typeId, providers: typeRows };
    }),
  };
}

function printComparison(
  providerRuns: Awaited<ReturnType<typeof runProvider>>[],
  comparison: ReturnType<typeof buildComparison>,
  comparisonOutfile: string,
) {
  console.log("\n========== QUESTION GENERATION MODEL COMPARISON ==========");
  for (const run of providerRuns) {
    const a = run.aggregate;
    console.log(
      `${a.modelId.padEnd(24)} score=${String(a.automatedScore).padEnd(5)} avgMs=${String(a.averageCallMs).padEnd(6)} calls=${a.calls} callFail=${a.callFailures} countMismatch=${a.countMismatches} qErr=${a.qualityErrorCount} qWarn=${a.qualityWarningCount} ppFail=${a.postProcessFailures} renderFail=${a.renderFailures} jsonFail=${a.jsonFailures}`,
    );
    if (a.retriedCalls > 0) {
      console.log(`  retriedCalls=${a.retriedCalls} retryErrors=${a.retryErrors.slice(0, 3).join(" | ")}`);
    }
    console.log(`  saved=${run.outfile}`);
  }
  console.log(
    `winners quality=${comparison.winners.quality} speed=${comparison.winners.speed} reliability=${comparison.winners.reliability}`,
  );
  console.log(`comparison=${comparisonOutfile}`);

  console.log("\nType".padEnd(24) + providerRuns.map((run) => run.provider.modelId.padEnd(36)).join(""));
  for (const row of comparison.byType) {
    const cells = row.providers.map((provider) =>
      `ok=${provider.okCalls}/${provider.okCalls + provider.failedCalls} ms=${provider.averageMs} score=${provider.score} retry=${provider.retriedCalls} c=${provider.countMismatches} e=${provider.qualityErrors} w=${provider.qualityWarnings} r=${provider.renderFailures} j=${provider.jsonFailures}`.padEnd(36),
    );
    console.log(row.typeId.padEnd(24) + cells.join(""));
  }
}

function getQuestionArray(value: unknown): GeneratedQuestion[] {
  if (!isRecord(value) || !Array.isArray(value.questions)) return [];
  return value.questions.filter(isRecord);
}

function getProvidersToRun(): TestProvider[] {
  const raw = process.env.TEST_PROVIDERS ?? process.env.TEST_PROVIDER;
  if (!raw) return ["gemini", "anthropic"];
  const providers = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is TestProvider => value === "gemini" || value === "anthropic");
  return providers.length > 0 ? [...new Set(providers)] : ["gemini", "anthropic"];
}

function validateEnv() {
  if (PROVIDERS_TO_RUN.includes("gemini") && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is not set");
  }
  if (PROVIDERS_TO_RUN.includes("anthropic") && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
}

function countIssues(items: AuditItem[], severity: "error" | "warning") {
  return items.reduce(
    (sum, item) => sum + item.qualityIssues.filter((issue) => issue.severity === severity).length,
    0,
  );
}

function summarizeIssueCodes(items: AuditItem[]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    for (const issue of item.qualityIssues) {
      counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    }
  }
  return counts;
}

function safeFileId(value: string) {
  return value.replace(/[^\w.-]+/g, "_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: Array<R | undefined> = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex++;
        results[currentIndex] = await worker(items[currentIndex]);
      }
    }),
  );

  return results.filter((result): result is R => result !== undefined);
}
