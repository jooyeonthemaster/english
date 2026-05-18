/**
 * Generate one KILLER item for every question type with Anthropic Sonnet 4.6,
 * then run the same post-processing and quality checks used by the API route.
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { model as geminiModel } from "../src/lib/ai";
import { STRUCTURED_TYPE_PROMPTS, QUESTION_SCHEMAS } from "../src/lib/question-schemas";
import { AI_QUESTION_SCHEMAS, getAiResponseSchema } from "../src/lib/question-ai-schemas-mc";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import {
  buildQuestionTargetCandidateBlock,
  getTypeQualityRubric,
  type QuestionQualityIssue,
  validateQuestionQuality,
} from "../src/lib/question-quality";

type GeneratedQuestion = Record<string, unknown>;

interface AuditItem {
  raw: GeneratedQuestion;
  processed: Record<string, unknown> | null;
  postProcess: {
    success: boolean;
    error?: string;
    warnings: string[];
  };
  qualityIssues: QuestionQualityIssue[];
}

type RunResult =
  | {
      typeId: string;
      ok: true;
      usage: unknown;
      ms: number;
      items: AuditItem[];
    }
  | {
      typeId: string;
      ok: false;
      error: string;
      ms: number;
    };

type TestProvider = "anthropic" | "gemini" | "atlas";

const PROVIDER = getProvider();
const MODEL_ID =
  PROVIDER === "gemini"
    ? "gemini-3-flash-preview"
    : PROVIDER === "atlas"
      ? "qwen/qwen3.6-plus"
      : "claude-sonnet-4-6";
const MODEL_FILE_ID = MODEL_ID.replace(/[^\w.-]+/g, "_");
const OUTDIR = path.join(process.cwd(), "scripts", "_gen_audit_out");

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
const CONCURRENCY = Number(process.env.TEST_CONCURRENCY || (PROVIDER === "gemini" ? 6 : 4));
const OUTFILE = path.join(
  OUTDIR,
  REQUESTED_TYPES.length > 0
    ? `${MODEL_FILE_ID}-${REQUESTED_TYPES.join("-").toLowerCase()}.json`
    : `${MODEL_FILE_ID}-all19.json`,
);

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

async function generateOnce(typeId: string) {
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
- difficulty field must be exactly "KILLER".
- Multiple-choice items must have exactly 5 options in {label, text} form.
- explanation: Korean, 3-5 sentences, evidence-based.
- keyPoints: 3 Korean learning points.
- wrongOptionExplanations: concise Korean explanation for each wrong option.
- wrongOptionExplanations is required for every multiple-choice item: include exactly four entries keyed by the wrong option labels. Never return an empty object.
- tags: Korean grammar/vocabulary/question-type tags.

Generate exactly 1 question.`;

  if (PROVIDER === "atlas") {
    return generateWithAtlas(prompt);
  }

  let lastError: unknown;
  let result: Awaited<ReturnType<typeof generateObject>> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) console.log(`[${MODEL_ID}] retry ${typeId} attempt=${attempt}`);
      result = await generateObject({
        model: PROVIDER === "gemini" ? geminiModel : anthropic(MODEL_ID),
        schema: responseSchema,
        prompt,
        abortSignal: AbortSignal.timeout(PROVIDER === "gemini" ? 120_000 : 180_000),
        providerOptions: {
          ...(PROVIDER === "gemini"
            ? { google: { thinkingConfig: { thinkingBudget: 4096 } } }
            : { anthropic: { structuredOutputMode: "jsonTool" } }),
        },
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!result) throw lastError;

  return {
    questions: getQuestionArray(result.object),
    usage: "usage" in result ? result.usage : undefined,
  };
}

async function runType(typeId: string) {
  const startedAt = Date.now();
  try {
    console.log(`[${MODEL_ID}] ${typeId}...`);
    const { questions, usage } = await generateOnce(typeId);
    const items = questions.map((raw) => {
      const pp = postProcessQuestion(typeId, PASSAGE, raw);
      const processed = pp.success ? pp.data : null;
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
      };
    });
    const ms = Date.now() - startedAt;
    const errorCount = items.reduce(
      (sum, item) => sum + item.qualityIssues.filter((issue) => issue.severity === "error").length,
      0,
    );
    const warningCount = items.reduce(
      (sum, item) => sum + item.qualityIssues.filter((issue) => issue.severity === "warning").length,
      0,
    );
    console.log(`[${MODEL_ID}] ${typeId} done: ${items.length} item(s), errors=${errorCount}, warnings=${warningCount}, ${ms}ms`);
    return { typeId, ok: true, usage, ms, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[${MODEL_ID}] ${typeId} failed: ${message}`);
    return { typeId, ok: false, error: message, ms: Date.now() - startedAt };
  }
}

async function main() {
  if (PROVIDER === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  if (PROVIDER === "atlas" && !process.env.ATLASCLOUD_API_KEY) {
    throw new Error("ATLASCLOUD_API_KEY is not set");
  }
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  console.log(`[${MODEL_ID}] running ${TYPES_TO_RUN.length} type(s), concurrency=${CONCURRENCY}`);
  const results: RunResult[] = await runWithConcurrency(TYPES_TO_RUN, CONCURRENCY, runType);

  const summary = results.map((result) => {
    const items = result.ok ? result.items : [];
    const issues = items.flatMap((item) => item.qualityIssues);
    return {
      typeId: result.typeId,
      ok: result.ok,
      generated: items.length,
      postProcessOk: items.filter((item) => item.postProcess.success).length,
      qualityErrors: issues.filter((issue) => issue.severity === "error").map((issue) => issue.code),
      qualityWarnings: issues.filter((issue) => issue.severity === "warning").map((issue) => issue.code),
      error: result.ok ? undefined : result.error,
    };
  });

  fs.writeFileSync(
    OUTFILE,
    JSON.stringify({ model: MODEL_ID, passage: PASSAGE, results, summary }, null, 2),
    "utf-8",
  );

  console.log(`\n========== ${MODEL_ID} ALL-19 SUMMARY ==========`);
  for (const row of summary) {
    console.log(
      `${row.typeId.padEnd(22)} ok=${String(row.ok).padEnd(5)} gen=${row.generated} pp=${row.postProcessOk} errors=${row.qualityErrors.join(",") || "-"} warnings=${row.qualityWarnings.join(",") || "-"}`,
    );
  }
  console.log(`saved=${OUTFILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function getQuestionArray(value: unknown): GeneratedQuestion[] {
  if (!isRecord(value) || !Array.isArray(value.questions)) return [];
  return value.questions.filter(isRecord);
}

function getProvider(): TestProvider {
  if (process.env.TEST_PROVIDER === "gemini") return "gemini";
  if (process.env.TEST_PROVIDER === "atlas") return "atlas";
  return "anthropic";
}

async function generateWithAtlas(prompt: string): Promise<{ questions: GeneratedQuestion[]; usage: unknown }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) console.log(`[${MODEL_ID}] retry atlas attempt=${attempt}`);
      const response = await fetch("https://api.atlascloud.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ATLASCLOUD_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL_ID,
          messages: [
            {
              role: "user",
              content: `${prompt}

Return only valid JSON. Do not wrap it in Markdown.
The top-level shape must be exactly:
{"questions":[{...}]}`,
            },
          ],
          max_tokens: 4096,
          temperature: 0.35,
          stream: false,
        }),
        signal: AbortSignal.timeout(180_000),
      });

      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(`Atlas HTTP ${response.status}: ${extractErrorMessage(payload)}`);
      }

      const content = extractAtlasContent(payload);
      const object = parseJsonObject(content);
      return {
        questions: getQuestionArray(object),
        usage: isRecord(payload) ? payload.usage : undefined,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function extractAtlasContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error("Atlas response missing choices array");
  }

  const firstChoice = payload.choices.find(isRecord);
  const message = isRecord(firstChoice?.message) ? firstChoice.message : null;
  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Atlas response missing message.content");
  }
  return content;
}

function extractErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) return "unknown error";
  const error = payload.error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof payload.message === "string") return payload.message;
  return JSON.stringify(payload).slice(0, 300);
}

function parseJsonObject(content: string): unknown {
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(`No JSON object found in response: ${stripped.slice(0, 300)}`);
    }
    return JSON.parse(stripped.slice(start, end + 1));
  }
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
