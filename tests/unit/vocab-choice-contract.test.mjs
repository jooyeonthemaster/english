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
import persistence from "@/lib/question-generation-persistence";
import optionDisplay from "@/components/exams/paper-builder/option-display";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import questionRenderers from "../src/components/workbench/question-renderers";

const { postProcessQuestion } = pp;
const { validateQuestionQuality } = quality;
const { buildGeneratedQuestionText } = persistence;
const { formatInlineMarkersForSubtype, shouldRenderOptionListForSubtype } = optionDisplay;
const { StructuredQuestionRenderer } = questionRenderers;

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

const goodQuestion = {
  _typeId: "VOCAB_CHOICE",
  direction: "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
  markedWords: [
    { label: "(a)", originalWord: "reconstruct", isInappropriate: false, surroundingText: "hard drive and reconstruct information from scratch" },
    { label: "(b)", originalWord: "significant", isInappropriate: false, surroundingText: "This requires significant cognitive effort" },
    { label: "(c)", originalWord: "easier", isInappropriate: false, surroundingText: "multiple-choice questions are easier-you don't have to create" },
    { label: "(d)", originalWord: "presence", substituteWord: "absence", betterWord: "presence", isInappropriate: true, surroundingText: "distinction is based on the presence of cues" },
    { label: "(e)", originalWord: "mastery", isInappropriate: false, surroundingText: "first step: true mastery is the ability" },
  ],
  correctAnswer: "4",
  options: [
    { label: "1", text: "reconstruct" },
    { label: "2", text: "significant" },
    { label: "3", text: "easier" },
    { label: "4", text: "absence" },
    { label: "5", text: "mastery" },
  ],
  explanation: "문맥상 단서가 있음을 말해야 하므로 absence가 아니라 presence가 적절하다.",
  keyPoints: ["원문 단어는 presence", "표시 오답은 absence", "recognition은 cues를 제공한다"],
  tags: ["어휘"],
  difficulty: "INTERMEDIATE",
};

const processed = postProcessQuestion("VOCAB_CHOICE", passage, goodQuestion);
const processedQuality = processed.success
  ? validateQuestionQuality({ typeId: "VOCAB_CHOICE", question: processed.data, passage })
  : [];
const questionText = processed.success ? buildGeneratedQuestionText(processed.data) : "";
const formattedPaperPassage = processed.success
  ? formatInlineMarkersForSubtype(processed.data.passageWithMarkers, "VOCAB_CHOICE")
  : "";
const rendersPaperOptionList = shouldRenderOptionListForSubtype("VOCAB_CHOICE");

const missingSubstitute = postProcessQuestion("VOCAB_CHOICE", passage, {
  ...goodQuestion,
  markedWords: goodQuestion.markedWords.map((word) =>
    word.label === "(d)"
      ? { label: "(d)", originalWord: "presence", betterWord: "presence", isInappropriate: true, surroundingText: "distinction is based on the presence of cues" }
      : word
  ),
});

const brokenQuality = processed.success
  ? validateQuestionQuality({
      typeId: "VOCAB_CHOICE",
      question: {
        ...processed.data,
        correctAnswer: "(a)",
        passageWithMarkers: processed.data.passageWithMarkers.replace("__(d) absence__", "presence"),
      },
      passage,
    })
  : [];

const brokenSavedQuestion = processed.success
  ? {
      ...processed.data,
      passageWithMarkers: processed.data.passageWithMarkers.replace("__(d) absence__", "presence"),
      markedWords: processed.data.markedWords.map((word) =>
        word.label === "(d)"
          ? { label: "(d)", word: "presence", isInappropriate: true, betterWord: "absence" }
          : {
              label: word.label,
              word: word.word,
              isInappropriate: false,
            }
      ),
      options: processed.data.options.map((option) =>
        option.label === "(d)" ? { ...option, text: "presence" } : option
      ),
      correctAnswer: "(d)",
    }
  : null;
const repairedBrokenSavedHtml = brokenSavedQuestion
  ? renderToStaticMarkup(
      React.createElement(StructuredQuestionRenderer, {
        question: brokenSavedQuestion,
        index: 0,
        hideHeader: true,
        sourcePassageContent: passage,
      }),
    )
  : "";

process.stdout.write(JSON.stringify({
  processed,
  processedQuality,
  questionText,
  formattedPaperPassage,
  rendersPaperOptionList,
  missingSubstitute,
  brokenQuality,
  repairedBrokenSavedHtml,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".vocab-choice-contract-harness.mts");
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

test("VOCAB_CHOICE renders the substitute as the underlined answer and preserves the source correction", () => {
  assert.equal(summary.processed.success, true, summary.processed.error);
  assert.match(summary.processed.data.passageWithMarkers, /__\(d\) absence__/);
  assert.doesNotMatch(summary.processed.data.passageWithMarkers, /__\(d\) presence__/);
  assert.equal(summary.processed.data.correctAnswer, "(d)");
  assert.equal(summary.processed.data.options[3].label, "(d)");
  assert.equal(summary.processed.data.markedWords[3].word, "absence");
  assert.equal(summary.processed.data.markedWords[3].originalWord, "presence");
  assert.equal(summary.processed.data.markedWords[3].substituteWord, "absence");
  assert.equal(summary.processed.data.markedWords[3].betterWord, "presence");
  assert.match(summary.questionText, /__\(d\) absence__/);
  assert.match(summary.formattedPaperPassage, /__④ absence__/);
  assert.doesNotMatch(summary.formattedPaperPassage, /__\(d\) absence__/);
  assert.equal(summary.rendersPaperOptionList, false);
  assert.deepEqual(
    summary.processedQuality.filter((issue) => issue.severity === "error"),
    [],
  );
});

test("VOCAB_CHOICE rejects missing substitute words and broken render/answer contracts", () => {
  assert.equal(summary.missingSubstitute.success, false);
  assert.match(summary.missingSubstitute.error, /Missing substituteWord/);
  const codes = new Set(summary.brokenQuality.map((issue) => issue.code));
  assert.equal(codes.has("vocab-render-marker-count"), true);
  assert.equal(codes.has("vocab-answer-label-mismatch"), true);
});

test("VOCAB_CHOICE renderer repairs legacy saved data with a missing answer underline", () => {
  assert.match(summary.repairedBrokenSavedHtml, /④/);
  assert.doesNotMatch(summary.repairedBrokenSavedHtml, /\(d\)/);
  assert.match(summary.repairedBrokenSavedHtml, /underline[^>]*>④ presence</);
});
