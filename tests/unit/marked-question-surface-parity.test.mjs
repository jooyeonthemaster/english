import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const tempDir = path.join(repoRoot, ".tmp", "marked-question-surface-parity");
const harnessPath = path.join(tempDir, "harness.ts");

const harness = `
import { normalizePaperFields, normalizeStructuredQuestionForDisplay } from "@/components/exams/paper-builder/render-model";
import { buildAnswerSpec } from "@/lib/exam-scoring/answer-spec";
import { gradeAnswer } from "@/lib/exam-scoring/grade";
import { buildStudentSafeQuestion } from "@/lib/exam-scoring/student-safe";
import { gradeMergedSubmission } from "@/lib/exam-scoring/taking-payload";

const structured = {
  _typeId: "VOCAB_CHOICE",
  direction: "Choose the contextually inappropriate word.",
  options: [
    { label: "1", text: "harsh" },
    { label: "2", text: "prevent" },
    { label: "3", text: "benefits" },
    { label: "4", text: "imbalance" },
    { label: "5", text: "diverse" },
  ],
  correctAnswer: "4",
  markedWords: [
    { label: "(a)", word: "harsh", originalWord: "harsh", substituteWord: "harsh", isInappropriate: false },
    { label: "(b)", word: "prevent", originalWord: "prevent", substituteWord: "prevent", isInappropriate: false },
    { label: "(c)", word: "benefits", originalWord: "benefits", substituteWord: "benefits", isInappropriate: false },
    { label: "(d)", word: "imbalance", originalWord: "stalemate", substituteWord: "imbalance", isInappropriate: true },
    { label: "(e)", word: "diverse", originalWord: "diverse", substituteWord: "diverse", isInappropriate: false },
  ],
  passageWithMarkers:
    "Plants are __(e) diverse__. Compounds are __(a) harsh__. Coats __(b) prevent__ damage. This __(c) benefits__ both sides. Variations maintain the __(d) imbalance__.",
};
const question = {
  id: "surface-q",
  type: "VOCAB",
  subType: "VOCAB_CHOICE",
  questionText: "Choose the contextually inappropriate word.",
  options: JSON.stringify(structured.options),
  correctAnswer: "4",
  structuredData: structured,
  points: 3,
  passage: null,
};

const spec = buildAnswerSpec(question);
const safe = buildStudentSafeQuestion(question);
const workbench = normalizeStructuredQuestionForDisplay(structured) as Record<string, unknown>;
const paper = normalizePaperFields(question as never);

const result = {
  scoringAnswer: "correctChoices" in spec ? spec.correctChoices : null,
  answer5: gradeAnswer(spec, { choice: "5" }).status,
  answer4: gradeAnswer(spec, { choice: "4" }).status,
  safePassage: safe.safeData?.passageWithMarkers,
  safeJson: JSON.stringify(safe),
  workbenchAnswer: workbench.correctAnswer,
  paperAnswer: paper?.correctAnswer,
};

const antonymPassage =
  "Alpha appears first, beta follows, gamma comes later, delta remains, and epsilon closes.";
const antonymStructured = {
  _typeId: "ANTONYM",
  direction: "Choose the incorrectly paired antonym.",
  markedWords: [
    { label: "(A)", word: "gamma", antonym: "third", isIncorrectPair: false },
    { label: "(B)", word: "Alpha", antonym: "same", isIncorrectPair: true },
    { label: "(C)", word: "beta", antonym: "second", isIncorrectPair: false },
    { label: "(D)", word: "delta", antonym: "fourth", isIncorrectPair: false },
    { label: "(E)", word: "epsilon", antonym: "fifth", isIncorrectPair: false },
  ],
  options: [
    { label: "1", text: "(A) gamma - third" },
    { label: "2", text: "(B) Alpha - same" },
    { label: "3", text: "(C) beta - second" },
    { label: "4", text: "(D) delta - fourth" },
    { label: "5", text: "(E) epsilon - fifth" },
  ],
  correctAnswer: "2",
};
const antonymQuestion = {
  id: "antonym-surface-q",
  type: "VOCAB",
  subType: "ANTONYM",
  questionText: "Choose the incorrectly paired antonym.",
  options: JSON.stringify(antonymStructured.options),
  correctAnswer: "2",
  structuredData: antonymStructured,
  sourcePassageContent: antonymPassage,
  points: 3,
  passage: { content: antonymPassage },
};
const antonymSpec = buildAnswerSpec(antonymQuestion);
const antonymSafe = buildStudentSafeQuestion(antonymQuestion);
const antonymWorkbench = normalizeStructuredQuestionForDisplay(
  antonymStructured,
  antonymPassage,
) as Record<string, unknown>;
const antonymPaper = normalizePaperFields(antonymQuestion as never);
const antonymSubmission = gradeMergedSubmission({
  snapshot: [{ questionId: antonymQuestion.id, orderNum: 1, points: 3 }],
  merged: [{ questionId: antonymQuestion.id, orderNum: 1, input: { choice: "1" } }],
  questions: new Map([
    [
      antonymQuestion.id,
      {
        id: antonymQuestion.id,
        type: antonymQuestion.type,
        subType: antonymQuestion.subType,
        options: antonymQuestion.options,
        correctAnswer: antonymQuestion.correctAnswer,
        structuredData: antonymQuestion.structuredData,
        passage: antonymQuestion.passage,
      },
    ],
  ]),
});
const antonymResult = {
  scoringAnswer: "correctChoices" in antonymSpec ? antonymSpec.correctChoices : null,
  answer1: gradeAnswer(antonymSpec, { choice: "1" }).status,
  answer2: gradeAnswer(antonymSpec, { choice: "2" }).status,
  safeOptions: antonymSafe.options,
  safePassage: antonymSafe.safeData?.passageWithMarkers,
  workbenchAnswer: antonymWorkbench.correctAnswer,
  workbenchOptions: antonymWorkbench.options,
  paperAnswer: antonymPaper?.correctAnswer,
  paperOptions: antonymPaper?.options,
  submissionStatus: antonymSubmission.responses[0]?.result?.status,
  submissionScore: antonymSubmission.scoreSummary.totalScore,
};

process.stdout.write(JSON.stringify({ vocab: result, antonym: antonymResult }));
`;

test("marker occurrence order is canonical across workbench, paper, tablet, and scoring", () => {
  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(harnessPath, harness, "utf8");
  try {
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", harnessPath],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const result = JSON.parse(output);
    assert.deepEqual(result.vocab.scoringAnswer, ["5"]);
    assert.equal(result.vocab.answer5, "CORRECT");
    assert.equal(result.vocab.answer4, "WRONG");
    assert.equal(result.vocab.workbenchAnswer, "5");
    assert.equal(result.vocab.paperAnswer, "5");
    assert.match(result.vocab.safePassage, /__\(a\) diverse__/);
    assert.match(result.vocab.safePassage, /__\(e\) imbalance__/);
    assert.ok(!result.vocab.safeJson.includes("isInappropriate"));

    assert.deepEqual(result.antonym.scoringAnswer, ["1"]);
    assert.equal(result.antonym.answer1, "CORRECT");
    assert.equal(result.antonym.answer2, "WRONG");
    assert.equal(result.antonym.workbenchAnswer, "①");
    assert.equal(result.antonym.paperAnswer, "1");
    assert.match(result.antonym.safePassage, /__\(A\) Alpha__/);
    assert.match(result.antonym.safeOptions[0].text, /\(A\) Alpha - same/);
    assert.match(result.antonym.workbenchOptions[0].text, /\(A\) Alpha - same/);
    assert.match(result.antonym.paperOptions[0].text, /\(A\) Alpha - same/);
    assert.equal(result.antonym.submissionStatus, "CORRECT");
    assert.equal(result.antonym.submissionScore, 3);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
