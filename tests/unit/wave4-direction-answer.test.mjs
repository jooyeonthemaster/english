// wave4: FILL_BLANK_KEY 발문-정답 단어 수 모순 게이트 — 베이스라인 실측
// (발문 "한 단어로 쓰시오" + 정답 "were considered colors" 3단어)의 재현 차단과
// 정상 케이스 통과를 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import quality from "@/lib/question-quality";
import generationConstants from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts";

const { validateQuestionQuality } = quality;
const { RELAXED_BLOCKING_QUALITY_CODES } = generationConstants;

const passage =
  "It took a long time before they were considered colors in their own right. " +
  "Painters treated black and white as tools for shading rather than colors.";

function run(direction, answer) {
  return validateQuestionQuality({
    typeId: "FILL_BLANK_KEY",
    question: {
      direction,
      answer,
      correctAnswer: answer,
      sentenceWithBlank: "It took a long time before they _____ in their own right.",
      passageWithBlank: passage.replace("were considered colors", "_____"),
      explanation: "흑백이 독자적 색으로 인정받기까지 오래 걸렸다는 핵심 표현이다.",
      keyPoints: ["핵심 표현"],
    },
    passage,
  }).filter((i) => i.code === "fbk-direction-word-count-mismatch");
}

console.log(JSON.stringify({
  measuredDefect: run("다음 글의 빈칸에 들어갈 말을 한 단어로 쓰시오.", "were considered colors"),
  exactOk: run("다음 글의 빈칸에 들어갈 말을 세 단어로 쓰시오.", "were considered colors"),
  withinOk: run("빈칸에 들어갈 말을 다섯 단어 이내로 쓰시오.", "were considered colors"),
  withinViolated: run("빈칸에 들어갈 말을 두 단어 이내로 쓰시오.", "were considered colors"),
  atLeastViolated: run("빈칸에 들어갈 말을 네 단어 이상으로 쓰시오.", "were considered colors"),
  noQuantitySilent: run("다음 글의 빈칸에 들어갈 핵심 표현을 쓰시오.", "were considered colors"),
  relaxedBlocks: RELAXED_BLOCKING_QUALITY_CODES.has("fbk-direction-word-count-mismatch"),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".wave4-direction-answer-harness.mts");
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

test("measured defect ('한 단어로' + 3-word answer) blocks as error", () => {
  assert.equal(result.measuredDefect.length, 1, JSON.stringify(result.measuredDefect));
  assert.equal(result.measuredDefect[0].severity, "error");
});

test("consistent and bounded word counts pass; unbounded directions stay silent", () => {
  assert.equal(result.exactOk.length, 0, "세 단어 + 3-word answer must pass");
  assert.equal(result.withinOk.length, 0, "다섯 단어 이내 + 3-word answer must pass");
  assert.equal(result.noQuantitySilent.length, 0, "no word-count phrase must stay silent");
});

test("이내/이상 qualifiers enforce inequalities", () => {
  assert.equal(result.withinViolated.length, 1, "두 단어 이내 + 3-word answer must block");
  assert.equal(result.atLeastViolated.length, 1, "네 단어 이상 + 3-word answer must block");
});

test("code blocks in relaxed mode", () => {
  assert.equal(result.relaxedBlocks, true);
});
