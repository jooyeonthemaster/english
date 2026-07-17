import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import quality from "@/lib/question-quality";

const { analyzeEnglishPassageIntegrity, validateQuestionQuality } = quality;
import generationModule from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts";

const { runQuestionGenerationWithEmptyRetry } = generationModule;
import generationConstants from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts";

const { RELAXED_BLOCKING_QUALITY_CODES, SALVAGE_RELAXABLE_CODES } = generationConstants;

const corruptPassage =
  "Most poems use recurring sounds.Most readers notice the rhythm quickly. " +
  "A repeated line can create a memorable pattern. A repeated line can create a memorable pattern. " +
  "Listeners follow the final beatThe pattern then becomes easier to predict.";

const integrity = analyzeEnglishPassageIntegrity(corruptPassage);

const sentenceInsertIssues = validateQuestionQuality({
  typeId: "SENTENCE_INSERT",
  passage:
    "The first event changed the schedule. The team adjusted its plan. The final result surprised everyone.",
  requestedDifficulty: "INTERMEDIATE",
  question: {
    difficulty: "INTERMEDIATE",
    givenSentence: "The break section became the most anticipated part of a song.",
    passageWithMarkers:
      "The first event changed the schedule. ① The team adjusted its plan. ② The final result surprised everyone. ③ A later report confirmed the change. ④ The group kept the new format. ⑤",
    markerAfterSentenceIndices: [1, 2, 3, 4, 5],
    omittedSourceSentence: "The team adjusted its plan.",
    options: [
      { label: "1", text: "①" },
      { label: "2", text: "②" },
      { label: "3", text: "③" },
      { label: "4", text: "④" },
      { label: "5", text: "⑤" },
    ],
    correctAnswer: "3",
    explanation: "문맥상 세 번째 위치가 적절합니다.",
  },
});

const preflight = await runQuestionGenerationWithEmptyRetry({
  plan: [{ subType: "TOPIC", count: 1, targetPoints: [] }],
  schoolType: "고등학교",
  gradeInfo: "1학년",
  passageContent: corruptPassage,
  teacherIntentBlock: "",
  analysisContext: "",
  diffLabel: "INTERMEDIATE",
  diffInstruction: "",
  generationPlan: "STANDARD",
});

process.stdout.write(JSON.stringify({
  integrity,
  sentenceInsertIssues,
  preflight,
  policy: Object.fromEntries([
    "passage-boundary-spacing-corruption",
    "passage-duplicate-sentence",
    "passage-joined-sentence-token",
    "sentence-insert-neutral-given",
  ].map((code) => [code, {
    relaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(code),
    salvageRelaxable: SALVAGE_RELAXABLE_CODES.has(code),
  }])),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".jul16-passage-insert-regressions.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    // Windows 에서 spawnSync npx ENOENT — tsx CLI 를 node 로 직접 실행한다.
    const raw = execFileSync(
      process.execPath,
      [path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), harnessPath],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "" },
      },
    );
    return JSON.parse(raw);
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

const result = runHarness();
const codeSet = (issues) => new Set(issues.map((issue) => issue.code));

test("corrupt source boundaries, duplicate sentences, and glued sentence starts are detected", () => {
  const codes = codeSet(result.integrity);
  assert.equal(codes.has("passage-boundary-spacing-corruption"), true);
  assert.equal(codes.has("passage-duplicate-sentence"), true);
  assert.equal(codes.has("passage-joined-sentence-token"), true);
});

test("source corruption fails before any model/provider call", () => {
  assert.equal(result.preflight.questions.length, 0);
  assert.equal(result.preflight.attempts, 0);
  assert.equal(result.preflight.usageEvents.length, 0);
  assert.equal(result.preflight.rejectionSummary.topCodes.length >= 3, true);
});

test("neutral insertion sentences are fatal instead of ship-through warnings", () => {
  const issue = result.sentenceInsertIssues.find(
    (candidate) => candidate.code === "sentence-insert-neutral-given",
  );
  assert.equal(issue?.severity, "error");
});

test("new validity codes block relaxed mode and cannot enter salvage", () => {
  for (const [code, policy] of Object.entries(result.policy)) {
    assert.equal(policy.relaxedBlocking, true, `${code} must block relaxed mode`);
    assert.equal(policy.salvageRelaxable, false, `${code} must not be salvageable`);
  }
});
