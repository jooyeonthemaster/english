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
const { buildQuestionTargetCandidateBlock, validateQuestionQuality } = quality;

const cleanPassage =
  "Officials accepted the proposal, expanded the program, strengthened the rule, increased the budget, and protected workers during the crisis.";

const cleanQuestion = {
  _typeId: "ANTONYM",
  direction: "지문의 밑줄 친 단어와 짝 단어의 반의어 관계가 바르지 않은 것은?",
  markedWords: [
    { label: "(A)", word: "accepted", antonym: "rejected", isIncorrectPair: false, surroundingText: "Officials accepted the proposal" },
    { label: "(B)", word: "expanded", antonym: "contracted", isIncorrectPair: false, surroundingText: "expanded the program" },
    { label: "(C)", word: "strengthened", antonym: "weakened", isIncorrectPair: false, surroundingText: "strengthened the rule" },
    { label: "(D)", word: "increased", antonym: "raised", isIncorrectPair: true, correctAntonym: "decreased", surroundingText: "increased the budget" },
    { label: "(E)", word: "protected", antonym: "exposed", isIncorrectPair: false, surroundingText: "protected workers" },
  ],
  options: [
    { label: "1", text: "(A) accepted - rejected" },
    { label: "2", text: "(B) expanded - contracted" },
    { label: "3", text: "(C) strengthened - weakened" },
    { label: "4", text: "(D) increased - raised" },
    { label: "5", text: "(E) protected - exposed" },
  ],
  correctAnswer: "4",
  explanation: "increased의 반의어는 decreased이며 raised는 유의어에 가깝다.",
  wrongOptionExplanations: {
    "1": "accepted-rejected는 수락/거절의 정확한 대립이다.",
    "2": "expanded-contracted는 확장/축소의 정확한 대립이다.",
    "3": "strengthened-weakened는 강화/약화의 정확한 대립이다.",
    "5": "protected-exposed는 보호/노출의 정확한 대립이다."
  },
  keyPoints: ["정확히 한 쌍만 오답", "품사와 형태 일치", "문맥 의미축 확인"],
  tags: ["반의어"],
  difficulty: "INTERMEDIATE",
};

const cleanProcessed = postProcessQuestion("ANTONYM", cleanPassage, cleanQuestion);
const cleanQuality = cleanProcessed.success
  ? validateQuestionQuality({ typeId: "ANTONYM", question: cleanProcessed.data, passage: cleanPassage })
  : [];

const memoryPassage =
  "Recall requires you to reconstruct information from scratch. This requires significant cognitive effort. Multiple-choice questions are easier because cues are present. Recall forces the brain to work in a vacuum. In learning, true mastery is the ability to recall without hints.";

const shakyQuestion = {
  _typeId: "ANTONYM",
  direction: "지문의 밑줄 친 단어와 짝 단어의 반의어 관계가 바르지 않은 것은?",
  markedWords: [
    { label: "(A)", word: "reconstruct", antonym: "deconstruct", isIncorrectPair: false, surroundingText: "reconstruct information from scratch" },
    { label: "(B)", word: "significant", antonym: "insignificant", isIncorrectPair: false, surroundingText: "significant cognitive effort" },
    { label: "(C)", word: "easier", antonym: "harder", isIncorrectPair: false, surroundingText: "questions are easier because" },
    { label: "(D)", word: "forces", antonym: "restrain", isIncorrectPair: true, correctAntonym: "allows", surroundingText: "Recall forces the brain to work" },
    { label: "(E)", word: "mastery", antonym: "ignorance", isIncorrectPair: false, surroundingText: "true mastery is the ability" },
  ],
  options: [
    { label: "1", text: "(A) reconstruct - deconstruct" },
    { label: "2", text: "(B) significant - insignificant" },
    { label: "3", text: "(C) easier - harder" },
    { label: "4", text: "(D) forces - restrain" },
    { label: "5", text: "(E) mastery - ignorance" },
  ],
  correctAnswer: "4",
  explanation: "forces는 allows가 더 정확한 반의어다.",
  wrongOptionExplanations: {
    "1": "reconstruct-deconstruct는 구성/해체의 대립이다.",
    "2": "significant-insignificant는 중요/비중요의 대립이다.",
    "3": "easier-harder는 쉬움/어려움의 대립이다.",
    "5": "mastery-ignorance를 정답이 아닌 쌍처럼 둔 의도적 결함 샘플이다."
  },
  keyPoints: ["shaky sample"],
  tags: ["반의어"],
  difficulty: "INTERMEDIATE",
};

const shakyProcessed = postProcessQuestion("ANTONYM", memoryPassage, shakyQuestion);
const shakyQuality = shakyProcessed.success
  ? validateQuestionQuality({ typeId: "ANTONYM", question: shakyProcessed.data, passage: memoryPassage })
  : [];

const missingFlag = postProcessQuestion("ANTONYM", cleanPassage, {
  ...cleanQuestion,
  markedWords: cleanQuestion.markedWords.map(({ isIncorrectPair, correctAntonym, ...rest }) => rest),
});

const sunkCostPassage =
  "Few mistakes in reasoning are as common as the tendency to throw good money after bad. Economists call it the sunk cost fallacy: the belief that past investments justify future commitments, even when the future looks dim. People stay in unproductive relationships and persist in failing careers because turning back would feel like an admission of defeat. Rational decision-making asks what is still to gain. The hardest lesson in economics may also be the hardest lesson in life.";
const candidateBlock = buildQuestionTargetCandidateBlock("ANTONYM", sunkCostPassage, {
  requestedDifficulty: "KILLER",
});

process.stdout.write(JSON.stringify({
  cleanProcessed,
  cleanQuality,
  shakyProcessed,
  shakyQuality,
  missingFlag,
  candidateBlock,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".antonym-contract-harness.mts");
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

const summary = runHarness();

test("ANTONYM accepts a single clearly wrong pair and renders all five markers", () => {
  assert.equal(summary.cleanProcessed.success, true, summary.cleanProcessed.error);
  assert.match(summary.cleanProcessed.data.passageWithMarkers, /__\(D\) increased__/);
  assert.equal(summary.cleanProcessed.data.correctAnswer, "4");
  assert.equal(summary.cleanProcessed.data.markedWords[3].isIncorrectPair, true);
  assert.equal(summary.cleanProcessed.data.markedWords[3].correctAntonym, "decreased");
  assert.deepEqual(
    summary.cleanQuality.filter((issue) => issue.severity === "error"),
    [],
  );
});

test("ANTONYM rejects missing incorrect-pair flags", () => {
  assert.equal(summary.missingFlag.success, false);
  assert.match(summary.missingFlag.error, /isIncorrectPair=true/);
});

test("ANTONYM catches shaky pairs such as forces-restrain and mastery-ignorance", () => {
  assert.equal(summary.shakyProcessed.success, true, summary.shakyProcessed.error);
  const codes = new Set(summary.shakyQuality.map((issue) => issue.code));
  assert.equal(codes.has("antonym-surface-form-mismatch"), true);
  assert.equal(codes.has("antonym-contestable-pair"), true);
  const messages = summary.shakyQuality.map((issue) => issue.message).join("\\n");
  assert.match(messages, /force.*restrain|restrain.*force/i);
  assert.match(messages, /mastery.*ignorance|ignorance.*mastery/i);
});

test("ANTONYM prompt provides safe source-backed pairs before generation", () => {
  assert.match(summary.candidateBlock, /sourceWord="unproductive".*correctAntonym="productive"/);
  assert.match(summary.candidateBlock, /sourceWord="dim".*correctAntonym="bright"/);
  assert.match(summary.candidateBlock, /suggestedWrongPair="dark"/);
  assert.match(summary.candidateBlock, /forbiddenPairs="passive, uninterested"/);
  assert.match(summary.candidateBlock, /force-restrain/);
  assert.match(summary.candidateBlock, /unproductive-passive/);
});
