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

const passage = [
  "Students remember new information better when they connect new facts to personal experiences.",
  "This connection gives abstract ideas a familiar anchor and makes later recall easier.",
  "By building such anchors, learners turn isolated facts into knowledge they can use."
].join(" ");

const baseQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "connect new facts to personal experiences",
  surroundingText: "remember new information better when they connect new facts to personal experiences. This connection",
  correctAnswer: "1",
  explanation: "The blank must explain why personal connection improves memory.",
  wrongOptionExplanations: {
    "2": "It reverses the relation between new facts and familiar experience.",
    "3": "It mentions abstract ideas but removes the anchor relation.",
    "4": "It borrows later recall but turns the process into guessing.",
    "5": "It refers to anchors but says students ignore them."
  },
  keyPoints: ["memory anchor", "personal connection", "recall"],
  tags: ["blank paraphrase"],
  difficulty: "BASIC",
};

const defaultModeQuestion = {
  ...baseQuestion,
  options: [
    { label: "1", text: "link new facts with their own experiences" },
    { label: "2", text: "separate new facts from familiar moments" },
    { label: "3", text: "repeat abstract ideas without any anchor" },
    { label: "4", text: "replace later recall with quick guessing" },
    { label: "5", text: "ignore the anchors that support memory" }
  ],
};

const exactParaphraseQuestion = {
  ...baseQuestion,
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "정답은 원문의 personal experience 연결 관계를 보존해야 하지만, 이 샘플은 원문을 그대로 복사했다.",
  options: [
    { label: "1", text: "connect new facts to personal experiences" },
    { label: "2", text: "separate new facts from familiar moments" },
    { label: "3", text: "repeat abstract ideas without any anchor" },
    { label: "4", text: "replace later recall with quick guessing" },
    { label: "5", text: "ignore the anchors that support memory" }
  ],
};

const goodParaphraseQuestion = {
  ...baseQuestion,
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "정답은 원문의 connect new facts to personal experiences를 직접 복사하지 않고, 새 정보와 자기 경험을 연결한다는 의미를 쉬운 표현으로 바꾼 것이다.",
  options: [
    { label: "1", text: "link new facts with their own experiences" },
    { label: "2", text: "separate new facts from familiar moments" },
    { label: "3", text: "repeat abstract ideas without any anchor" },
    { label: "4", text: "replace later recall with quick guessing" },
    { label: "5", text: "ignore the anchors that support memory" }
  ],
};

const awkwardParaphraseQuestion = {
  ...baseQuestion,
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is intentionally awkward and should be rejected by the paraphrase naturalness gate.",
  options: [
    { label: "1", text: "sovereignly filtering external cultural influxes" },
    { label: "2", text: "separate new facts from familiar moments" },
    { label: "3", text: "repeat abstract ideas without any anchor" },
    { label: "4", text: "replace later recall with quick guessing" },
    { label: "5", text: "ignore the anchors that support memory" }
  ],
};

const slotPassage = [
  "The key challenge facing humanity is not whether to adopt these technologies but how to do so in ways that serve human flourishing.",
  "Leaders must weigh their benefits against ethical risks before making decisions."
].join(" ");

const slotMismatchQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "The key challenge facing humanity",
  surroundingText: "The key challenge facing humanity is not whether to adopt these technologies",
  correctAnswer: "1",
  explanation: "The blank names the subject of a whether/how contrast.",
  wrongOptionExplanations: {
    "2": "It narrows the issue to stopping technology.",
    "3": "It removes the ethical decision frame.",
    "4": "It overstates speed as the main concern.",
    "5": "It shifts the focus to corporate control."
  },
  keyPoints: ["challenge", "technology adoption", "human flourishing"],
  tags: ["blank paraphrase"],
  difficulty: "BASIC",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "The source names the main challenge, but this answer changes it into a gerund process phrase that does not fit the whether/how subject frame.",
  options: [
    { label: "1", text: "balancing the advantages and drawbacks of technology" },
    { label: "2", text: "stopping every new form of technology" },
    { label: "3", text: "avoiding ethical choices about technology" },
    { label: "4", text: "speeding up all technological innovation" },
    { label: "5", text: "giving companies control over technology" }
  ],
};

const polarityPassage = [
  "Understanding art requires resisting the temptation to reduce it to a single function.",
  "A serious interpretation should preserve the many purposes art can serve in society."
].join(" ");

const polarityLossQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "resisting the temptation to reduce it to a single function",
  surroundingText: "Understanding art requires resisting the temptation to reduce it to a single function.",
  correctAnswer: "1",
  explanation: "The blank must preserve the resistance to reduction.",
  wrongOptionExplanations: {
    "2": "It shifts the focus to entertainment alone.",
    "3": "It ignores the social purpose of art.",
    "4": "It treats art as only decoration.",
    "5": "It makes interpretation irrelevant."
  },
  keyPoints: ["art", "multiple functions", "resistance to reduction"],
  tags: ["blank paraphrase"],
  difficulty: "BASIC",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is intentionally wrong because it drops the resistance relation and turns the source into the opposite action.",
  options: [
    { label: "1", text: "simplifying the multifaceted purposes of art" },
    { label: "2", text: "treating art as simple entertainment" },
    { label: "3", text: "ignoring the public role of art" },
    { label: "4", text: "using art as decorative material" },
    { label: "5", text: "making interpretation unnecessary" }
  ],
};

const trailingFunctionPassage = [
  "Collaborative innovation networks will become increasingly important for future entrepreneurs.",
  "Such networks help people combine ideas and skills across fields."
].join(" ");

const trailingFunctionQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "Collaborative innovation networks will",
  surroundingText: "Collaborative innovation networks will become increasingly important",
  correctAnswer: "1",
  explanation: "The blank target incorrectly includes a dangling modal.",
  wrongOptionExplanations: {
    "2": "It denies the role of networks.",
    "3": "It shifts the claim to individual talent.",
    "4": "It overstates patents.",
    "5": "It removes the future importance."
  },
  keyPoints: ["innovation networks", "future importance"],
  tags: ["blank paraphrase"],
  difficulty: "KILLER",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is intentionally built from a bad target span ending in a modal auxiliary.",
  options: [
    { label: "1", text: "shared innovation networks are likely to" },
    { label: "2", text: "isolated inventors are unlikely to" },
    { label: "3", text: "technical talent alone will always" },
    { label: "4", text: "patent protection systems should" },
    { label: "5", text: "short-term market trends cannot" }
  ],
};

const duplicatedFramePassage = [
  "This theory overlooks the creative ways in which local communities engage with global cultural flows.",
  "These communities adapt outside influences to local meanings."
].join(" ");

const duplicatedFrameQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "local communities engage with global cultural flows",
  surroundingText: "overlooks the creative ways in which local communities engage with global cultural flows.",
  correctAnswer: "1",
  explanation: "The option repeats the left-context frame and should be rejected.",
  wrongOptionExplanations: {
    "2": "It reverses local agency.",
    "3": "It overstates global sameness.",
    "4": "It shifts the focus to regulation.",
    "5": "It ignores local adaptation."
  },
  keyPoints: ["local agency", "global cultural flows"],
  tags: ["blank paraphrase"],
  difficulty: "KILLER",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is intentionally awkward because the sentence already contains ways in which before the blank.",
  options: [
    { label: "1", text: "the active ways in which local groups negotiate global inputs" },
    { label: "2", text: "foreign media replaces local traditions without resistance" },
    { label: "3", text: "global culture erases every regional difference" },
    { label: "4", text: "governments block cultural exchange through strict rules" },
    { label: "5", text: "local audiences consume imported media passively" }
  ],
};

const clauseSlotPassage = [
  "Genuine happiness cannot be attained through wealth alone; it requires the cultivation of moral character and the active use of one's abilities.",
  "This view treats happiness as an activity rather than a passive state."
].join(" ");

const clauseSlotQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "it requires the cultivation of moral character",
  surroundingText: "cannot be attained through wealth alone; it requires the cultivation of moral character and the active use",
  correctAnswer: "1",
  explanation: "The source is a finite clause but the option is only a gerund phrase.",
  wrongOptionExplanations: {
    "2": "It shifts the claim to wealth.",
    "3": "It focuses on pleasure.",
    "4": "It removes moral character.",
    "5": "It makes happiness passive."
  },
  keyPoints: ["happiness", "moral character", "finite clause"],
  tags: ["blank paraphrase"],
  difficulty: "BASIC",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is intentionally wrong because the blank starts after a semicolon and needs a finite clause, not a bare gerund phrase.",
  options: [
    { label: "1", text: "making moral excellence a key priority" },
    { label: "2", text: "wealth provides the main path" },
    { label: "3", text: "seeking pleasure becomes most important" },
    { label: "4", text: "moral growth is unnecessary" },
    { label: "5", text: "happiness happens without effort" }
  ],
};

const stackedPrepositionPassage = [
  "The wolves altered the course of rivers by allowing vegetation to recover along their banks.",
  "The new plant growth stabilized the river edges."
].join(" ");

const stackedPrepositionQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "allowing vegetation to recover along their banks",
  surroundingText: "altered the course of rivers by allowing vegetation to recover along their banks.",
  correctAnswer: "1",
  explanation: "The left context already ends with by, so the option must not start with by.",
  wrongOptionExplanations: {
    "2": "It reverses recovery.",
    "3": "It shifts the cause to dams.",
    "4": "It makes migration the cause.",
    "5": "It removes vegetation."
  },
  keyPoints: ["wolves", "riverbanks", "vegetation recovery"],
  tags: ["blank paraphrase"],
  difficulty: "INTERMEDIATE",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is intentionally awkward because it creates by by when inserted into the blank.",
  options: [
    { label: "1", text: "by helping plants along the banks grow again" },
    { label: "2", text: "preventing riverside vegetation from returning" },
    { label: "3", text: "building artificial barriers near the water" },
    { label: "4", text: "moving animal migration away from valleys" },
    { label: "5", text: "removing plant roots from the banks" }
  ],
};

const defaultProcessed = postProcessQuestion("BLANK_INFERENCE", passage, defaultModeQuestion);
const exactProcessed = postProcessQuestion("BLANK_INFERENCE", passage, exactParaphraseQuestion);
const goodProcessed = postProcessQuestion("BLANK_INFERENCE", passage, goodParaphraseQuestion);
const awkwardProcessed = postProcessQuestion("BLANK_INFERENCE", passage, awkwardParaphraseQuestion);
const slotMismatchProcessed = postProcessQuestion("BLANK_INFERENCE", slotPassage, slotMismatchQuestion);
const polarityLossProcessed = postProcessQuestion("BLANK_INFERENCE", polarityPassage, polarityLossQuestion);
const trailingFunctionProcessed = postProcessQuestion("BLANK_INFERENCE", trailingFunctionPassage, trailingFunctionQuestion);
const duplicatedFrameProcessed = postProcessQuestion("BLANK_INFERENCE", duplicatedFramePassage, duplicatedFrameQuestion);
const clauseSlotProcessed = postProcessQuestion("BLANK_INFERENCE", clauseSlotPassage, clauseSlotQuestion);
const stackedPrepositionProcessed = postProcessQuestion("BLANK_INFERENCE", stackedPrepositionPassage, stackedPrepositionQuestion);

const exactQuality = exactProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: exactProcessed.data,
      passage,
      requestedDifficulty: "BASIC",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const goodQuality = goodProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: goodProcessed.data,
      passage,
      requestedDifficulty: "BASIC",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const awkwardQuality = awkwardProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: awkwardProcessed.data,
      passage,
      requestedDifficulty: "BASIC",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const slotMismatchQuality = slotMismatchProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: slotMismatchProcessed.data,
      passage: slotPassage,
      requestedDifficulty: "BASIC",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const polarityLossQuality = polarityLossProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: polarityLossProcessed.data,
      passage: polarityPassage,
      requestedDifficulty: "BASIC",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const trailingFunctionQuality = trailingFunctionProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: trailingFunctionProcessed.data,
      passage: trailingFunctionPassage,
      requestedDifficulty: "KILLER",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const duplicatedFrameQuality = duplicatedFrameProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: duplicatedFrameProcessed.data,
      passage: duplicatedFramePassage,
      requestedDifficulty: "KILLER",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const clauseSlotQuality = clauseSlotProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: clauseSlotProcessed.data,
      passage: clauseSlotPassage,
      requestedDifficulty: "BASIC",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const stackedPrepositionQuality = stackedPrepositionProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: stackedPrepositionProcessed.data,
      passage: stackedPrepositionPassage,
      requestedDifficulty: "INTERMEDIATE",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

process.stdout.write(JSON.stringify({
  defaultProcessed,
  exactProcessed,
  goodProcessed,
  awkwardProcessed,
  slotMismatchProcessed,
  polarityLossProcessed,
  trailingFunctionProcessed,
  duplicatedFrameProcessed,
  clauseSlotProcessed,
  stackedPrepositionProcessed,
  exactQuality,
  goodQuality,
  awkwardQuality,
  slotMismatchQuality,
  polarityLossQuality,
  trailingFunctionQuality,
  duplicatedFrameQuality,
  clauseSlotQuality,
  stackedPrepositionQuality,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".blank-paraphrase-harness.mts");
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

test("default BLANK_INFERENCE still auto-fixes a non-source correct option", () => {
  assert.equal(result.defaultProcessed.success, true, result.defaultProcessed.error);
  const correct = result.defaultProcessed.data.options.find((option) => option.label === "1");
  assert.equal(correct.text, "connect new facts to personal experiences");
});

test("PARAPHRASE mode rejects a verbatim source correct option", () => {
  assert.equal(result.exactProcessed.success, true, result.exactProcessed.error);
  const codes = new Set(result.exactQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-answer-not-transformed"), true);
});

test("PARAPHRASE mode accepts a balanced difficulty-calibrated paraphrase", () => {
  assert.equal(result.goodProcessed.success, true, result.goodProcessed.error);
  assert.deepEqual(
    result.goodQuality.filter((issue) => issue.severity === "error"),
    [],
  );
});

test("PARAPHRASE mode rejects stilted non-exam paraphrase wording", () => {
  assert.equal(result.awkwardProcessed.success, true, result.awkwardProcessed.error);
  const codes = new Set(result.awkwardQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-awkward-correct-option"), true);
});

test("PARAPHRASE mode rejects gerund process answers in a challenge subject slot", () => {
  assert.equal(result.slotMismatchProcessed.success, true, result.slotMismatchProcessed.error);
  const codes = new Set(result.slotMismatchQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-subject-slot-mismatch"), true);
});

test("PARAPHRASE mode rejects answers that reverse a resistance relation", () => {
  assert.equal(result.polarityLossProcessed.success, true, result.polarityLossProcessed.error);
  const codes = new Set(result.polarityLossQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-polarity-loss"), true);
});

test("PARAPHRASE mode rejects target spans ending with a dangling auxiliary", () => {
  assert.equal(result.trailingFunctionProcessed.success, true, result.trailingFunctionProcessed.error);
  const codes = new Set(result.trailingFunctionQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-target-trailing-function"), true);
});

test("PARAPHRASE mode rejects options that duplicate a left-context frame", () => {
  assert.equal(result.duplicatedFrameProcessed.success, true, result.duplicatedFrameProcessed.error);
  const codes = new Set(result.duplicatedFrameQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-awkward-option"), true);
});

test("PARAPHRASE mode rejects gerund phrases in finite-clause slots", () => {
  assert.equal(result.clauseSlotProcessed.success, true, result.clauseSlotProcessed.error);
  const codes = new Set(result.clauseSlotQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-clause-slot-mismatch"), true);
});

test("PARAPHRASE mode rejects options that stack prepositions with the left context", () => {
  assert.equal(result.stackedPrepositionProcessed.success, true, result.stackedPrepositionProcessed.error);
  const codes = new Set(result.stackedPrepositionQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-awkward-option"), true);
});
