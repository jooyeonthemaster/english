/**
 * Regression audit for the actual STANDARD/Gemini workbench prompt path.
 *
 * This uses runQuestionGeneration(), so it exercises the same compact prompt
 * builder, schema selection, post-processing, quality gate, JSON round-trip,
 * and React renderer path used by the workbench generation flow.
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { runQuestionGeneration } from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import { StructuredQuestionRenderer } from "../src/components/workbench/question-renderers";
import {
  type QuestionQualityIssue,
  validateQuestionQuality,
} from "../src/lib/question-quality";

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

const PASSAGE = `Few mistakes in reasoning are as common as the tendency to throw good money after bad. Economists call it the sunk cost fallacy: the belief that past investments justify future commitments, even when the future looks dim. A factory that has spent millions developing a doomed product will often keep pouring resources into it, simply because so much has already been invested. The same logic infects everyday life: people sit through bad films because they paid for the ticket, stay in unproductive relationships because of the years already invested, and persist in failing careers because turning back would feel like an admission of defeat. Rational decision-making, by contrast, requires evaluating each new choice on its own merits, asking not what has been spent but what is still to gain. The hardest lesson in economics, then, may also be the hardest lesson in life.`;

type RunResult = {
  typeId: string;
  ok: boolean;
  ms: number;
  count: number;
  qualityErrors: QuestionQualityIssue[];
  qualityWarnings: QuestionQualityIssue[];
  jsonOk: boolean;
  jsonError?: string;
  renderOk: boolean;
  renderError?: string;
  question?: Record<string, unknown>;
};

const REQUESTED_TYPES = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);
const TYPES_TO_RUN = REQUESTED_TYPES.length > 0 ? REQUESTED_TYPES : ALL_TYPES;
const CONCURRENCY = Math.max(1, Number(process.env.TEST_CONCURRENCY || 3));
const OUTDIR = path.join(process.cwd(), "scripts", "_gen_audit_out");

function checkJsonRoundTrip(question: Record<string, unknown>) {
  try {
    const json = JSON.stringify(question);
    JSON.parse(json);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkRenderer(question: Record<string, unknown>) {
  try {
    const html = renderToStaticMarkup(
      React.createElement(StructuredQuestionRenderer, {
        question,
        index: 0,
        hideHeader: true,
      }),
    );
    return {
      ok: html.trim().length > 0,
      error: html.trim().length > 0 ? undefined : "empty renderer output",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runOne(typeId: string): Promise<RunResult> {
  const startedAt = Date.now();
  console.log(`[compact-prompt] ${typeId}...`);

  const questions = await runQuestionGeneration({
    plan: [
      {
        subType: typeId,
        count: 1,
        reason: "Compact prompt regression audit",
        targetPoints: [],
      },
    ],
    schoolType: "high school",
    gradeInfo: "grade 2",
    passageContent: PASSAGE,
    teacherIntentBlock: "",
    analysisContext: "",
    diffLabel: "KILLER",
    diffInstruction: "top-tier exam item requiring precise passage evidence",
    generationPlan: "STANDARD",
  });

  const ms = Date.now() - startedAt;
  const question = questions[0];
  const qualityIssues = question
    ? validateQuestionQuality({
        typeId,
        question,
        passage: PASSAGE,
        requestedDifficulty: "KILLER",
      })
    : [];
  const qualityErrors = qualityIssues.filter((issue) => issue.severity === "error");
  const qualityWarnings = qualityIssues.filter((issue) => issue.severity === "warning");
  const json = question ? checkJsonRoundTrip(question) : { ok: false, error: "no question" };
  const render = question && json.ok
    ? checkRenderer(JSON.parse(JSON.stringify(question)) as Record<string, unknown>)
    : { ok: false, error: json.error ?? "json round-trip failed" };

  const ok = questions.length === 1 && qualityErrors.length === 0 && json.ok && render.ok;
  console.log(
    `[compact-prompt] ${typeId} done: ok=${ok ? "yes" : "no"} count=${questions.length} ms=${ms} errors=${qualityErrors.length} warnings=${qualityWarnings.length} json=${json.ok ? "ok" : "fail"} render=${render.ok ? "ok" : "fail"}`,
  );

  return {
    typeId,
    ok,
    ms,
    count: questions.length,
    qualityErrors,
    qualityWarnings,
    jsonOk: json.ok,
    jsonError: json.error,
    renderOk: render.ok,
    renderError: render.error,
    question,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is required.");
  }

  fs.mkdirSync(OUTDIR, { recursive: true });
  console.log(
    `[compact-prompt] running ${TYPES_TO_RUN.length} type(s), concurrency=${CONCURRENCY}`,
  );

  const startedAt = Date.now();
  const results = await runWithConcurrency(TYPES_TO_RUN, CONCURRENCY, runOne);
  const totalMs = Date.now() - startedAt;
  const okCount = results.filter((result) => result.ok).length;
  const averageMs = Math.round(
    results.reduce((sum, result) => sum + result.ms, 0) / Math.max(1, results.length),
  );
  const summary = {
    generatedAt: new Date().toISOString(),
    scope: REQUESTED_TYPES.length > 0 ? REQUESTED_TYPES : "all19",
    totalMs,
    averageMs,
    okCount,
    total: results.length,
    failures: results
      .filter((result) => !result.ok)
      .map((result) => ({
        typeId: result.typeId,
        count: result.count,
        qualityErrors: result.qualityErrors,
        jsonError: result.jsonError,
        renderError: result.renderError,
      })),
    results,
  };

  const scope = REQUESTED_TYPES.length > 0
    ? REQUESTED_TYPES.join("-").toLowerCase()
    : "all19";
  const outPath = path.join(OUTDIR, `compact-prompt-${scope}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("\n========== COMPACT PROMPT REGRESSION ==========");
  console.log(
    `ok=${okCount}/${results.length} avgMs=${averageMs} totalMs=${totalMs} saved=${outPath}`,
  );
  for (const result of results) {
    console.log(
      `${result.typeId.padEnd(22)} ok=${result.ok ? "yes" : "no "} ms=${String(result.ms).padEnd(6)} count=${result.count} e=${result.qualityErrors.length} w=${result.qualityWarnings.length} json=${result.jsonOk ? "ok" : "fail"} render=${result.renderOk ? "ok" : "fail"}`,
    );
  }

  if (okCount !== results.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
