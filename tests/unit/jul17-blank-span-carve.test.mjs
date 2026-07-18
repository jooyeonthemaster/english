// 7/17 프로덕션 전수감사 O164: STANDARD 빈칸 F 의 span 경계 선택 결함 클래스 재현 회귀.
// J012(문장 전체 통삭제)·J001(삽입구 절단 고아 콤마)은 차단되고,
// 같은 지문의 건강한 span 선택(프리미엄 J006 스타일)은 통과해야 한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import quality from "@/lib/question-quality";

const { validateQuestionQuality } = quality;

function issuesFor(question: Record<string, unknown>, passage: string) {
  return validateQuestionQuality({
    typeId: "BLANK_INFERENCE",
    question: {
      direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
      difficulty: "KILLER",
      blankAnswerMode: "PARAPHRASE",
      correctAnswer: "1",
      explanation: "지문 근거에 따라 정답을 추론한다.",
      ...question,
    },
    passage,
    requestedDifficulty: "KILLER",
  });
}

// ── J012 재현: 서사 지문에서 문장 전체를 통째로 빈칸화 ──
const narrativePassage =
  "Garcia stood outside Frontcountry Mall, waiting for his brother, Jeff. Garcia's band had been chosen to perform at the welcoming ceremony for a large group of students from their sister university in Singapore. Garcia was hoping to find the perfect clothing for the performance. That was why he had asked Jeff to help him pick out new clothes.";
const fullSentenceBlank = issuesFor(
  {
    originalExpression: "Garcia was hoping to find the perfect clothing for the performance",
    passageWithBlank:
      "Garcia stood outside Frontcountry Mall, waiting for his brother, Jeff. Garcia's band had been chosen to perform at the welcoming ceremony for a large group of students from their sister university in Singapore. _____. That was why he had asked Jeff to help him pick out new clothes.",
    options: [
      { label: "1", text: "seek an ideal visual presentation for his upcoming stage" },
      { label: "2", text: "worry that the ceremony might be cancelled" },
      { label: "3", text: "choose his outfit for the show in advance" },
      { label: "4", text: "hope the students would enjoy the concert" },
      { label: "5", text: "plan to skip the welcoming ceremony" },
    ],
  },
  narrativePassage,
);

// ── 대조군: 문장 전체 빈칸이지만 선지가 대문자 완전문 → 기능하므로 통과 ──
const sentenceShapedFullBlank = issuesFor(
  {
    originalExpression: "Garcia was hoping to find the perfect clothing for the performance",
    passageWithBlank:
      "Garcia stood outside Frontcountry Mall, waiting for his brother, Jeff. Garcia's band had been chosen to perform at the welcoming ceremony for a large group of students from their sister university in Singapore. _____. That was why he had asked Jeff to help him pick out new clothes.",
    options: [
      { label: "1", text: "He wanted to look absolutely perfect on stage" },
      { label: "2", text: "He was worried the ceremony might be cancelled" },
      { label: "3", text: "He had already chosen his outfit for the show" },
      { label: "4", text: "He hoped the students would enjoy the concert" },
      { label: "5", text: "He planned to skip the welcoming ceremony" },
    ],
  },
  narrativePassage,
);

// ── J001 재현: 삽입구 경계를 가로지르는 절단 → 고아 콤마 ──
const faminePassage =
  "There is a tendency to seek the reduction of famine vulnerability primarily in enhanced economic growth. The potential contribution of greater economic success, if it involves vulnerable groups, cannot be denied. At the same time, it is important to recognize the role of direct public intervention.";
const clauseCarveBlank = issuesFor(
  {
    originalExpression: "if it involves vulnerable groups, cannot be denied",
    passageWithBlank:
      "There is a tendency to seek the reduction of famine vulnerability primarily in enhanced economic growth. The potential contribution of greater economic success, _____. At the same time, it is important to recognize the role of direct public intervention.",
    options: [
      { label: "1", text: "needs to be acknowledged to a certain extent" },
      { label: "2", text: "is fundamentally hampered by public interventions" },
      { label: "3", text: "should be denied in every economic context" },
      { label: "4", text: "guarantees the complete eradication of shortages" },
      { label: "5", text: "proves insufficient without diversification" },
    ],
  },
  faminePassage,
);

// ── 건강한 대조군 1 (프리미엄 J006 스타일): 삽입구를 닫고 술부만 빈칸 ──
const healthyPredicateBlank = issuesFor(
  {
    originalExpression: "cannot be denied",
    passageWithBlank:
      "There is a tendency to seek the reduction of famine vulnerability primarily in enhanced economic growth. The potential contribution of greater economic success, if it involves vulnerable groups, _____. At the same time, it is important to recognize the role of direct public intervention.",
    options: [
      { label: "1", text: "should be acknowledged to a certain extent" },
      { label: "2", text: "is fundamentally hampered by public interventions" },
      { label: "3", text: "must be denied in every economic context" },
      { label: "4", text: "guarantees the complete eradication of shortages" },
      { label: "5", text: "proves insufficient without diversification" },
    ],
  },
  faminePassage,
);

// ── 건강한 대조군 2: 문장 끝 구(phrase) 빈칸 ──
const healthyTailBlank = issuesFor(
  {
    originalExpression: "direct public intervention",
    passageWithBlank:
      "There is a tendency to seek the reduction of famine vulnerability primarily in enhanced economic growth. The potential contribution of greater economic success, if it involves vulnerable groups, cannot be denied. At the same time, it is important to recognize the role of _____.",
    options: [
      { label: "1", text: "direct public support in times of crisis" },
      { label: "2", text: "unrestricted market liberalization" },
      { label: "3", text: "reduced governmental oversight" },
      { label: "4", text: "voluntary charitable donations alone" },
      { label: "5", text: "increased reliance on food imports" },
    ],
  },
  faminePassage,
);

// ── 건강한 대조군 3: 문장 첫머리 주어 빈칸(문장 전체가 아님) ──
const healthySubjectBlank = issuesFor(
  {
    originalExpression: "The potential contribution of greater economic success",
    passageWithBlank:
      "There is a tendency to seek the reduction of famine vulnerability primarily in enhanced economic growth. _____, if it involves vulnerable groups, cannot be denied. At the same time, it is important to recognize the role of direct public intervention.",
    options: [
      { label: "1", text: "The potential benefit of broad-based growth" },
      { label: "2", text: "The immediate elimination of all poverty" },
      { label: "3", text: "The rejection of market mechanisms" },
      { label: "4", text: "The abandonment of rural economies" },
      { label: "5", text: "The exclusive focus on urban development" },
    ],
  },
  faminePassage,
);

process.stdout.write(JSON.stringify({
  fullSentenceBlank,
  sentenceShapedFullBlank,
  clauseCarveBlank,
  healthyPredicateBlank,
  healthyTailBlank,
  healthySubjectBlank,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".jul17-blank-span-carve-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(
      `node node_modules/tsx/dist/cli.mjs "${harnessPath}"`,
      { cwd: repoRoot, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } },
    );
    return JSON.parse(raw);
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

const result = runHarness();
const find = (issues, code) => issues.find((issue) => issue.code === code);

test("J012 class: whole-sentence blank is blocked", () => {
  assert.equal(
    find(result.fullSentenceBlank, "blank-span-full-sentence")?.severity,
    "error",
    JSON.stringify(result.fullSentenceBlank),
  );
});

test("J001 class: parenthetical clause carve is blocked", () => {
  assert.equal(
    find(result.clauseCarveBlank, "blank-span-clause-carve")?.severity,
    "error",
    JSON.stringify(result.clauseCarveBlank),
  );
});

test("healthy span choices do not trigger span-carve codes", () => {
  for (const [name, issues] of [
    ["sentenceShapedFullBlank", result.sentenceShapedFullBlank],
    ["healthyPredicateBlank", result.healthyPredicateBlank],
    ["healthyTailBlank", result.healthyTailBlank],
    ["healthySubjectBlank", result.healthySubjectBlank],
  ]) {
    assert.equal(
      find(issues, "blank-span-full-sentence"),
      undefined,
      `${name}: ${JSON.stringify(issues)}`,
    );
    assert.equal(
      find(issues, "blank-span-clause-carve"),
      undefined,
      `${name}: ${JSON.stringify(issues)}`,
    );
  }
});
