/**
 * Edge regression for teacher-reported generation defects:
 * - SENTENCE_INSERT: the given sentence or its source sentence must not remain visible.
 * - BLANK_INFERENCE doubleNegative: no-subject + negative-predicate double negation must fail.
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { runQuestionGenerationWithEmptyRetry } from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import { StructuredQuestionRenderer } from "../src/components/workbench/question-renderers";
import {
  type QuestionQualityIssue,
  validateQuestionQuality,
} from "../src/lib/question-quality";
import { HS_PASSAGE_DATA } from "./data/hs-passages";

const OUTDIR = path.join(process.cwd(), "scripts", "_gen_audit_out");
const PASSAGE_COUNT = Math.max(1, Number(process.env.TEST_PASSAGE_COUNT || 4));
const DIFFICULTY = normalizeDifficulty(process.env.TEST_DIFFICULTY || "INTERMEDIATE");
const REQUESTED_CASES = (process.env.TEST_EDGE_CASES || "SENTENCE_INSERT,BLANK_INFERENCE_DOUBLE_NEGATIVE")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

type EdgeCaseId = "SENTENCE_INSERT" | "BLANK_INFERENCE_DOUBLE_NEGATIVE";

type EdgeRunResult = {
  caseId: EdgeCaseId;
  passageTitle: string;
  ok: boolean;
  count: number;
  attempts: number;
  relaxedFallback: boolean;
  ms: number;
  qualityErrors: QuestionQualityIssue[];
  qualityWarnings: QuestionQualityIssue[];
  renderOk: boolean;
  renderError?: string;
  rejectionSummary: unknown;
  question?: Record<string, unknown>;
};

function normalizeDifficulty(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "BASIC" || normalized === "INTERMEDIATE" || normalized === "KILLER") {
    return normalized;
  }
  throw new Error(`Invalid TEST_DIFFICULTY: ${value}`);
}

function difficultyInstruction(difficulty: string) {
  if (difficulty === "BASIC") return "direct high-school exam item with clear source evidence";
  if (difficulty === "KILLER") return "top-tier exam item requiring precise passage evidence";
  return "mid-level exam item requiring contextual inference";
}

function selectedPassages() {
  return HS_PASSAGE_DATA
    .flatMap((group) => group.passages.map((passage) => ({
      title: passage.title,
      content: passage.content,
      grade: group.grade,
      semester: group.semester,
    })))
    .filter((passage) => passage.content.length >= 600)
    .slice(0, PASSAGE_COUNT);
}

function normalizeCaseId(value: string): EdgeCaseId {
  const normalized = value.trim().toUpperCase();
  if (normalized === "SENTENCE_INSERT") return "SENTENCE_INSERT";
  if (normalized === "BLANK_INFERENCE_DOUBLE_NEGATIVE" || normalized === "BLANK_INFERENCE") {
    return "BLANK_INFERENCE_DOUBLE_NEGATIVE";
  }
  throw new Error(`Unsupported edge case: ${value}`);
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

async function runOne(
  caseId: EdgeCaseId,
  passage: ReturnType<typeof selectedPassages>[number],
): Promise<EdgeRunResult> {
  const startedAt = Date.now();
  const typeId = caseId === "SENTENCE_INSERT" ? "SENTENCE_INSERT" : "BLANK_INFERENCE";
  console.log(`[edge-regression] ${caseId} :: ${passage.title}...`);

  const result = await runQuestionGenerationWithEmptyRetry({
    plan: [
      {
        subType: typeId,
        count: 1,
        reason: "Teacher-reported edge regression",
        targetPoints: [],
      },
    ],
    schoolType: "high school",
    gradeInfo: `grade ${passage.grade}`,
    passageContent: passage.content,
    teacherIntentBlock: "",
    analysisContext: "",
    diffLabel: DIFFICULTY,
    diffInstruction: difficultyInstruction(DIFFICULTY),
    generationPlan: "STANDARD",
    typeSettings: caseId === "BLANK_INFERENCE_DOUBLE_NEGATIVE"
      ? { BLANK_INFERENCE: { doubleNegative: true } }
      : undefined,
  }, {
    logPrefix: "EDGE-REGRESSION",
  });

  const question = result.questions[0];
  const qualityIssues = question
    ? validateQuestionQuality({
        typeId,
        question,
        passage: passage.content,
        requestedDifficulty: DIFFICULTY,
      })
    : [];
  const qualityErrors = qualityIssues.filter((issue) => issue.severity === "error");
  const qualityWarnings = qualityIssues.filter((issue) => issue.severity === "warning");
  const render = question ? checkRenderer(question) : { ok: false, error: "no question" };
  const ok = result.questions.length === 1 && qualityErrors.length === 0 && render.ok;

  console.log(
    `[edge-regression] ${caseId} :: ${passage.title} done ok=${ok ? "yes" : "no"} attempts=${result.attempts} count=${result.questions.length} errors=${qualityErrors.length} warnings=${qualityWarnings.length} render=${render.ok ? "ok" : "fail"} ms=${Date.now() - startedAt}`,
  );

  return {
    caseId,
    passageTitle: passage.title,
    ok,
    count: result.questions.length,
    attempts: result.attempts,
    relaxedFallback: result.relaxedFallback,
    ms: Date.now() - startedAt,
    qualityErrors,
    qualityWarnings,
    renderOk: render.ok,
    renderError: render.error,
    rejectionSummary: result.rejectionSummary,
    question,
  };
}

async function main() {
  if (!process.env.ATLASCLOUD_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("ATLASCLOUD_API_KEY or OPENROUTER_API_KEY is required.");
  }

  const cases = REQUESTED_CASES.map(normalizeCaseId);
  const passages = selectedPassages();
  fs.mkdirSync(OUTDIR, { recursive: true });

  const results: EdgeRunResult[] = [];
  for (const passage of passages) {
    for (const caseId of cases) {
      results.push(await runOne(caseId, passage));
    }
  }

  const okCount = results.filter((result) => result.ok).length;
  const summary = {
    generatedAt: new Date().toISOString(),
    difficulty: DIFFICULTY,
    passageCount: passages.length,
    cases,
    okCount,
    total: results.length,
    failures: results
      .filter((result) => !result.ok)
      .map((result) => ({
        caseId: result.caseId,
        passageTitle: result.passageTitle,
        count: result.count,
        attempts: result.attempts,
        qualityErrors: result.qualityErrors,
        renderError: result.renderError,
        rejectionSummary: result.rejectionSummary,
      })),
    results,
  };

  const outPath = path.join(
    OUTDIR,
    `edge-regression-${cases.join("-").toLowerCase()}-${DIFFICULTY.toLowerCase()}-${passages.length}.json`,
  );
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("\n========== EDGE REGRESSION ==========");
  console.log(`ok=${okCount}/${results.length} saved=${outPath}`);
  for (const result of results) {
    console.log(
      `${result.caseId.padEnd(32)} ${result.passageTitle.slice(0, 28).padEnd(28)} ok=${result.ok ? "yes" : "no "} attempts=${String(result.attempts).padEnd(2)} e=${result.qualityErrors.length} w=${result.qualityWarnings.length} render=${result.renderOk ? "ok" : "fail"}`,
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
