import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import JSZip from "jszip";
import { Packer } from "docx";

import * as buildBuilderDocModule from "../src/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import * as hwpxBuilderModule from "../src/app/api/exams/[examId]/export-hwpx/_lib/builder";
import * as hwpxPackageModule from "../src/app/api/exams/[examId]/export-hwpx/_lib/package";

const unwrap = (m: any) => m.default ?? m["module.exports"] ?? m;
const { buildBuilderExamDocument } = unwrap(buildBuilderDocModule);
const { buildBuilderHwpxDocument } = unwrap(hwpxBuilderModule);
const { packageHwpx } = unwrap(hwpxPackageModule);

const options = [
  { label: "1", text: "A concise summary of the passage." },
  { label: "2", text: "An unrelated statement." },
  { label: "3", text: "A minor detail only." },
  { label: "4", text: "The opposite claim." },
  { label: "5", text: "A grammar note." },
];

function sourceQuestion() {
  const passageContent =
    "Careful readers use surrounding sentences to infer how ideas connect. This passage content deliberately does not contain the title text.";
  return {
    id: "q-title-inline",
    type: "MULTIPLE_CHOICE",
    subType: "BLANK_INFERENCE",
    questionText: [
      "Choose the best word for the blank.",
      passageContent + " Therefore, the blank should be solved from context."
    ].join("\\n\\n"),
    structuredData: null,
    options: JSON.stringify(options),
    correctAnswer: "1",
    difficulty: "INTERMEDIATE",
    passage: {
      title: "Source Passage Title",
      content: passageContent
    },
    explanation: null,
  };
}

function resolvedItem(passageTitle: string) {
  const question = sourceQuestion();
  return {
    localId: "item-title-inline",
    questionId: question.id,
    orderNum: 1,
    points: 2,
    groupId: "single:item-title-inline",
    includePassage: false,
    passageTitle,
    passageContent: question.passage.content,
    questionText: question.questionText,
    options,
    correctAnswer: "1",
    answerSpaceLines: 0,
    objectiveAnswerSlots: 0,
    objectiveAnswerTexts: [],
    sectionTitle: "",
    teacherNote: "",
    sourceQuestion: question,
  };
}

async function buildXml({ showPassageTitle, passageTitle }: { showPassageTitle: boolean; passageTitle: string }) {
  const item = resolvedItem(passageTitle);
  const settings = {
    source: "exam-paper-builder-v1",
    template: "clean",
    layout: {
      paperSize: "A4",
      columns: 2,
      density: "comfortable",
      passageStyle: "plain",
      showAnswerSpace: true,
      showPassageTitle,
      showQuestionMeta: true,
    },
    header: {
      subtitle: "",
      schoolName: "",
      className: "",
      studentNameLabel: "Name",
      instructions: "",
    },
    items: [item],
  };
  const fullExamQuestions = [{ orderNum: 1, points: 2, question: item.sourceQuestion }];

  const doc = buildBuilderExamDocument({
    title: "Passage title export",
    settings,
    resolvedItems: [item],
    includeAnswers: false,
    fullExamQuestions,
  });
  const docxZip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const documentXml = await docxZip.file("word/document.xml")!.async("string");

  const hwpxDoc = buildBuilderHwpxDocument({
    title: "Passage title export",
    settings,
    resolvedItems: [item],
    includeAnswers: false,
    fullExamQuestions,
  });
  const hwpxZip = await JSZip.loadAsync(await packageHwpx(hwpxDoc));
  const sectionXml = await hwpxZip.file("Contents/section0.xml")!.async("string");

  return { documentXml, sectionXml };
}

const sourceFallback = await buildXml({ showPassageTitle: true, passageTitle: "" });
const customOverride = await buildXml({ showPassageTitle: true, passageTitle: "Custom Passage Name" });
const titleHidden = await buildXml({ showPassageTitle: false, passageTitle: "" });

function appearsBeforeQuestion(xml: string, title: string) {
  const text = xml.replace(/<[^>]+>/g, "");
  const titleIndex = text.indexOf(title);
  const questionIndex = text.indexOf("Choose the best word for the blank.");
  return titleIndex >= 0 && questionIndex >= 0 && titleIndex < questionIndex;
}

process.stdout.write(JSON.stringify({
  docxFallbackHasSource: sourceFallback.documentXml.includes("SOURCE PASSAGE TITLE"),
  hwpxFallbackHasSource: sourceFallback.sectionXml.includes("SOURCE PASSAGE TITLE"),
  docxFallbackTitleBeforeQuestion: appearsBeforeQuestion(sourceFallback.documentXml, "SOURCE PASSAGE TITLE"),
  hwpxFallbackTitleBeforeQuestion: appearsBeforeQuestion(sourceFallback.sectionXml, "SOURCE PASSAGE TITLE"),
  docxCustomHasCustom: customOverride.documentXml.includes("CUSTOM PASSAGE NAME"),
  hwpxCustomHasCustom: customOverride.sectionXml.includes("CUSTOM PASSAGE NAME"),
  docxCustomHasSource: customOverride.documentXml.includes("SOURCE PASSAGE TITLE"),
  hwpxCustomHasSource: customOverride.sectionXml.includes("SOURCE PASSAGE TITLE"),
  docxHiddenHasSource: titleHidden.documentXml.includes("SOURCE PASSAGE TITLE"),
  hwpxHiddenHasSource: titleHidden.sectionXml.includes("SOURCE PASSAGE TITLE"),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".passage-title-export-harness.mts");
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

test("DOCX/HWPX export falls back to the source passage title when the saved title is blank", () => {
  assert.equal(result.docxFallbackHasSource, true, "DOCX must print the source passage title");
  assert.equal(result.hwpxFallbackHasSource, true, "HWPX must print the source passage title");
  assert.equal(result.docxFallbackTitleBeforeQuestion, true, "DOCX must print the title above the question");
  assert.equal(result.hwpxFallbackTitleBeforeQuestion, true, "HWPX must print the title above the question");
});

test("DOCX/HWPX export preserves an edited passage title over the source title", () => {
  assert.equal(result.docxCustomHasCustom, true, "DOCX must print the edited title");
  assert.equal(result.hwpxCustomHasCustom, true, "HWPX must print the edited title");
  assert.equal(result.docxCustomHasSource, false, "DOCX must not fall back when an edited title exists");
  assert.equal(result.hwpxCustomHasSource, false, "HWPX must not fall back when an edited title exists");
});

test("DOCX/HWPX export hides passage titles when the layout option is off", () => {
  assert.equal(result.docxHiddenHasSource, false, "DOCX must hide source titles when disabled");
  assert.equal(result.hwpxHiddenHasSource, false, "HWPX must hide source titles when disabled");
});
