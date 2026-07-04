import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import gcDisplay from "@/lib/grammar-correction-display";
import persistence from "@/lib/question-generation-persistence";
import pp from "@/lib/question-postprocess";
import quality from "@/lib/question-quality";
import paperUtils from "@/components/exams/paper-builder/paper-item-utils";
import primitives from "@/components/workbench/question-renderer-primitives";
import * as typeSettings from "@/lib/question-type-generation-settings";

const {
  buildGrammarCorrectionAnswerSlots,
  formatGrammarCorrectionCorrectAnswer,
  repairGrammarCorrectionQuestionText,
  markGrammarCorrectionErrorPart,
} = gcDisplay;
const { buildGeneratedQuestionText } = persistence;
const { postProcessQuestion } = pp;
const { validateQuestionQuality } = quality;
const { makePaperItem } = paperUtils;
const { renderFormattedInline } = paperUtils;
const { renderPassageFormatted } = primitives;
const {
  buildQuestionTypeSettingsPrompt,
  getDefaultQuestionTypeGenerationSettings,
  readGrammarCorrectionErrorCountSetting,
} = typeSettings.default;

const sourceSentence =
  "These deep-seated values, feelings, and emotions we have are rarely a result of reasoning, but can certainly be influenced by reasoning.";
const displayedSentence =
  "These deep-seated values, feelings, and emotions we have is rarely a result of reasoning, but can certainly be influenced by reasoning.";
const secondSourceSentence =
  "We have values, feelings, and emotions before we begin to reason and long before we begin to reason effectively.";
const secondDisplayedSentence =
  "We has values, feelings, and emotions before we begin to reason and long before we begin to reason effectively.";
const passage =
  sourceSentence + " " + secondSourceSentence;

const goodQuestion = {
  _typeId: "GRAMMAR_CORRECTION",
  direction: "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.",
  underlinedSegments: [
    {
      sourceText: sourceSentence,
      displayedText: displayedSentence,
      isError: true,
      errorPart: "is rarely",
      correctedPart: "are rarely",
      surroundingText: "These deep-seated values, feelings, and emotions we have are rarely a result of reasoning",
    },
  ],
  errorPart: "is rarely",
  correctedPart: "are rarely",
  correctedSentence: sourceSentence,
  correctAnswer: "are rarely",
  explanation: "밑줄 친 문장 안의 'is rarely'는 복수 주어 values, feelings, and emotions에 맞지 않으므로 'are rarely'가 필요합니다.",
  keyPoints: ["주어-동사 수일치", "복수 주어", "be동사"],
  tags: ["어법", "수일치"],
  difficulty: "INTERMEDIATE",
};

const postProcessed = postProcessQuestion("GRAMMAR_CORRECTION", passage, goodQuestion);
const postProcessedWithoutPassage = postProcessQuestion("GRAMMAR_CORRECTION", "", goodQuestion);
const questionText = buildGeneratedQuestionText(postProcessed.data);
const answerSlots = buildGrammarCorrectionAnswerSlots(postProcessed.data);
const formattedAnswer = formatGrammarCorrectionCorrectAnswer(postProcessed.data);
const legacyMixedQuestionText = buildGeneratedQuestionText({
  ...postProcessed.data,
  passageWithMarkers: "__SHOULD_NOT_APPEAR__",
});
const qualityIssues = validateQuestionQuality({
  typeId: "GRAMMAR_CORRECTION",
  question: postProcessed.data,
  passage,
});
const badSavedQuestionText =
  "다음 문장에서 밑줄 친 부분을 어법에 맞게 고쳐 쓰시오.\\n\\n" +
  markGrammarCorrectionErrorPart(displayedSentence, "is rarely");
const repaired = repairGrammarCorrectionQuestionText({
  subType: "GRAMMAR_CORRECTION",
  questionText: badSavedQuestionText,
  structuredData: postProcessed.data,
});
const paperItem = makePaperItem({
  id: "q1",
  type: "SHORT_ANSWER",
  subType: "GRAMMAR_CORRECTION",
  questionText: badSavedQuestionText,
  structuredData: postProcessed.data,
  options: null,
  correctAnswer: "are rarely",
  points: 1,
  passage: { id: "p1", title: "", content: passage, grade: null, semester: null, publisher: null, school: null },
}, 1, []);
const tooNarrowQuality = validateQuestionQuality({
  typeId: "GRAMMAR_CORRECTION",
  passage,
  question: {
    ...postProcessed.data,
    passageWithUnderline: passage.replace(sourceSentence, "__is rarely__"),
    underlinedSegments: [{
      sourceText: "are rarely",
      displayedText: "is rarely",
      isError: true,
      errorPart: "is rarely",
      correctedPart: "are rarely",
    }],
  },
});
const multiQuestion = {
  ...goodQuestion,
  underlinedSegments: [
    goodQuestion.underlinedSegments[0],
    {
      sourceText: secondSourceSentence,
      displayedText: secondDisplayedSentence,
      isError: true,
      errorPart: "has values",
      correctedPart: "have values",
      surroundingText: "We have values, feelings, and emotions before we begin",
    },
  ],
  errorParts: ["is rarely", "has values"],
  correctedParts: ["are rarely", "have values"],
  correctAnswer: "are rarely, have values",
};
const multiPostProcessed = postProcessQuestion("GRAMMAR_CORRECTION", passage, multiQuestion);
const multiQuestionText = buildGeneratedQuestionText(multiPostProcessed.data);
const multiAnswerSlots = buildGrammarCorrectionAnswerSlots(multiPostProcessed.data);
const multiFormattedAnswer = formatGrammarCorrectionCorrectAnswer(multiPostProcessed.data);
const workbenchRenderedHtml = renderToStaticMarkup(
  React.createElement(React.Fragment, null, renderPassageFormatted(multiPostProcessed.data.passageWithUnderline)),
);
const paperRenderedHtml = renderToStaticMarkup(
  React.createElement(React.Fragment, null, renderFormattedInline(multiPostProcessed.data.passageWithUnderline, "GRAMMAR_CORRECTION")),
);
const multiQuality = validateQuestionQuality({
  typeId: "GRAMMAR_CORRECTION",
  question: multiPostProcessed.data,
  passage,
  grammarCorrectionErrorCount: 2,
});
const multiMismatchQuality = validateQuestionQuality({
  typeId: "GRAMMAR_CORRECTION",
  question: postProcessed.data,
  passage,
  grammarCorrectionErrorCount: 2,
});
const defaultSettings = getDefaultQuestionTypeGenerationSettings();
const defaultGrammarCorrectionErrorCount = readGrammarCorrectionErrorCountSetting(
  defaultSettings.GRAMMAR_CORRECTION,
);
const clampedGrammarCorrectionErrorCount = readGrammarCorrectionErrorCountSetting({
  errorCount: 99,
});
const grammarCorrectionSettingsPrompt = buildQuestionTypeSettingsPrompt(
  "GRAMMAR_CORRECTION",
  { errorCount: 3 },
);

process.stdout.write(JSON.stringify({
  postProcessed,
  postProcessedWithoutPassage,
  questionText,
  answerSlots,
  formattedAnswer,
  legacyMixedQuestionText,
  qualityIssues,
  repaired,
  paperQuestionText: paperItem.questionText,
  paperIncludePassage: paperItem.includePassage,
  paperAnswerSpaceLines: paperItem.answerSpaceLines,
  tooNarrowQuality,
  multiPostProcessed,
  multiQuestionText,
  multiAnswerSlots,
  multiFormattedAnswer,
  workbenchRenderedHtml,
  paperRenderedHtml,
  multiQuality,
  multiMismatchQuality,
  defaultGrammarCorrectionErrorCount,
  clampedGrammarCorrectionErrorCount,
  grammarCorrectionSettingsPrompt,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grammar-correction-display-harness.mts");
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

test("GRAMMAR_CORRECTION underlines the wider sentence, not the exact error", () => {
  assert.equal(result.postProcessed.success, true);
  assert.match(result.postProcessed.data.passageWithUnderline, /__\(A\) These deep-seated values/);
  assert.match(result.postProcessed.data.passageWithUnderline, /is rarely a result of reasoning/);
  assert.doesNotMatch(result.postProcessed.data.passageWithUnderline, /we have __is rarely__/);
  assert.equal((result.postProcessed.data.passageWithUnderline.match(/__[^_]+__/g) ?? []).length, 1);
});

test("GRAMMAR_CORRECTION keeps only the corrected expression as the answer", () => {
  assert.equal(
    result.postProcessed.data.direction,
    "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.",
  );
  assert.equal(result.postProcessed.data.errorPart, "is rarely");
  assert.equal(result.postProcessed.data.correctAnswer, "(A) are rarely");
  // 표시용 포매터는 단일 오류면 (A) 라벨을 생략한다(빈칸 1개 → 라벨 불필요). 저장값은 라벨 유지.
  assert.equal(result.formattedAnswer, "are rarely");
});

test("single-error question uses an unlabeled underline and a plain answer slot", () => {
  // 오류 구간이 하나뿐이면 (A) 라벨을 붙이지 않는다 — 밑줄 하나·빈칸 하나면 라벨 불필요.
  // (2개 이상일 때만 (A)(B)(C) 로 구분 — 실제 시험 관례. codex 렌더 정합 결정.)
  assert.match(result.questionText, /__These deep-seated values/);
  assert.doesNotMatch(result.questionText, /__\(A\) These deep-seated values/);
  assert.match(result.questionText, /____________________________/);
  assert.doesNotMatch(result.answerSlots, /\(A\)/);
  assert.match(result.answerSlots, /^_+$/);
  assert.doesNotMatch(result.questionText, /we have __is rarely__/);
  assert.doesNotMatch(result.legacyMixedQuestionText, /SHOULD_NOT_APPEAR/);
  assert.match(result.repaired, /__These deep-seated values/);
  assert.doesNotMatch(result.repaired, /__\(A\) These deep-seated values/);
  assert.match(result.repaired, /____________________________/);
  assert.doesNotMatch(result.repaired, /문장에서 밑줄 친 부분을/);
  assert.match(result.paperQuestionText, /__These deep-seated values/);
  assert.doesNotMatch(result.paperQuestionText, /__\(A\) These deep-seated values/);
  assert.match(result.paperQuestionText, /____________________________/);
  assert.equal(result.paperIncludePassage, false);
  assert.equal(result.paperAnswerSpaceLines, 0);
});

test("web and paper renderers split labels from the underlined sentence", () => {
  assert.match(result.workbenchRenderedHtml, /\(A\)/);
  assert.match(result.workbenchRenderedHtml, /\(B\)/);
  assert.doesNotMatch(result.workbenchRenderedHtml, /__\(A\)/);
  assert.match(result.paperRenderedHtml, /data-mark="u"/);
  assert.match(result.paperRenderedHtml, /\(A\)/);
  assert.doesNotMatch(result.paperRenderedHtml, />__\([A-J]\)/);
});

test("quality gate accepts wide underlines and rejects exact-error underlines", () => {
  const errors = result.qualityIssues.filter((issue) => issue.severity === "error");
  assert.deepEqual(errors, []);
  assert.equal(result.postProcessedWithoutPassage.success, false);
  assert.ok(
    result.tooNarrowQuality.some(
      (issue) => issue.severity === "warning" && issue.code === "grammar-correction-underline-too-narrow",
    ),
    JSON.stringify(result.tooNarrowQuality),
  );
  assert.ok(
    result.tooNarrowQuality.some(
      (issue) => issue.severity === "warning" && issue.code === "grammar-correction-underlined-segment-short",
    ),
    JSON.stringify(result.tooNarrowQuality),
  );
});

test("GRAMMAR_CORRECTION supports a configured wrong underline count up to multiple segments", () => {
  assert.equal(result.multiPostProcessed.success, true);
  assert.equal(result.multiPostProcessed.data.correctAnswer, "(A) are rarely, (B) have values");
  assert.equal(result.multiFormattedAnswer, "(A) are rarely, (B) have values");
  assert.deepEqual(result.multiPostProcessed.data.correctedParts, ["are rarely", "have values"]);
  assert.equal((result.multiPostProcessed.data.passageWithUnderline.match(/__[^_]+__/g) ?? []).length, 2);
  assert.match(result.multiPostProcessed.data.passageWithUnderline, /__\(A\) These deep-seated values/);
  assert.match(result.multiPostProcessed.data.passageWithUnderline, /__\(B\) We has values/);
  assert.match(result.multiQuestionText, /\(A\) ____________________________/);
  assert.match(result.multiQuestionText, /\(B\) ____________________________/);
  assert.equal(
    result.multiAnswerSlots,
    "(A) ____________________________\n(B) ____________________________",
  );
  assert.deepEqual(result.multiQuality.filter((issue) => issue.severity === "error"), []);
  assert.ok(
    result.multiMismatchQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-correction-underline-count",
    ),
    JSON.stringify(result.multiMismatchQuality),
  );
});

test("GRAMMAR_CORRECTION detail setting defaults to one wrong underline and clamps to five", () => {
  assert.equal(result.defaultGrammarCorrectionErrorCount, 1);
  assert.equal(result.clampedGrammarCorrectionErrorCount, 5);
  assert.match(result.grammarCorrectionSettingsPrompt, /exactly 3 wrong underlined/);
  assert.match(result.grammarCorrectionSettingsPrompt, /underline count and error count are the same/);
});
