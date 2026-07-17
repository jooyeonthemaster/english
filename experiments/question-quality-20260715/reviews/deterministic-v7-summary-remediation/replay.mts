import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as quality from "../../../../src/lib/question-quality/index";
import * as blindModule from "../deterministic-splits-remediation-reaudit-v7/blind-holdout-cases.mjs";
import * as targetedModule from "../deterministic-splits-remediation-reaudit-v7/targeted-summary-answer-object-cases.mjs";

const qualityRuntime =
  (quality as unknown as { default?: typeof quality }).default ?? quality;
const { validateQuestionQuality } = qualityRuntime;
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const summaryPassage =
  "Careful reviewers compare several independent observations before accepting a conclusion. " +
  "This practice prevents one noisy measurement from controlling the result.";
const summaryBase = {
  direction: "Complete the summary by choosing the best words for (A) and (B).",
  summaryWithBlanks:
    "Reviewers make more (A) judgments by limiting reliance on (B) observations.",
  blanks: [
    { label: "(A)", answer: "reliable" },
    { label: "(B)", answer: "noisy" },
  ],
  options: [
    { label: "1", text: "reliable / noisy", blankA: "reliable", blankB: "noisy" },
    { label: "2", text: "reliable / stable", blankA: "reliable", blankB: "stable" },
    { label: "3", text: "hasty / noisy", blankA: "hasty", blankB: "noisy" },
    { label: "4", text: "hasty / stable", blankA: "hasty", blankB: "stable" },
    { label: "5", text: "random / fixed", blankA: "random", blankB: "fixed" },
  ],
  correctAnswer: "1",
  explanation:
    "Several observations support reliable judgments and reduce dependence on noisy ones.",
};

type AuditCase = {
  id: string;
  family: string;
  expectedFlag: boolean;
  input: { direction: string };
};

type QualityIssue = { code: string };
const blindCases = (
  blindModule as unknown as { cases: AuditCase[] }
).cases;
const targetedCases = (
  targetedModule as unknown as { cases: AuditCase[] }
).cases;

const cases = [...blindCases, ...targetedCases].filter(
  (entry): entry is AuditCase =>
    entry.family === "summary_mc_direction_answer_object",
);
assert.equal(cases.length, 96);

const evaluated = cases.map((entry) => {
  const issues = validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question: { ...summaryBase, direction: entry.input.direction },
    passage: summaryPassage,
    requestedDifficulty: "INTERMEDIATE",
  }) as QualityIssue[];
  const observedFlag = issues.some(
    (issue) => issue.code === "summary-mc-direction-task-mismatch",
  );
  return {
    id: entry.id,
    expectedFlag: entry.expectedFlag,
    observedFlag,
    pass: observedFlag === entry.expectedFlag,
  };
});

const failures = evaluated.filter((entry) => !entry.pass);
const positives = evaluated.filter((entry) => entry.expectedFlag);
const negatives = evaluated.filter((entry) => !entry.expectedFlag);
const sha256 = (relativePath: string) =>
  createHash("sha256")
    .update(readFileSync(path.join(repoRoot, relativePath)))
    .digest("hex");

const result = {
  verdict: failures.length === 0 ? "PASS_POST_FIT_REPLAY_ONLY" : "BLOCK",
  total: evaluated.length,
  pass: evaluated.length - failures.length,
  fail: failures.length,
  falseNegative: positives.filter((entry) => !entry.observedFlag).length,
  falsePositive: negatives.filter((entry) => entry.observedFlag).length,
  failedCaseIds: failures.map((entry) => entry.id),
  sourceSha256: sha256("src/lib/question-quality/validators/summary/mc.ts"),
  testSha256: sha256("tests/unit/summary-mc-direction-split.test.mjs"),
  qualification:
    "This is post-fit replay of frozen v7 evidence, not an independent holdout PASS.",
  safety: { modelApiCalls: 0, networkCalls: 0, databaseCalls: 0 },
};

assert.equal(result.total, 96);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
assert.equal(result.falseNegative, 0);
assert.equal(result.falsePositive, 0);
