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
