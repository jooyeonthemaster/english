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
import paperUtils from "@/components/exams/paper-builder/paper-item-utils";
import pagination from "@/components/exams/paper-builder/pagination";
import optionDisplay from "@/components/exams/paper-builder/option-display";
import docxOptions from "../src/app/api/exams/[examId]/export-docx/_lib/render-options.ts";
import hwpxOptions from "../src/app/api/exams/[examId]/export-hwpx/_lib/render/options.ts";
import hwpxFragment from "../src/app/api/exams/[examId]/export-hwpx/_lib/render/fragment.ts";

const { postProcessQuestion } = pp;
const { buildGroups, makePaperItem } = paperUtils;
const { paginateGroups } = pagination;
const { formatInlineMarkersForSubtype } = optionDisplay;
const { renderOptions: renderDocxOptions } = docxOptions;
const { renderOptions: renderHwpxOptions } = hwpxOptions;
const { renderQuestionPart } = hwpxFragment;

const passage = [
  "To understand memory, imagine your brain as a vast digital archive.",
  "Accessing this data depends on two primary methods: Recall and Recognition.",
  "Recall is like being asked to write an essay on a blank page.",
  "You must search your internal hard drive and reconstruct information from scratch."
].join(" ");

const ai = {
  direction: "Choose the grammatically incorrect underlined part.",
  markedExpressions: [
    { label: "A", expression: "depends", errorExpression: "depend", isError: true, correction: "depends", surroundingText: "Accessing this data depends on two primary methods" },
    { label: "B", expression: "being asked", isError: false, surroundingText: "Recall is like being asked to write" },
    { label: "C", expression: "must search", isError: false, surroundingText: "You must search your internal" },
    { label: "D", expression: "reconstruct", isError: false, surroundingText: "hard drive and reconstruct information" },
    { label: "E", expression: "from scratch", isError: false, surroundingText: "information from scratch" }
  ],
  correctAnswer: "A",
  options: [
    { label: "A", text: "depend" },
    { label: "B", text: "being asked" },
    { label: "C", text: "must search" },
    { label: "D", text: "reconstruct" },
    { label: "E", text: "from scratch" }
  ],
  explanation: "① depend should be depends."
};

const processed = postProcessQuestion("GRAMMAR_ERROR", passage, ai);

const ocrPassage = "Because there are so many people like Jackie who turn to the gig economy, the supply of drivers quickly Coutpaces the demand for rides, so naturally prices fall.";
const ocrAi = {
  direction: "Choose the grammatically incorrect underlined part.",
  markedExpressions: [
    { label: "A", expression: "there are", isError: false, surroundingText: "Because there are so many people" },
    { label: "B", expression: "turn to", isError: false, surroundingText: "Jackie who turn to the gig economy" },
    { label: "C", expression: "gig economy", isError: false, surroundingText: "turn to the gig economy, the supply" },
    { label: "D", expression: "outpaces", isError: false, surroundingText: "supply of drivers quickly outpaces the demand" },
    { label: "E", expression: "prices fall", errorExpression: "price fall", isError: true, correction: "prices fall", surroundingText: "so naturally prices fall" }
  ],
  correctAnswer: "E",
  options: [
    { label: "A", text: "there are" },
    { label: "B", text: "turn to" },
    { label: "C", text: "gig economy" },
    { label: "D", text: "outpaces" },
    { label: "E", text: "price fall" }
  ],
  explanation: "prices fall should be price falls."
};
const ocrProcessed = postProcessQuestion("GRAMMAR_ERROR", ocrPassage, ocrAi);

const existingErrorPassage = "In your brain, there is a part that is responsible for solve problems and controlling your emotions. At the same time, you may feel confused about who are you.";
const existingErrorAi = {
  direction: "Choose the grammatically incorrect underlined part.",
  markedExpressions: [
    { label: "A", expression: "solving", errorExpression: "solve", isError: true, correction: "solving", surroundingText: "responsible for solve problems" },
    { label: "B", expression: "your brain", isError: false, surroundingText: "In your brain, there is" },
    { label: "C", expression: "there is", isError: false, surroundingText: "there is a part" },
    { label: "D", expression: "responsible for", isError: false, surroundingText: "part that is responsible for" },
    { label: "E", expression: "who you are", isError: false, surroundingText: "confused about who you are" }
  ],
  correctAnswer: "A",
  options: [
    { label: "A", text: "solve" },
    { label: "B", text: "your brain" },
    { label: "C", text: "there is" },
    { label: "D", text: "responsible for" },
    { label: "E", text: "who you are" }
  ],
  explanation: "solve should be solving after responsible for."
};
const existingErrorProcessed = postProcessQuestion("GRAMMAR_ERROR", existingErrorPassage, existingErrorAi);
const formattedPassage = formatInlineMarkersForSubtype(
  processed.data.passageWithMarkers,
  "GRAMMAR_ERROR",
);
const paperItem = makePaperItem({
  id: "grammar1",
  type: "MULTIPLE_CHOICE",
  subType: "GRAMMAR_ERROR",
  questionText: [processed.data.direction, "", processed.data.passageWithMarkers].join("\\n"),
  structuredData: processed.data,
  options: JSON.stringify(processed.data.options),
  correctAnswer: processed.data.correctAnswer,
  points: 1,
  passage: { id: "p1", title: "", content: passage, grade: null, semester: null, publisher: null, school: null },
}, 1, []);

const pages = paginateGroups(buildGroups([paperItem]), {
  paperSize: "A4",
  columns: 2,
  density: "comfortable",
  passageStyle: "boxed",
  showAnswerSpace: true,
  showPassageTitle: false,
  showQuestionMeta: false,
  template: "clean",
}).pages;
const parts = pages.flatMap((page) =>
  page.flatMap((column) =>
    column.flatMap((fragment) =>
      fragment.parts.filter((part) => part.source.questionId === "grammar1"),
    ),
  ),
);
const previewText = parts.flatMap((part) => part.questionRenderedLines).join(" ");
const previewOptionCount = parts.flatMap((part) => part.options).length;
const docxOptionBlocks = renderDocxOptions(processed.data.options, "GRAMMAR_ERROR");
const hwpxOptionBlocks = renderHwpxOptions({
  options: processed.data.options,
  subType: "GRAMMAR_ERROR",
  compact: false,
  contentWidthHpu: 10000,
});
const hwpxBlocks = parts[0]
  ? renderQuestionPart(parts[0], {
      passageStyle: "boxed",
      showPassageTitle: false,
      showQuestionMeta: false,
      showAnswerSpace: true,
      compact: false,
      template: "clean",
      columnWidthHpu: 10000,
    })
  : [];

function collectText(value) {
  const chunks = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.text === "string") chunks.push(node.text);
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    Object.values(node).forEach(visit);
  };
  visit(value);
  return chunks.join(" ");
}

process.stdout.write(JSON.stringify({
  passageWithMarkers: processed.data.passageWithMarkers,
  ocrPassageWithMarkers: ocrProcessed.data.passageWithMarkers,
  ocrWarnings: ocrProcessed.warnings,
  existingErrorPassageWithMarkers: existingErrorProcessed.data.passageWithMarkers,
  existingErrorWarnings: existingErrorProcessed.warnings,
  formattedPassage,
  previewText,
  previewOptionCount,
  docxOptionCount: docxOptionBlocks.length,
  hwpxOptionCount: hwpxOptionBlocks.length,
  hwpxText: collectText(hwpxBlocks),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grammar-error-paper-rendering-harness.mts");
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

test("GRAMMAR_ERROR maps one-letter OCR prefix noise before marker rendering", () => {
  assert.match(result.ocrPassageWithMarkers, /__\(D\) outpaces__/);
  assert.doesNotMatch(result.ocrPassageWithMarkers, /Coutpaces/);
  assert.ok(
    result.ocrWarnings.some((warning) =>
      warning.includes("OCR-noisy source token matched for label (D)"),
    ),
  );
});

test("GRAMMAR_ERROR can mark an existing source error expression", () => {
  assert.match(result.existingErrorPassageWithMarkers, /__\(A\) solve__/);
  assert.match(result.existingErrorPassageWithMarkers, /__\(E\) who you are__/);
  assert.ok(
    result.existingErrorWarnings.some((warning) =>
      warning.includes("Existing error expression matched for label (A)"),
    ),
  );
  assert.ok(
    result.existingErrorWarnings.some((warning) =>
      warning.includes("Corrected source variant matched for label (E)"),
    ),
  );
});

test("GRAMMAR_ERROR renders circled passage markers and suppresses option lists", () => {
  assert.match(result.passageWithMarkers, /__\(A\) depend__/);
  assert.match(result.formattedPassage, /__① depend__/);
  assert.doesNotMatch(result.formattedPassage, /\(A\)/);
  assert.match(result.previewText, /① depend/);
  assert.doesNotMatch(result.previewText, /\(A\)/);
  assert.equal(result.previewOptionCount, 0);
  assert.equal(result.docxOptionCount, 0);
  assert.equal(result.hwpxOptionCount, 0);
  assert.match(result.hwpxText, /①/);
  assert.doesNotMatch(result.hwpxText, /\(A\)/);
});
