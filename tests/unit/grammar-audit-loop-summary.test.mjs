import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

test("grammar audit loop summary-only mode ranks repeated defects without DB or LLM calls", () => {
  const tmpDir = path.join(repoRoot, "tmp", "grammar-audit-summary-test");
  mkdirSync(tmpDir, { recursive: true });
  const inputPath = path.join(tmpDir, "sample.jsonl");
  const summaryPath = path.join(tmpDir, "sample.summary.json");
  const rows = [
    {
      runIndex: 1,
      ok: false,
      generated: true,
      generationPlan: "STANDARD",
      difficulty: "KILLER",
      passageId: "p1",
      title: "Thin killer sample",
      localAudit: {
        score: 70,
        issues: [
          {
            severity: "major",
            code: "killer-answer-not-structurally-loaded",
            message: "KILLER answer lacks structural load.",
          },
        ],
      },
      llmJudge: {
        verdict: "fail",
        score: 88,
        fatalIssues: ["answer is debatable"],
        majorIssues: ["distractors are padded"],
      },
      question: {
        markedExpressions: [
          {
            label: "B",
            expression: "which were",
            errorExpression: "which was",
            pointCode: "d",
            isError: true,
          },
        ],
      },
      rejectionSummary: {
        message: "Rejected candidates: 2",
        topCodes: [{ code: "grammar-weak-filler-decoys", count: 3 }],
      },
    },
    {
      runIndex: 2,
      ok: true,
      generated: true,
      generationPlan: "STANDARD",
      difficulty: "BASIC",
      localAudit: { score: 100, issues: [] },
      llmJudge: { verdict: "pass", score: 97, fatalIssues: [], majorIssues: [] },
    },
    {
      runIndex: 3,
      ok: false,
      generated: false,
      generationPlan: "PREMIUM",
      difficulty: "INTERMEDIATE",
      error: "Not Found",
    },
  ];

  try {
    writeFileSync(inputPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
    const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    execFileSync(process.execPath, [tsxCli, "scripts/audit-grammar-quality-loop.ts"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_OPTIONS: "",
        GRAMMAR_LOOP_SUMMARY_ONLY: inputPath,
        GRAMMAR_LOOP_SUMMARY_OUT: summaryPath,
      },
    });

    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    assert.equal(summary.total, 3);
    assert.equal(summary.passed, 1);
    assert.equal(summary.failed, 2);
    assert.equal(summary.byPlanDifficulty["STANDARD:KILLER"].failed, 1);
    assert.equal(summary.byPlanDifficulty["STANDARD:BASIC"].passed, 1);
    assert.ok(
      summary.topIssues.some(
        (issue) => issue.code === "local:killer-answer-not-structurally-loaded" && issue.count === 1,
      ),
      JSON.stringify(summary.topIssues),
    );
    assert.ok(
      summary.topIssues.some((issue) => issue.code === "llmFatal:answer is debatable"),
      JSON.stringify(summary.topIssues),
    );
    assert.ok(
      summary.topIssues.some((issue) => issue.code === "runtime:Not Found"),
      JSON.stringify(summary.topIssues),
    );
    assert.ok(
      summary.topIssues.some(
        (issue) => issue.code === "rejection:grammar-weak-filler-decoys" && issue.count === 3,
      ),
      JSON.stringify(summary.topIssues),
    );
    const thinSample = summary.worstSamples.find((sample) => sample.runIndex === 1);
    assert.deepEqual(thinSample.answerSurfaces, ["B:which were->which was(d)"]);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("grammar audit local judge blocks current weak filler grammar decoys", () => {
  const source = readFileSync(path.join(repoRoot, "scripts", "audit-grammar-quality-loop.ts"), "utf8");
  assert.match(source, /function\s+isWeakGrammarDecoySurface/);
  assert.match(source, /looks\?\\s\+more\\s\+like/);
  assert.match(source, /latter\|former\|uneven/);
  assert.match(source, /as\\s\+it\\s\+might\\s\+appear/);
  assert.match(source, /depends\\s\+on/);
});
