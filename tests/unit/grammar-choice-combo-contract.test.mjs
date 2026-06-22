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
const { shouldRenderOptionListForSubtype } = optionDisplay;
const { StructuredQuestionRenderer } = questionRenderers;

const passage = [
  "One afternoon a big wolf waited in a dark forest for a little girl to come along carrying a basket of food to her grandmother.",
  "The wolf found her, followed for a while, and disappeared.",
  "At last, the little girl arrived at her grandmother's, opened the door, and saw someone in her grandmother's bed wearing her grandmother's clothes.",
  "She soon realized that it was the wolf.",
  "Luckily, little girls nowadays are better prepared than they used to be, so she took out her pistol and shot the wolf dead."
].join(" ");

// 모델 출력 시뮬레이션 — 의도적으로 슬롯 순서를 지문 역순으로 줘서
// 라벨 재부여 + slotValues 재배열 경로를 검증한다.
const goodQuestion = {
  _typeId: "GRAMMAR_CHOICE_COMBO",
  direction: "(A), (B), (C)의 각 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?",
  slots: [
    { label: "(A)", correctExpression: "be", wrongExpression: "being", surroundingText: "are better prepared than they used to be, so she took out", pointCode: "a" },
    { label: "(B)", correctExpression: "wearing", wrongExpression: "to wear", surroundingText: "someone in her grandmother's bed wearing her grandmother's clothes", pointCode: "c" },
    { label: "(C)", correctExpression: "carrying", wrongExpression: "carried", surroundingText: "a little girl to come along carrying a basket of food", pointCode: "k" },
  ],
  // slotValues 는 모델 라벨 순서 (A=be, B=wearing, C=carrying).
  options: [
    { label: "1", text: "being - wearing - carrying", slotValues: ["being", "wearing", "carrying"] },
    { label: "2", text: "be - to wear - carrying", slotValues: ["be", "to wear", "carrying"] },
    { label: "3", text: "be - wearing - carrying", slotValues: ["be", "wearing", "carrying"] },
    { label: "4", text: "being - to wear - carried", slotValues: ["being", "to wear", "carried"] },
    { label: "5", text: "be - wearing - carried", slotValues: ["be", "wearing", "carried"] },
  ],
  correctAnswer: "3",
  explanation: "(A)는 used to 뒤 원형 be가 적절하고, (B)는 보어 자리의 현재분사 wearing, (C)는 동시동작 분사 carrying이 적절하다.",
  keyPoints: ["used to + 동사원형", "분사 능/수동", "분사구문"],
  tags: ["어법"],
  difficulty: "INTERMEDIATE",
  wrongOptionExplanations: [
    { label: "1", explanation: "(A) 자리에는 used to 뒤 원형이 와야 한다." },
    { label: "2", explanation: "(B) 자리에는 진행 의미의 현재분사가 와야 한다." },
    { label: "4", explanation: "세 네모 모두 틀린 조합이다." },
    { label: "5", explanation: "(C) 자리에는 능동 의미의 carrying이 와야 한다." },
  ],
};

const processed = postProcessQuestion("GRAMMAR_CHOICE_COMBO", passage, goodQuestion);
const processedQuality = processed.success
  ? validateQuestionQuality({ typeId: "GRAMMAR_CHOICE_COMBO", question: processed.data, passage })
  : [];
const questionText = processed.success ? buildGeneratedQuestionText(processed.data) : "";
const rendersPaperOptionList = shouldRenderOptionListForSubtype("GRAMMAR_CHOICE_COMBO");
const renderedHtml = processed.success
  ? renderToStaticMarkup(
      React.createElement(StructuredQuestionRenderer, {
        question: processed.data,
        index: 0,
        hideHeader: true,
        sourcePassageContent: passage,
      }),
    )
  : "";

// 결정형 실패 1: 어떤 슬롯 후보와도 일치하지 않는 selectValue.
const badValue = postProcessQuestion("GRAMMAR_CHOICE_COMBO", passage, {
  ...goodQuestion,
  options: goodQuestion.options.map((option, index) =>
    index === 0 ? { ...option, slotValues: ["was", "wearing", "carrying"] } : option,
  ),
});

// 결정형 실패 2: 전부-옳은 조합 선지 없음 (다른 조합과 중복되지 않는 대체).
const noAllCorrect = postProcessQuestion("GRAMMAR_CHOICE_COMBO", passage, {
  ...goodQuestion,
  options: goodQuestion.options.map((option) =>
    option.label === "3" ? { ...option, slotValues: ["be", "to wear", "carried"], text: "be - to wear - carried" } : option,
  ),
});

// 결정형 실패 3: 중복 조합.
const duplicated = postProcessQuestion("GRAMMAR_CHOICE_COMBO", passage, {
  ...goodQuestion,
  options: goodQuestion.options.map((option) =>
    option.label === "4" ? { ...option, slotValues: ["being", "wearing", "carrying"], text: "being - wearing - carrying" } : option,
  ),
});

// 게이트: 렌더 지문에서 네모 하나 제거 → combo-render-slot-count.
const brokenQuality = processed.success
  ? validateQuestionQuality({
      typeId: "GRAMMAR_CHOICE_COMBO",
      question: {
        ...processed.data,
        passageWithMarkers: String(processed.data.passageWithMarkers).replace(/\\(C\\)\\s*\\[[^\\]]+\\]/, "carrying"),
      },
      passage,
    })
  : [];

process.stdout.write(JSON.stringify({
  processed,
  processedQuality,
  questionText,
  rendersPaperOptionList,
  renderedHtml,
  badValue: { success: badValue.success, error: badValue.error ?? "" },
  noAllCorrect: { success: noAllCorrect.success, error: noAllCorrect.error ?? "" },
  duplicated: { success: duplicated.success, error: duplicated.error ?? "" },
  brokenQuality,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grammar-choice-combo-contract-harness.mts");
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

test("GRAMMAR_CHOICE_COMBO postprocess renders three boxed slots in passage order", () => {
  assert.equal(summary.processed.success, true, summary.processed.error ?? "");
  const passageWithMarkers = summary.processed.data.passageWithMarkers;
  const slots = passageWithMarkers.match(/\([A-C]\)\s*\[[^\]]+\/[^\]]+\]/g) ?? [];
  assert.equal(slots.length, 3);
  // 지문 등장순: carrying(1문장) → wearing(3문장) → be(5문장).
  assert.equal(summary.processed.data.slots[0].correctExpression, "carrying");
  assert.equal(summary.processed.data.slots[1].correctExpression, "wearing");
  assert.equal(summary.processed.data.slots[2].correctExpression, "be");
  assert.ok(passageWithMarkers.indexOf("(A)") < passageWithMarkers.indexOf("(B)"));
  assert.ok(passageWithMarkers.indexOf("(B)") < passageWithMarkers.indexOf("(C)"));
});

test("GRAMMAR_CHOICE_COMBO reorders option slotValues with the relabeled slots", () => {
  // 모델 순서 [be, wearing, carrying] → 지문 순서 [carrying, wearing, be].
  const correctOption = summary.processed.data.options.find(
    (option) => option.label === summary.processed.data.correctAnswer,
  );
  assert.deepEqual(correctOption.slotValues, ["carrying", "wearing", "be"]);
});

test("GRAMMAR_CHOICE_COMBO quality gates pass for the processed item", () => {
  const errors = summary.processedQuality.filter((issue) => issue.severity === "error");
  assert.deepEqual(errors, []);
});

test("GRAMMAR_CHOICE_COMBO deterministic failures reject broken combinations", () => {
  assert.equal(summary.badValue.success, false);
  assert.match(summary.badValue.error, /matches neither candidate/);
  assert.equal(summary.noAllCorrect.success, false);
  assert.match(summary.noAllCorrect.error, /all-correct/);
  assert.equal(summary.duplicated.success, false);
  assert.match(summary.duplicated.error, /repeat the same slotValues|all-correct/);
});

test("GRAMMAR_CHOICE_COMBO render-count gate catches a missing rendered slot", () => {
  const codes = summary.brokenQuality.map((issue) => issue.code);
  assert.ok(codes.includes("combo-render-slot-count"), codes.join(", "));
});

test("GRAMMAR_CHOICE_COMBO serializes the passage into questionText and renders options", () => {
  assert.ok(summary.questionText.includes("(A) ["));
  assert.equal(summary.rendersPaperOptionList, true);
  // 정답 섹션(네모 표현 분석)은 토글로 접혀 있어 정적 마크업에는 지문/보기만 나온다.
  // 네모 (A) 마커와 [좌 / 우] 박스는 이제 파란 스타일 span 으로 렌더된다(시험지와 색 통일).
  // 따라서 "(A) [" 가 한 덩어리로 붙어있지 않으므로 마커·박스를 분리해 검증한다.
  assert.ok(summary.renderedHtml.includes("(A)"));
  assert.ok(/\[[^\]]*\/[^\]]*\]/.test(summary.renderedHtml));
  assert.ok(summary.renderedHtml.includes("carrying - wearing - be"));
});
