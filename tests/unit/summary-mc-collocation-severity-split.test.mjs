import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import quality from "@/lib/question-quality";
import generationConstants from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants";

const { validateQuestionQuality, SHIP_FIRST_WARNING_CODES } = quality;
const { RELAXED_BLOCKING_QUALITY_CODES, SALVAGE_RELAXABLE_CODES } = generationConstants;

const passage =
  "Public programs can widen access when their stated goals and implementation choices align. " +
  "Readers must therefore evaluate both the policy promise and the mechanism used to pursue it.";

function collocationIssues(summaryWithBlanks, blankA, blankB) {
  const question = {
    direction: "Complete the summary by choosing the best words for (A) and (B).",
    summaryWithBlanks,
    blanks: [
      { label: "(A)", answer: blankA },
      { label: "(B)", answer: blankB },
    ],
    options: [
      { label: "1", text: blankA + " / " + blankB, blankA, blankB },
      { label: "2", text: blankA + " / delay", blankA, blankB: "delay" },
      { label: "3", text: "scarcity / " + blankB, blankA: "scarcity", blankB },
      { label: "4", text: "scarcity / delay", blankA: "scarcity", blankB: "delay" },
      { label: "5", text: "confusion / retreat", blankA: "confusion", blankB: "retreat" },
    ],
    correctAnswer: "1",
    explanation: "The correct pair preserves the relationship expressed in the passage.",
  };
  return validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question,
    passage,
    requestedDifficulty: "INTERMEDIATE",
  }).filter((issue) =>
    issue.code === "summary-mc-correct-completion-ungrammatical" ||
    issue.code === "summary-mc-awkward-collocation"
  );
}

const code = "summary-mc-correct-completion-ungrammatical";
console.log(JSON.stringify({
  malformed: collocationIssues("The policy promises (A) to (B).", "equity", "learning"),
  grammaticalNestedNounPhrase: collocationIssues("This is a (A) of access to (B).", "question", "learning"),
  grammaticalInfinitive: collocationIssues("The program creates an (A) to (B).", "opportunity", "learn"),
  grammaticalResponsibilityInfinitive: collocationIssues("Leaders accept a (A) to (B).", "responsibility", "improve"),
  springInfinitive: collocationIssues("The program offers an (A) to (B) into action.", "opportunity", "spring"),
  bringInfinitive: collocationIssues("Leaders accept a (A) to (B) evidence forward.", "responsibility", "bring"),
  policy: {
    relaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(code),
    salvageRelaxable: SALVAGE_RELAXABLE_CODES.has(code),
    shipFirstWarning: SHIP_FIRST_WARNING_CODES.has(code),
  },
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".summary-mc-collocation-severity-split-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const raw = execFileSync(process.execPath, [tsxCli, harnessPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

const result = runHarness();

test("a high-confidence malformed correct completion is independently fatal", () => {
  assert.deepEqual(result.malformed.map(({ code, severity }) => ({ code, severity })), [
    { code: "summary-mc-correct-completion-ungrammatical", severity: "error" },
    { code: "summary-mc-awkward-collocation", severity: "warning" },
  ]);
});

test("a grammatical nested noun phrase remains only a broad craft warning", () => {
  assert.deepEqual(
    result.grammaticalNestedNounPhrase.map(({ code, severity }) => ({ code, severity })),
    [{ code: "summary-mc-awkward-collocation", severity: "warning" }],
  );
});

test("valid infinitive complements are not caught by the fatal gerund pattern", () => {
  assert.deepEqual(result.grammaticalInfinitive, []);
  assert.deepEqual(result.grammaticalResponsibilityInfinitive, []);
  assert.equal(
    result.springInfinitive.some(
      ({ code }) => code === "summary-mc-correct-completion-ungrammatical",
    ),
    false,
    JSON.stringify(result.springInfinitive),
  );
  assert.equal(
    result.bringInfinitive.some(
      ({ code }) => code === "summary-mc-correct-completion-ungrammatical",
    ),
    false,
    JSON.stringify(result.bringInfinitive),
  );
});

test("the new fatal code blocks relaxed publication and cannot be salvaged or downgraded", () => {
  assert.deepEqual(result.policy, {
    relaxedBlocking: true,
    salvageRelaxable: false,
    shipFirstWarning: false,
  });
});
