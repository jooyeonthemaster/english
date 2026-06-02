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
import paperUtils from "@/components/exams/paper-builder/paper-item-utils";
import pagination from "@/components/exams/paper-builder/pagination";
import optionDisplay from "@/components/exams/paper-builder/option-display";
import sentenceInsert from "../src/lib/sentence-insert-options.ts";
import hwpxFragment from "../src/app/api/exams/[examId]/export-hwpx/_lib/render/fragment.ts";

const { postProcessQuestion } = pp;
const { validateQuestionQuality } = quality;
const { buildGroups, makePaperItem } = paperUtils;
const { paginateGroups } = pagination;
const { optionDisplayTextForSubtype } = optionDisplay;
const { renderQuestionPart } = hwpxFragment;
const {
  buildCanonicalSentenceInsertOptions,
  isSameObjectiveAnswerForSubtype,
  normalizeSentenceInsertAnswer,
} = sentenceInsert;

const passage = [
  "Education, at its best, teaches more than just knowledge.",
  "It teaches critical thinking: the ability to stop and think before acting.",
  "This is not thought control.",
  "It is the very reverse: mental liberation.",
  "Even the most advanced intellectual will be imperfect at this skill.",
  "But even imperfect possession of it frees a person from the burden of being stimulus-driven."
].join(" ");

const badAi = {
  direction: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오.",
  givenSentence: "Yet, this imperfect mastery still frees a person from the burden of being 'stimulus-driven'.",
  markerAfterSentenceIndices: [0, 1, 2, 3, 4],
  options: [
    { label: "1", text: "①" },
    { label: "2", text: "②" },
    { label: "3", text: "text" },
    { label: "4", text: "④" },
    { label: "5", text: "⑤" }
  ],
  correctAnswer: "3",
  explanation: "주어진 문장의 Yet이 앞문장과 대조되고, stimulus-driven 표현이 뒤에서 이어진다.",
  keyPoints: ["대조 연결어", "stimulus-driven 반복", "앞뒤 문맥 연결"],
  tags: ["문장 삽입"],
  difficulty: "INTERMEDIATE"
};

const processed = postProcessQuestion("SENTENCE_INSERT", passage, badAi);
const processedWithoutPassage = postProcessQuestion("SENTENCE_INSERT", "", {
  ...badAi,
  passageWithMarkers: "Education matters. ① Critical thinking helps. ② Liberation follows. ③ Pressure continues. ④ Choices remain. ⑤",
});
const processedOptions = processed.data.options;
const passThroughOptions = processedWithoutPassage.data.options;
const displayTexts = processedOptions.map((option, index) =>
  optionDisplayTextForSubtype("SENTENCE_INSERT", index, option.text)
);
const displayTextFromBadStoredOption = optionDisplayTextForSubtype("SENTENCE_INSERT", 2, "text");
const canonicalOptions = buildCanonicalSentenceInsertOptions();
const paperItem = makePaperItem({
  id: "si1",
  type: "MULTIPLE_CHOICE",
  subType: "SENTENCE_INSERT",
  questionText: processed.data.passageWithMarkers,
  structuredData: processed.data,
  options: JSON.stringify(processedOptions),
  correctAnswer: processed.data.correctAnswer,
  points: 1,
  passage: { id: "p1", title: "", content: passage, grade: null, semester: null, publisher: null, school: null },
}, 1, []);
const rawBadPaperItem = makePaperItem({
  id: "si2",
  type: "MULTIPLE_CHOICE",
  subType: "SENTENCE_INSERT",
  questionText: processed.data.passageWithMarkers,
  structuredData: badAi,
  options: JSON.stringify(badAi.options),
  correctAnswer: "3",
  points: 1,
  passage: { id: "p1", title: "", content: passage, grade: null, semester: null, publisher: null, school: null },
}, 2, []);
const previewQuestionText = [
  "Choose the best place to insert the given sentence.",
  "",
  "[given]",
  "If so, these ultimate motivators must stem not from direct rational calculation, but from something deeper that lies beyond it.",
  "",
  "A common but incorrect assumption is that we are creatures of reason when, in fact, we are creatures of both reason and emotion. \\u2460 We cannot get by on reason alone since any reason always eventually leads to a feeling. \\u2461 Should I get a wholegrain cereal or a chocolate cereal? \\u2462 I can list all the reasons I want, but the reasons have to be based on something. \\u2463 For example, if my goal is to eat healthy, I can choose the wholegrain cereal, but what is my reason for wanting to be healthy? \\u2464"
].join("\\n");
const previewItem = makePaperItem({
  id: "si-preview",
  type: "MULTIPLE_CHOICE",
  subType: "SENTENCE_INSERT",
  questionText: previewQuestionText,
  structuredData: {
    ...processed.data,
    givenSentence: "If so, these ultimate motivators must stem not from direct rational calculation, but from something deeper that lies beyond it.",
  },
  options: JSON.stringify(badAi.options),
  correctAnswer: "3",
  points: 1,
  passage: { id: "p1", title: "", content: passage, grade: null, semester: null, publisher: null, school: null },
}, 3, []);
const previewPages = paginateGroups(buildGroups([previewItem]), {
  paperSize: "A4",
  columns: 2,
  density: "comfortable",
  passageStyle: "boxed",
  showAnswerSpace: true,
  showPassageTitle: false,
  showQuestionMeta: false,
  template: "clean",
}).pages;
const previewParts = previewPages.flatMap((page) =>
  page.flatMap((column) =>
    column.flatMap((fragment) =>
      fragment.parts.filter((part) => part.source.questionId === "si-preview"),
    ),
  ),
);
const previewStructStyles = previewParts.flatMap((part) =>
  part.structRows.map((row) => row.style),
);
const previewRenderedQuestionLines = previewParts.flatMap(
  (part) => part.questionRenderedLines,
);
const previewFirstStructPart = previewParts.find((part) => part.structRows.length > 0);
const hwpxBlocks = previewFirstStructPart
  ? renderQuestionPart(previewFirstStructPart, {
      passageStyle: "boxed",
      showPassageTitle: false,
      showQuestionMeta: false,
      showAnswerSpace: true,
      compact: false,
      template: "clean",
      columnWidthHpu: 10000,
    })
  : [];
function collectHwpxText(nodes) {
  const chunks = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.text === "string") chunks.push(value.text);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(nodes);
  return chunks.join(" ");
}
const hwpxQuestionPartText = collectHwpxText(hwpxBlocks);
const normalizedAnswers = [
  normalizeSentenceInsertAnswer("3"),
  normalizeSentenceInsertAnswer("③"),
  normalizeSentenceInsertAnswer("(C)"),
];
const answerComparisons = [
  isSameObjectiveAnswerForSubtype("SENTENCE_INSERT", "3", "3"),
  isSameObjectiveAnswerForSubtype("SENTENCE_INSERT", "③", "3"),
  isSameObjectiveAnswerForSubtype("SENTENCE_INSERT", "(C)", "3"),
  isSameObjectiveAnswerForSubtype("SENTENCE_INSERT", "text", "3"),
];
const rawQuality = validateQuestionQuality({
  typeId: "SENTENCE_INSERT",
  question: badAi,
  passage,
});
const processedQuality = validateQuestionQuality({
  typeId: "SENTENCE_INSERT",
  question: processed.data,
  passage,
});

process.stdout.write(JSON.stringify({
  processed,
  processedWithoutPassage,
  processedOptions,
  passThroughOptions,
  displayTexts,
  displayTextFromBadStoredOption,
  canonicalOptions,
  paperOptions: paperItem.options,
  rawBadPaperOptions: rawBadPaperItem.options,
  previewStructStyles,
  previewRenderedQuestionLines,
  hwpxQuestionPartText,
  normalizedAnswers,
  answerComparisons,
  rawQuality,
  processedQuality,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".sentence-insert-options-harness.mts");
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

test("SENTENCE_INSERT ignores AI option text and renders canonical gap labels", () => {
  assert.equal(result.processed.success, true);
  assert.ok(
    result.processed.warnings.some((warning) => warning.includes("Ignored AI-provided")),
    JSON.stringify(result.processed.warnings),
  );
  assert.equal(result.processedOptions.length, 5);
  assert.equal(result.processedOptions[2].text, "③");
  assert.equal(result.passThroughOptions[2].text, "③");
  assert.deepEqual(result.displayTexts, ["(A)", "(B)", "(C)", "(D)", "(E)"]);
  assert.equal(result.displayTextFromBadStoredOption, "(C)");
  assert.equal(result.canonicalOptions[2].text, "③");
  assert.equal(result.paperOptions[2].text, "③");
  assert.equal(result.rawBadPaperOptions[2].text, "③");
  assert.notEqual(result.paperOptions[2].text, "text");
  assert.notEqual(result.rawBadPaperOptions[2].text, "text");
  assert.deepEqual(result.normalizedAnswers, ["3", "3", "3"]);
  assert.deepEqual(result.answerComparisons, [true, true, true, false]);
  assert.equal(result.previewStructStyles[0], "given");
  assert.ok(result.previewStructStyles.includes("text"));
  assert.deepEqual(result.previewRenderedQuestionLines, []);
  assert.ok(result.hwpxQuestionPartText.includes("주어진 문장"));
  assert.ok(result.hwpxQuestionPartText.includes("If so, these ultimate motivators"));
  assert.ok(result.hwpxQuestionPartText.includes("A common but incorrect assumption"));
  assert.equal(result.hwpxQuestionPartText.includes("[given]"), false);
});

test("SENTENCE_INSERT quality rejects non-marker option text", () => {
  assert.ok(
    result.rawQuality.some(
      (issue) => issue.severity === "error" && issue.code === "sentence-insert-option-marker",
    ),
    JSON.stringify(result.rawQuality),
  );
  assert.deepEqual(
    result.processedQuality.filter((issue) => issue.severity === "error"),
    [],
  );
});
