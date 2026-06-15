import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import paperUtils from "@/components/exams/paper-builder/paper-item-utils";
import * as questionBodyLayoutModule from "../src/components/exams/paper-builder/question-body-layout";
import * as parseQuestionSectionsModule from "../src/app/api/exams/[examId]/export-docx/_lib/parse-question-sections";

const { buildGroups, makePaperItem, shouldRenderSourcePassageForItem } = paperUtils;
const questionBodyLayout =
  questionBodyLayoutModule.default ?? questionBodyLayoutModule["module.exports"] ?? questionBodyLayoutModule;
const { isFlowStructuredSubtype, questionStemAndBody, structuredSegments } = questionBodyLayout;
const parseQuestionSectionsApi =
  parseQuestionSectionsModule.default ??
  parseQuestionSectionsModule["module.exports"] ??
  parseQuestionSectionsModule;
const { parseQuestionSections } = parseQuestionSectionsApi;

const passage = [
  "To understand memory, imagine your brain as a vast digital archive.",
  "Accessing this data depends on two primary methods.",
  "Recall is like being asked to write an essay on a blank page.",
  "Recognition is like identifying whether it matches a previous memory.",
  "While recognition provides plenty of context, recall forces the brain to work in a vacuum."
].join(" ");

function question(subType, questionText, structuredData) {
  return {
    id: subType.toLowerCase(),
    type: "MULTIPLE_CHOICE",
    subType,
    questionText,
    structuredData: JSON.stringify(structuredData || {}),
    options: JSON.stringify([
      { label: "①", text: "choice one" },
      { label: "②", text: "choice two" },
      { label: "③", text: "choice three" },
      { label: "④", text: "choice four" },
      { label: "⑤", text: "choice five" }
    ]),
    correctAnswer: "①",
    points: 1,
    passage: { id: "p1", title: "", content: passage, grade: null, semester: null, publisher: null, school: null },
  };
}

const synonymItem = makePaperItem(
  question(
    "SYNONYM",
    [
      "다음 밑줄 친 단어의 의미와 가장 유사한 것은?",
      passage.replace("archive", "__archive__"),
      "[target] archive",
      "[context] To understand memory, imagine your brain as a vast digital archive."
    ].join("\\n\\n"),
    { passageWithUnderline: passage.replace("archive", "__archive__") },
  ),
  1,
  [],
);
const synonymSegments = structuredSegments(synonymItem).map((segment) => ({
  kind: segment.kind,
  style: segment.kind === "box" ? segment.boxStyle : "",
  text: "text" in segment ? segment.text : "",
}));

const wordOrderItem = makePaperItem(
  question("WORD_ORDER", "다음 글을 참고하여 주어진 단어를 바르게 배열하시오.", {}),
  2,
  [],
);

const wordOrderMarkedItem = makePaperItem(
  question(
    "WORD_ORDER",
    [
      "Arrange the words to reflect the meaning of \\uBC11\\uC904 \\uCE5C 'forces the brain to work in a vacuum'.",
      "[word order] information / without / clues / retrieved / is",
      "[hint] The phrase means retrieval happens without contextual support."
    ].join("\\n\\n"),
    {},
  ),
  3,
  [],
);
const wordOrderGroup = buildGroups([wordOrderMarkedItem])[0];
const wordOrderStemBody = questionStemAndBody(wordOrderMarkedItem);
const wordOrderSegments = structuredSegments(wordOrderMarkedItem).map((segment) => ({
  kind: segment.kind,
  style: segment.kind === "box" ? segment.boxStyle : "",
  text: "text" in segment ? segment.text : "",
}));

const summaryCompleteItem = makePaperItem(
  question(
      "SUMMARY_COMPLETE",
      [
        "Summarize the passage in one sentence and fill blanks (A) and (B) with the right words from the passage.",
        "[Summary] Unlike recognition, which is relatively easy due to the presence of external (A) ______, achieving true mastery in learning requires the cognitively demanding ability to (B) ______ information from scratch.",
        "[\\uBE48\\uCE78 \\uC815\\uB2F5] (A) cues, (B) recall"
      ].join("\\n\\n"),
    {
      summaryWithBlanks:
        "Unlike recognition, which is relatively easy due to the presence of external (A) ______, achieving true mastery in learning requires the cognitively demanding ability to (B) ______ information from scratch.",
      blanks: [
        { label: "A", answer: "cues" },
        { label: "B", answer: "recall" }
      ]
    },
  ),
  4,
  [],
);
const summaryCompleteGroup = buildGroups([summaryCompleteItem])[0];
const summaryCompleteStemBody = questionStemAndBody(summaryCompleteItem);
const summaryCompleteSegments = structuredSegments(summaryCompleteItem).map((segment) =>
  segment.kind === "box" ? segment.boxStyle : segment.kind
);

const contentMatchItem = makePaperItem(
  question(
    "CONTENT_MATCH",
    [
      "Which choice is not consistent with the passage?",
      "[type: \\uBD88\\uC77C\\uCE58]",
      "[\\uC720\\uD615: \\uC77C\\uCE58]"
    ].join("\\n\\n"),
    { matchType: "\\uBD88\\uC77C\\uCE58" },
  ),
  5,
  [],
);

const sentenceOrderItem = makePaperItem(
  question(
    "SENTENCE_ORDER",
    [
      "Choose the most logical order after the given sentence.",
      "[given] To understand memory, imagine your brain as a vast digital archive. A This is why multiple-choice questions are easier; you just find the answer among the options. B Recall is like being asked to write an essay on a blank page without hints. C This is why short-answer questions can feel like mental heavy lifting."
    ].join("\\n\\n"),
    {},
  ),
  6,
  [],
);
const sentenceOrderStemBody = questionStemAndBody(sentenceOrderItem);
const sentenceOrderSegments = structuredSegments(sentenceOrderItem).map((segment) => ({
  kind: segment.kind,
  style: segment.kind === "box" ? segment.boxStyle : "",
  label: segment.kind === "para" ? segment.label : "",
  text: "text" in segment ? segment.text : "",
}));
const sentenceOrderSections = parseQuestionSections(
  sentenceOrderItem.questionText,
  sentenceOrderItem.sourceQuestion.subType,
).map((section) => ({
  type: section.type,
  label: section.label || "",
  content: section.content || "",
  items: section.items || [],
}));

const allQuestionTypeIds = [
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "GRAMMAR_CHOICE_COMBO",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE",
  "WORD_ORDER",
  "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
];

const preQuestionPassageResults = allQuestionTypeIds.map((subType, index) => {
  const item = makePaperItem(
    question(
      subType,
      \`Paper order smoke test for \${subType}.\`,
      {},
    ),
    index + 40,
    [],
  );
  const group = buildGroups([item])[0];
  return {
    subType,
    itemIncludePassage: item.includePassage,
    renderSource: shouldRenderSourcePassageForItem(item),
    groupIncludePassage: group.includePassage,
  };
});

const conditionalWritingItem = makePaperItem(
  question(
    "CONDITIONAL_WRITING",
    [
      "Translate the Korean sentence according to the given conditions.",
      "[reference] \\uC774 \\uB370\\uC774\\uD130\\uC5D0 \\uC811\\uADFC\\uD558\\uB294 \\uAC83\\uC740 \\uB450 \\uAC00\\uC9C0 \\uBC29\\uBC95\\uC5D0 \\uB2EC\\uB824 \\uC788\\uB2E4.",
      "[conditions]\\n1. Use the word recall.\\n2. Use the word recognition."
    ].join("\\n\\n"),
    {},
  ),
  70,
  [],
);
const conditionalWritingGroup = buildGroups([conditionalWritingItem])[0];
const conditionalWritingStemBody = questionStemAndBody(conditionalWritingItem);
const conditionalWritingSegments = structuredSegments(conditionalWritingItem).map((segment) => ({
  kind: segment.kind,
  style: segment.kind === "box" ? segment.boxStyle : "",
  text: "text" in segment ? segment.text : "",
}));

const sentenceTransformOriginal = "recall forces the brain to work in a vacuum.";
const sentenceTransformItem = makePaperItem(
  question(
    "SENTENCE_TRANSFORM",
    [
      "Rewrite the underlined part according to the given conditions.",
      "[original] " + sentenceTransformOriginal,
      "[conditions]\\n1. Start with Without.\\n2. Keep the original meaning."
    ].join("\\n\\n"),
    { originalSentence: sentenceTransformOriginal },
  ),
  71,
  [],
);
const sentenceTransformGroup = buildGroups([sentenceTransformItem])[0];
const sentenceTransformStemBody = questionStemAndBody(sentenceTransformItem);
const sentenceTransformSegments = structuredSegments(sentenceTransformItem).map((segment) => ({
  kind: segment.kind,
  style: segment.kind === "box" ? segment.boxStyle : "",
  text: "text" in segment ? segment.text : "",
}));

const metadataLeakResults = allQuestionTypeIds.map((subType, index) => {
  const item = makePaperItem(
    question(
      subType,
      [
        \`Metadata smoke test for \${subType}. [type: mismatch]\`,
        "[type: \\uBD88\\uC77C\\uCE58]",
        "[\\uC720\\uD615: \\uC77C\\uCE58]"
      ].join("\\n\\n"),
      { matchType: "\\uBD88\\uC77C\\uCE58" },
    ),
    index + 10,
    [],
  );
  return {
    subType,
    questionText: item.questionText,
  };
});

process.stdout.write(JSON.stringify({
  synonymIncludePassage: synonymItem.includePassage,
  synonymRenderSource: shouldRenderSourcePassageForItem(synonymItem),
  synonymQuestionText: synonymItem.questionText,
  synonymSegments,
  wordOrderIncludePassage: wordOrderItem.includePassage,
  wordOrderRenderSource: shouldRenderSourcePassageForItem(wordOrderItem),
  wordOrderGroupIncludePassage: wordOrderGroup.includePassage,
  wordOrderGroupPassage: wordOrderGroup.passageContent,
  wordOrderStructured: isFlowStructuredSubtype(wordOrderMarkedItem.sourceQuestion.subType),
  wordOrderStem: wordOrderStemBody.stem,
  wordOrderBody: wordOrderStemBody.body,
  wordOrderSegments,
  summaryCompleteIncludePassage: summaryCompleteItem.includePassage,
  summaryCompleteRenderSource: shouldRenderSourcePassageForItem(summaryCompleteItem),
  summaryCompleteQuestionText: summaryCompleteItem.questionText,
  summaryCompleteGroupIncludePassage: summaryCompleteGroup.includePassage,
  summaryCompleteGroupPassage: summaryCompleteGroup.passageContent,
  summaryCompleteStructured: isFlowStructuredSubtype(summaryCompleteItem.sourceQuestion.subType),
  summaryCompleteStem: summaryCompleteStemBody.stem,
  summaryCompleteBody: summaryCompleteStemBody.body,
  summaryCompleteSegments,
  contentMatchQuestionText: contentMatchItem.questionText,
  sentenceOrderStructured: isFlowStructuredSubtype(sentenceOrderItem.sourceQuestion.subType),
  sentenceOrderStem: sentenceOrderStemBody.stem,
  sentenceOrderBody: sentenceOrderStemBody.body,
  sentenceOrderSegments,
  sentenceOrderSections,
  preQuestionPassageResults,
  conditionalWritingGroupIncludePassage: conditionalWritingGroup.includePassage,
  conditionalWritingStructured: isFlowStructuredSubtype(conditionalWritingItem.sourceQuestion.subType),
  conditionalWritingStem: conditionalWritingStemBody.stem,
  conditionalWritingBody: conditionalWritingStemBody.body,
  conditionalWritingSegments,
  sentenceTransformGroupIncludePassage: sentenceTransformGroup.includePassage,
  sentenceTransformStructured: isFlowStructuredSubtype(sentenceTransformItem.sourceQuestion.subType),
  sentenceTransformStem: sentenceTransformStemBody.stem,
  sentenceTransformBody: sentenceTransformStemBody.body,
  sentenceTransformSegments,
  metadataLeakResults,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".passage-policy-harness.mts");
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

test("embedded underline passage suppresses duplicate source passage", () => {
  assert.equal(result.synonymIncludePassage, false);
  assert.equal(result.synonymRenderSource, false);
  assert.equal(result.synonymQuestionText.includes("[target]"), false);
  assert.equal(result.synonymQuestionText.includes("[context]"), false);
  assert.equal(result.synonymSegments.length, 1);
  assert.equal(result.synonymSegments[0]?.kind, "text");
  assert.match(result.synonymSegments[0]?.text || "", /__archive__/);
  assert.equal(
    result.synonymSegments.filter((segment) => segment.style === "passage").length,
    0,
  );
  assert.equal(result.wordOrderIncludePassage, true);
  assert.equal(result.wordOrderRenderSource, false);
  assert.equal(result.wordOrderGroupIncludePassage, false);
  assert.equal(result.wordOrderStructured, true);
  assert.match(result.wordOrderStem, /^Arrange the words/);
  assert.equal(result.wordOrderBody, "");
  assert.equal(result.wordOrderSegments[0]?.style, "passage");
  assert.match(result.wordOrderSegments[0]?.text || "", /__forces the brain to work in a vacuum__/);
  assert.equal(result.wordOrderSegments[1]?.kind, "text");
  assert.match(result.wordOrderSegments[1]?.text || "", /\[word order\]/i);
});

test("summary completion keeps the original source passage visible", () => {
  assert.equal(result.summaryCompleteIncludePassage, true);
  assert.equal(result.summaryCompleteRenderSource, false);
  assert.doesNotMatch(result.summaryCompleteQuestionText, /\uBE48\uCE78\s*\uC815\uB2F5/);
  assert.doesNotMatch(result.summaryCompleteQuestionText, /cues, \(B\) recall/i);
  assert.equal(result.summaryCompleteGroupIncludePassage, false);
  assert.equal(result.summaryCompleteStructured, true);
  assert.match(result.summaryCompleteStem, /^Summarize the passage/);
  assert.equal(result.summaryCompleteBody, "");
  assert.deepEqual(result.summaryCompleteSegments, ["passage", "summary"]);
});

test("content match type metadata is hidden from paper question text", () => {
  assert.match(result.contentMatchQuestionText, /^Which choice is not consistent/);
  assert.doesNotMatch(result.contentMatchQuestionText, /\[type:/i);
  assert.doesNotMatch(result.contentMatchQuestionText, /\[\uC720\uD615:/);
  assert.doesNotMatch(result.contentMatchQuestionText, /\uBD88\uC77C\uCE58|\uC77C\uCE58/);
});

test("sentence order restores the given sentence and paragraph labels", () => {
  assert.equal(result.sentenceOrderStructured, true);
  assert.match(result.sentenceOrderStem, /^Choose the most logical order/);
  assert.equal(result.sentenceOrderBody, "");
  assert.equal(result.sentenceOrderSegments[0]?.style, "given");
  assert.match(result.sentenceOrderSegments[0]?.text || "", /^To understand memory/);
  assert.doesNotMatch(result.sentenceOrderSegments[0]?.text || "", /\bA This\b/);
  assert.deepEqual(
    result.sentenceOrderSegments.slice(1).map((segment) => segment.label),
    ["(A)", "(B)", "(C)"],
  );
  assert.match(result.sentenceOrderSegments[1]?.text || "", /^This is why/);
  assert.match(result.sentenceOrderSegments[2]?.text || "", /^Recall is like/);
  assert.match(result.sentenceOrderSegments[3]?.text || "", /^This is why short-answer/);
  assert.equal(result.sentenceOrderSections[1]?.type, "marker");
  assert.equal(result.sentenceOrderSections[2]?.type, "paragraphs");
  assert.deepEqual(result.sentenceOrderSections[2]?.items.map((item) => item.slice(0, 3)), [
    "(A)",
    "(B)",
    "(C)",
  ]);
});

test("all question types avoid a separate pre-question source passage group", () => {
  assert.ok(result.preQuestionPassageResults.length > 0);
  for (const item of result.preQuestionPassageResults) {
    assert.equal(
      item.renderSource,
      false,
      `${item.subType} should not render a passage before the question header`,
    );
    assert.equal(
      item.groupIncludePassage,
      false,
      `${item.subType} should not create a separate passage group`,
    );
  }
});

test("conditional writing renders its source passage inside the question body", () => {
  assert.equal(result.conditionalWritingGroupIncludePassage, false);
  assert.equal(result.conditionalWritingStructured, true);
  assert.match(result.conditionalWritingStem, /^Translate the Korean sentence/);
  assert.equal(result.conditionalWritingBody, "");
  assert.equal(result.conditionalWritingSegments[0]?.style, "passage");
  assert.match(result.conditionalWritingSegments[0]?.text || "", /^To understand memory/);
  assert.equal(result.conditionalWritingSegments[1]?.kind, "text");
  assert.match(result.conditionalWritingSegments[1]?.text || "", /\[reference\]/);
  assert.match(result.conditionalWritingSegments[1]?.text || "", /\[conditions\]/);
});

test("sentence transform renders the passage first and underlines the original sentence", () => {
  assert.equal(result.sentenceTransformGroupIncludePassage, false);
  assert.equal(result.sentenceTransformStructured, true);
  assert.match(result.sentenceTransformStem, /^Rewrite the underlined part/);
  assert.equal(result.sentenceTransformBody, "");
  assert.equal(result.sentenceTransformSegments[0]?.style, "passage");
  assert.match(
    result.sentenceTransformSegments[0]?.text || "",
    /__recall forces the brain to work in a vacuum\.__/,
  );
  assert.equal(result.sentenceTransformSegments[1]?.kind, "text");
  assert.match(result.sentenceTransformSegments[1]?.text || "", /\[conditions\]/);
  assert.doesNotMatch(result.sentenceTransformSegments[1]?.text || "", /\[original\]/i);
});

test("all question types hide match type metadata in paper item text", () => {
  assert.ok(result.metadataLeakResults.length > 0);
  for (const item of result.metadataLeakResults) {
    assert.match(item.questionText, new RegExp(`^Metadata smoke test for ${item.subType}\\.`));
    assert.doesNotMatch(item.questionText, /\[type:/i);
    assert.doesNotMatch(item.questionText, /\[match\s*type:/i);
    assert.doesNotMatch(item.questionText, /\[\uC720\uD615:/);
    assert.doesNotMatch(item.questionText, /\bmismatch\b/i);
    assert.doesNotMatch(item.questionText, /\uBD88\uC77C\uCE58|\uC77C\uCE58/);
  }
});
