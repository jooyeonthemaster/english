import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 커스텀 레이아웃(v2) 문항이 시험지 미리보기·DOCX·HWPX 세 파이프라인을 깨지지 않고
// 통과하는지 + 커스텀 마커 라벨((a)~(e))이 ①~⑤ 로 강제되지 않는지 + 서술형 답란 줄 수가
// structuredData.layout.answerLineCount 로 전달되는지를 DB 없이 빌더 직접 호출로 고정한다.

const harnessSource = `
import JSZip from "jszip";
import { Packer } from "docx";

import * as buildBuilderDocModule from "../src/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import * as hwpxBuilderModule from "../src/app/api/exams/[examId]/export-hwpx/_lib/builder";
import * as hwpxPackageModule from "../src/app/api/exams/[examId]/export-hwpx/_lib/package";
import paperUtils from "@/components/exams/paper-builder/paper-item-utils";
import * as optionDisplayModule from "@/components/exams/paper-builder/option-display";

const unwrap = (m: any) => m.default ?? m["module.exports"] ?? m;
const { buildBuilderExamDocument } = unwrap(buildBuilderDocModule);
const { buildBuilderHwpxDocument } = unwrap(hwpxBuilderModule);
const { packageHwpx } = unwrap(hwpxPackageModule);
const { makePaperItem, buildGroups } = unwrap(paperUtils);
const { optionDisplayLabel } = unwrap(optionDisplayModule);

// ── 픽스처: 커스텀 마커 (a)~(e) 객관식 + 서술형(조건/답란 3줄) ──
const passage = "Sharing platforms create a trusting environment among strangers because both parties review each other.";

const mcQuestionText = [
  "다음 글의 밑줄 친 단어의 문맥상 의미로 가장 적절한 것은?",
  "Because both parties review each other, these platforms create a \\u24D0 __trusting__ environment even among complete strangers, and the gig economy \\u24D1 __takes advantage of__ idle capacity.",
].join("\\n\\n");

const mcOptions = [
  { label: "(a)", text: "\\u24D0 trusting \\u2014 deserving of trust" },
  { label: "(b)", text: "\\u24D1 takes advantage of \\u2014 unfairly exploits" },
  { label: "(c)", text: "\\u24D0 trusting \\u2014 lacking confidence" },
  { label: "(d)", text: "\\u24D1 takes advantage of \\u2014 makes good use of" },
  { label: "(e)", text: "\\u24D0 trusting \\u2014 physically fastened" },
];

const essayQuestionText = [
  "위 글의 빈칸 (A), (B)에 들어갈 말을 [조건]에 맞게 쓰시오.",
  "Although platforms are designed to (A) _____ idle capacity, many are actually (B) _____ a cut of transactions.",
  "[조건]\\n1. 본문의 단어를 활용할 것\\n2. 어형을 문맥에 맞게 바꿀 것",
].join("\\n\\n");

const essayStructured = {
  _typeId: "CUSTOM_LAYOUT",
  layout: {
    version: 1,
    direction: "위 글의 빈칸 (A), (B)에 들어갈 말을 [조건]에 맞게 쓰시오.",
    blocks: [],
    choices: null,
    answerLineCount: 3,
  },
};

function examQuestion(id: string, subType: string, questionText: string, options: any, correctAnswer: string, structuredData: any) {
  return {
    orderNum: 0,
    points: 3,
    question: {
      id,
      type: options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
      subType,
      questionText,
      structuredData,
      options: options ? JSON.stringify(options) : null,
      correctAnswer,
      difficulty: "INTERMEDIATE",
      passage: { title: "공유경제", content: passage },
      explanation: { content: "해설", keyPoints: null, wrongOptionExplanations: null },
    },
  };
}

const examQuestions = [
  examQuestion("q-mc", "CUSTOM_LAYOUT", mcQuestionText, mcOptions, "(d)", { _typeId: "CUSTOM_LAYOUT", layout: { version: 1, direction: "", blocks: [], choices: null, answerLineCount: 0 } }),
  examQuestion("q-essay", "CUSTOM_LAYOUT", essayQuestionText, null, "(A) utilize, (B) taking", essayStructured),
];

const settings = {
  source: "exam-paper-builder-v2",
  version: 2,
  layout: { paperSize: "A4", columns: 2, density: "comfortable", showAnswerSpace: true, showPassageTitle: true, showQuestionMeta: true, passageStyle: "plain", pageNumberStyle: "dash" },
  header: { subtitle: "커스텀 유형 검증", schoolName: "검증고", className: "2-1", studentNameLabel: "이름", instructions: "" },
  items: [
    { questionId: "q-mc", localId: "L1", orderNum: 1, points: 3, includePassage: false, options: mcOptions },
    { questionId: "q-essay", localId: "L2", orderNum: 2, points: 5, includePassage: false, answerSpaceLines: 3 },
  ],
  blocks: [
    { questionId: "q-mc", localId: "L1", blockType: "question" },
    { questionId: "q-essay", localId: "L2", blockType: "question" },
  ],
};

function resolveItems(questions: any[], items: any[]) {
  const byId = new Map(questions.map((q) => [q.question.id, q]));
  return items.map((item, index) => ({
    ...item,
    questionText: item.questionText || byId.get(item.questionId).question.questionText,
    includePassage: item.includePassage !== false,
    orderNum: item.orderNum ?? index + 1,
    points: item.points ?? byId.get(item.questionId).points,
    sourceQuestion: byId.get(item.questionId).question,
  }));
}

async function main() {
  const resolved = resolveItems(examQuestions, settings.items);

  // ── DOCX ──
  const doc = buildBuilderExamDocument({
    title: "커스텀 레이아웃 검증 시험지",
    settings,
    resolvedItems: resolved,
    includeAnswers: false,
    fullExamQuestions: examQuestions,
  });
  const docxBuffer = await Packer.toBuffer(doc);
  const docxZip = await JSZip.loadAsync(docxBuffer);
  const documentXml = await docxZip.file("word/document.xml")!.async("string");

  // ── HWPX ──
  const hwpxDoc = buildBuilderHwpxDocument({
    title: "커스텀 레이아웃 검증 시험지",
    settings,
    resolvedItems: resolved,
    includeAnswers: false,
    fullExamQuestions: examQuestions,
  });
  const hwpxBuffer = await packageHwpx(hwpxDoc);
  const hwpxZip = await JSZip.loadAsync(hwpxBuffer);
  const sectionFile = hwpxZip.file("Contents/section0.xml");
  const sectionXml = sectionFile ? await sectionFile.async("string") : "";

  // ── 시험지 미리보기(makePaperItem) — 답란 줄 수 + 지문 흐름 ──
  const essayItem = makePaperItem(
    {
      id: "q-essay",
      type: "SHORT_ANSWER",
      subType: "CUSTOM_LAYOUT",
      questionText: essayQuestionText,
      structuredData: JSON.stringify(essayStructured),
      options: null,
      correctAnswer: "(A) utilize, (B) taking",
      points: 5,
      passage: { id: "p1", title: "공유경제", content: passage, grade: null, semester: null, publisher: null, school: null },
    },
    1,
    [],
  );
  const mcItem = makePaperItem(
    {
      id: "q-mc",
      type: "MULTIPLE_CHOICE",
      subType: "CUSTOM_LAYOUT",
      questionText: mcQuestionText,
      structuredData: JSON.stringify({ _typeId: "CUSTOM_LAYOUT" }),
      options: JSON.stringify(mcOptions),
      correctAnswer: "(d)",
      points: 3,
      passage: { id: "p1", title: "공유경제", content: passage, grade: null, semester: null, publisher: null, school: null },
    },
    2,
    [],
  );
  const groups = buildGroups([mcItem, essayItem]);

  console.log(JSON.stringify({
    docxBytes: docxBuffer.length,
    docxHasCustomLabelA: documentXml.includes("(a)"),
    docxHasCustomLabelD: documentXml.includes("(d)"),
    docxHasForcedCircledOne: /\\u2460 \\u24D0 trusting/.test(documentXml.replace(/<[^>]+>/g, "")),
    docxHasConditions: documentXml.includes("\\uC870\\uAC74"),
    docxHasStem: documentXml.includes("\\uBB38\\uB9E5\\uC0C1 \\uC758\\uBBF8\\uB85C"),
    hwpxBytes: hwpxBuffer.length,
    hwpxHasCustomLabelA: sectionXml.includes("(a)"),
    hwpxHasStem: sectionXml.includes("\\uBB38\\uB9E5\\uC0C1 \\uC758\\uBBF8\\uB85C"),
    essayAnswerSpaceLines: essayItem.answerSpaceLines,
    mcAnswerSpaceLines: mcItem.answerSpaceLines,
    mcIncludePassage: mcItem.includePassage,
    groupIncludePassage: groups.map((g: any) => g.includePassage),
  }));
}

void main();
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".custom-layout-export-harness.mts");
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

test("DOCX export survives custom-layout questions and honors stored labels", () => {
  assert.ok(result.docxBytes > 5000, `docx bytes ${result.docxBytes}`);
  assert.equal(result.docxHasCustomLabelA, true, "custom (a) label must appear in DOCX");
  assert.equal(result.docxHasForcedCircledOne, false, "label must not be forced to ①");
  assert.equal(result.docxHasConditions, true, "[조건] block text must flow into DOCX");
  assert.equal(result.docxHasStem, true);
});

test("HWPX export survives custom-layout questions and honors stored labels", () => {
  assert.ok(result.hwpxBytes > 5000, `hwpx bytes ${result.hwpxBytes}`);
  assert.equal(result.hwpxHasCustomLabelA, true, "custom (a) label must appear in HWPX");
  assert.equal(result.hwpxHasStem, true);
});

test("paper preview: custom answerLineCount drives answerSpaceLines; embedded passage rule applies", () => {
  assert.equal(result.essayAnswerSpaceLines, 3, "layout.answerLineCount=3 → answerSpaceLines 3 (not default 4)");
  assert.equal(result.mcAnswerSpaceLines, 0, "MC custom question gets no answer lines");
  assert.equal(result.mcIncludePassage, false, "CUSTOM_LAYOUT is embedded → source passage off");
});
