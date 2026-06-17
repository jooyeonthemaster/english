import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// VOCAB_CHOICE 동의어 변형 모드(synonymVariants / vocabDisplayMode=SYNONYM_VARIANT) 계약.
// 정답 외 밑줄 단어도 원문 verbatim이 아니라 문맥상 적절한 동의어로 표시해 "지문 암기"만으로는
// 못 풀게 한다. 위치 탐색은 항상 verbatim originalWord. 기본 모드 동작은 그대로여야 한다.
const harnessSource = `
import pp from "@/lib/question-postprocess";
import quality from "@/lib/question-quality";

const { postProcessQuestion } = pp;
const { validateQuestionQuality } = quality;

const passage = [
  "To understand memory, imagine your brain as a vast digital archive.",
  "Accessing this data depends on two primary methods: Recall and Recognition.",
  "Recall is like being asked to write an essay on a blank page.",
  "You must search your internal hard drive and reconstruct information from scratch without any hints.",
  "This requires significant cognitive effort, which is why short-answer questions or remembering a friend's phone number can feel like mental heavy lifting.",
  "Recognition, on the other hand, is like scrolling through a photo gallery to find a specific image.",
  "The information is already in front of you: you simply need to identify whether it matches a previous memory.",
  "This is why multiple-choice questions are easier-you don't have to create the answer, just find it among the options.",
  "The main distinction is based on the presence of cues.",
  "While recognition provides plenty of context, recall forces the brain to work in a vacuum.",
  "In learning, being able to recognize a word in a textbook is only the first step: true mastery is the ability to recall it when no hints are provided."
].join(" ");

const variantQuestion = {
  _typeId: "VOCAB_CHOICE",
  direction: "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
  vocabDisplayMode: "SYNONYM_VARIANT",
  markedWords: [
    { label: "(a)", originalWord: "reconstruct", substituteWord: "rebuild", isInappropriate: false, surroundingText: "hard drive and reconstruct information from scratch" },
    { label: "(b)", originalWord: "significant", substituteWord: "considerable", isInappropriate: false, surroundingText: "This requires significant cognitive effort" },
    { label: "(c)", originalWord: "easier", substituteWord: "simpler", isInappropriate: false, surroundingText: "multiple-choice questions are easier-you don't have to create" },
    { label: "(d)", originalWord: "presence", substituteWord: "absence", betterWord: "presence", isInappropriate: true, surroundingText: "distinction is based on the presence of cues" },
    { label: "(e)", originalWord: "mastery", substituteWord: "proficiency", isInappropriate: false, surroundingText: "first step: true mastery is the ability" },
  ],
  correctAnswer: "4",
  options: [
    { label: "1", text: "rebuild" },
    { label: "2", text: "considerable" },
    { label: "3", text: "simpler" },
    { label: "4", text: "absence" },
    { label: "5", text: "proficiency" },
  ],
  explanation: "문맥상 단서가 있음을 말해야 하므로 absence는 부적절하다.",
  keyPoints: ["문맥상 단서 존재", "absence는 정반대"],
  tags: ["어휘"],
  difficulty: "INTERMEDIATE",
};

const variantProcessed = postProcessQuestion("VOCAB_CHOICE", passage, variantQuestion);
const variantQuality = variantProcessed.success
  ? validateQuestionQuality({ typeId: "VOCAB_CHOICE", question: variantProcessed.data, passage })
  : [];

// 변형 모드인데 정답 외 단어를 하나도 동의어로 바꾸지 않은 경우 → 경고.
const notAppliedQuestion = {
  ...variantQuestion,
  markedWords: variantQuestion.markedWords.map((w) =>
    w.isInappropriate ? w : { ...w, substituteWord: w.originalWord },
  ),
  options: [
    { label: "1", text: "reconstruct" },
    { label: "2", text: "significant" },
    { label: "3", text: "easier" },
    { label: "4", text: "absence" },
    { label: "5", text: "mastery" },
  ],
};
const notAppliedProcessed = postProcessQuestion("VOCAB_CHOICE", passage, notAppliedQuestion);
const notAppliedQuality = notAppliedProcessed.success
  ? validateQuestionQuality({ typeId: "VOCAB_CHOICE", question: notAppliedProcessed.data, passage })
  : [];

// 누설: 비정답 동의어가 정답의 정답 단어(presence)와 같으면 정답이 노출되므로 에러.
const leakQuestion = {
  ...variantQuestion,
  markedWords: variantQuestion.markedWords.map((w) =>
    w.label === "(a)" ? { ...w, substituteWord: "presence" } : w,
  ),
  options: variantQuestion.options.map((o) =>
    o.label === "1" ? { ...o, text: "presence" } : o,
  ),
};
const leakProcessed = postProcessQuestion("VOCAB_CHOICE", passage, leakQuestion);
const leakQuality = leakProcessed.success
  ? validateQuestionQuality({ typeId: "VOCAB_CHOICE", question: leakProcessed.data, passage })
  : [];

// 기본 모드(vocabDisplayMode 없음)에서는 정답 외 단어의 다른 substituteWord를 여전히 거부해야 한다.
const defaultModeBroken = postProcessQuestion("VOCAB_CHOICE", passage, {
  ...variantQuestion,
  vocabDisplayMode: undefined,
});

process.stdout.write(JSON.stringify({
  variant: {
    ok: variantProcessed.success,
    error: variantProcessed.error,
    passageWithMarkers: variantProcessed.success ? variantProcessed.data.passageWithMarkers : "",
    displayMode: variantProcessed.success ? variantProcessed.data.vocabDisplayMode : null,
    answerWord: variantProcessed.success ? variantProcessed.data.markedWords[3].word : null,
    nonAnswerWord: variantProcessed.success ? variantProcessed.data.markedWords[0].word : null,
    nonAnswerOriginal: variantProcessed.success ? variantProcessed.data.markedWords[0].originalWord : null,
    errors: variantQuality.filter((i) => i.severity === "error").map((i) => i.code),
    warnings: variantQuality.filter((i) => i.severity === "warning").map((i) => i.code),
  },
  notApplied: {
    ok: notAppliedProcessed.success,
    warnings: notAppliedQuality.filter((i) => i.severity === "warning").map((i) => i.code),
  },
  leak: {
    ok: leakProcessed.success,
    errors: leakQuality.filter((i) => i.severity === "error").map((i) => i.code),
  },
  defaultModeBroken: {
    ok: defaultModeBroken.success,
    error: defaultModeBroken.error,
  },
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".vocab-choice-variant-harness.mts");
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

test("VOCAB_CHOICE synonym-variant disguises non-answer words and keeps the answer wrong, no quality errors", () => {
  assert.equal(summary.variant.ok, true, summary.variant.error);
  assert.equal(summary.variant.displayMode, "SYNONYM_VARIANT");
  // 정답(d)은 원문 presence가 아니라 오답 absence를 표시한다.
  assert.equal(summary.variant.answerWord, "absence");
  // 비정답(a)은 원문 reconstruct가 아니라 동의어 rebuild를 표시한다.
  assert.equal(summary.variant.nonAnswerWord, "rebuild");
  assert.equal(summary.variant.nonAnswerOriginal, "reconstruct");
  // 표시 지문에는 원문 단어가 아니라 동의어/오답이 밑줄로 들어간다.
  assert.match(summary.variant.passageWithMarkers, /__\(a\) rebuild__/);
  assert.match(summary.variant.passageWithMarkers, /__\(d\) absence__/);
  assert.doesNotMatch(summary.variant.passageWithMarkers, /__\(a\) reconstruct__/);
  assert.deepEqual(summary.variant.errors, []);
  assert.equal(summary.variant.warnings.includes("vocab-variant-not-applied"), false);
});

test("VOCAB_CHOICE synonym-variant warns when no non-answer word was actually disguised", () => {
  assert.equal(summary.notApplied.ok, true);
  assert.equal(
    summary.notApplied.warnings.includes("vocab-variant-not-applied"),
    true,
  );
});

test("VOCAB_CHOICE synonym-variant flags a non-answer word that exposes the answer's source word", () => {
  assert.equal(summary.leak.ok, true);
  assert.equal(
    summary.leak.errors.includes("vocab-variant-answer-word-exposed"),
    true,
  );
});

test("VOCAB_CHOICE default mode still rejects a different non-answer substituteWord", () => {
  assert.equal(summary.defaultModeBroken.ok, false);
  assert.match(summary.defaultModeBroken.error, /must not have a different substituteWord/);
});
