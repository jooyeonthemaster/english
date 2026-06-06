import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import pp from "@/lib/question-postprocess";
import quality from "@/lib/question-quality";

const { postProcessQuestion } = pp;
const { validateQuestionQuality } = quality;

const insertPassage = [
  "Education, at its best, teaches more than just knowledge.",
  "It teaches critical thinking: the ability to stop and think before acting, to avoid succumbing to emotional pressures.",
  "This is not thought control.",
  "It is the very reverse: mental liberation.",
  "Even the most advanced intellectual will be imperfect at this skill.",
  "But even imperfect possession of it frees a person from the burden of being 'stimulus-driven', constantly reacting to the immediate environment, the brightest colors or loudest sounds.",
  "Being driven by heuristic responses, living by instinct and emotion all the time, is a very easy way to live.",
  "But emotions are also exhausting."
].join(" ");

const leakingSentenceInsert = {
  direction: "Choose the best place to insert the given sentence.",
  givenSentence: "Nonetheless, even imperfect possession of this skill frees a person from the burden of being 'stimulus-driven'.",
  markerAfterSentenceIndices: [1, 3, 4, 5, 6],
  options: [
    { label: "1", text: "①" },
    { label: "2", text: "②" },
    { label: "3", text: "③" },
    { label: "4", text: "④" },
    { label: "5", text: "⑤" }
  ],
  correctAnswer: "3",
  explanation: "The given sentence follows the imperfect-skill sentence.",
  wrongOptionExplanations: {
    "1": "No imperfect-skill antecedent is available.",
    "2": "The liberation statement is not yet introduced.",
    "4": "The source sentence has already made the same claim.",
    "5": "The instinct/emotion section has already begun."
  },
  keyPoints: ["source omission", "cohesion", "answer leak"],
  tags: ["sentence insertion"],
  difficulty: "INTERMEDIATE",
};

const repairedSentenceInsert = {
  ...leakingSentenceInsert,
  sourceSentenceToOmit: "But even imperfect possession of it frees a person from the burden of being 'stimulus-driven', constantly reacting to the immediate environment, the brightest colors or loudest sounds.",
};

const rawLeakingQuality = validateQuestionQuality({
  typeId: "SENTENCE_INSERT",
  question: {
    ...leakingSentenceInsert,
    passageWithMarkers: "Education, at its best, teaches more than just knowledge. ① It teaches critical thinking: the ability to stop and think before acting, to avoid succumbing to emotional pressures. This is not thought control. ② It is the very reverse: mental liberation. Even the most advanced intellectual will be imperfect at this skill. ③ But even imperfect possession of it frees a person from the burden of being 'stimulus-driven', constantly reacting to the immediate environment, the brightest colors or loudest sounds. ④ Being driven by heuristic responses, living by instinct and emotion all the time, is a very easy way to live. ⑤ But emotions are also exhausting.",
  },
  passage: insertPassage,
});

const processedInsert = postProcessQuestion("SENTENCE_INSERT", insertPassage, repairedSentenceInsert);
const processedInsertQuality = processedInsert.success
  ? validateQuestionQuality({ typeId: "SENTENCE_INSERT", question: processedInsert.data, passage: insertPassage })
  : [];

const blankPassage = "No meaningful decision can be made without considering future consequences. Careful reasoning helps people avoid short-term impulses.";
const negativeBlankQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "can be made without considering future consequences",
  passageWithBlank: "No meaningful decision _____ . Careful reasoning helps people avoid short-term impulses.",
  options: [
    { label: "1", text: "does not require considering future consequences" },
    { label: "2", text: "can be made through impulse alone" },
    { label: "3", text: "ignores all future consequences" },
    { label: "4", text: "does not emerge from careful thought" },
    { label: "5", text: "cannot be separated from future consequences" }
  ],
  correctAnswer: "1",
  explanation: "This sample intentionally creates no-subject double negation.",
  wrongOptionExplanations: {
    "2": "It changes the logic.",
    "3": "It exaggerates the claim.",
    "4": "It changes the target.",
    "5": "It is not the selected sample."
  },
  keyPoints: ["negative paraphrase", "double negation", "slot"],
  tags: ["negative paraphrase"],
  difficulty: "INTERMEDIATE",
  blankAnswerMode: "DOUBLE_NEGATIVE",
  answerLogic: "No meaningful decision does not require... creates a double-negative logic problem.",
};

const negativeBlankQuality = validateQuestionQuality({
  typeId: "BLANK_INFERENCE",
  question: negativeBlankQuestion,
  passage: blankPassage,
});

process.stdout.write(JSON.stringify({
  rawLeakingQuality,
  processedInsert,
  processedInsertQuality,
  negativeBlankQuality,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".sentence-insert-negative-blank-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const result = runHarness();

test("SENTENCE_INSERT rejects visible near-duplicate given/source sentence leaks", () => {
  const codes = new Set(result.rawLeakingQuality.map((issue) => issue.code));
  assert.equal(codes.has("sentence-insert-given-leaks-in-passage"), true);
});

test("SENTENCE_INSERT removes sourceSentenceToOmit from displayed passage", () => {
  assert.equal(result.processedInsert.success, true, result.processedInsert.error);
  assert.equal(
    result.processedInsert.data.passageWithMarkers.includes("But even imperfect possession of it frees"),
    false,
  );
  assert.equal(result.processedInsert.data.omittedSourceSentenceIndex, 5);
  assert.deepEqual(
    result.processedInsertQuality.filter((issue) => issue.severity === "error"),
    [],
  );
});

test("DOUBLE_NEGATIVE rejects no-subject plus negative predicate", () => {
  const codes = new Set(result.negativeBlankQuality.map((issue) => issue.code));
  assert.equal(codes.has("negative-paraphrase-no-subject-double-negation"), true);
});
