// 미끼 스페어 과잉생성(G=K+1) 드랍 선별 테스트 (26-07-06 1회호출 캠페인 Wave 3-lite).
//   - 정답 pointCode 반복 미끼가 최우선 드랍 (KILLER 하드 게이트의 0-콜 대체)
//   - 산문 가드: keyPoints/explanation 이 참조하는 라벨은 드랍 금지
//   - 전원 참조/오류개수 불일치/무잉여 → 무변형 (기존 반려 경로 무회귀)
//   - 통합: 트림 초안 → processGrammarError 재라벨·재렌더 정합
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import helpers from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts";
import postprocess from "../src/lib/question-postprocess/index.ts";

const { trimGrammarDecoySurplus } = helpers;
const { postProcessQuestion } = postprocess;

const passage =
  "The reports that the committee reviewed show how policies designed to reduce waste can change habits, and students repeat the rules only when teachers insist.";

function buildDraft(overrides = {}) {
  return {
    direction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
    difficulty: "KILLER",
    markedExpressions: [
      { label: "(A)", expression: "that", isError: false, pointCode: "b", surroundingText: "The reports that the committee reviewed" },
      { label: "(B)", expression: "show", errorExpression: "shows", correction: "show", isError: true, pointCode: "d", surroundingText: "the committee reviewed show how policies" },
      { label: "(C)", expression: "designed", isError: false, pointCode: "c", surroundingText: "policies designed to reduce waste" },
      { label: "(D)", expression: "change", isError: false, pointCode: "a", surroundingText: "can change habits" },
      { label: "(E)", expression: "only", isError: false, pointCode: "m", surroundingText: "the rules only when teachers insist" },
      { label: "(F)", expression: "repeat", isError: false, pointCode: "d", surroundingText: "students repeat the rules" },
    ],
    options: ["(A)", "(B)", "(C)", "(D)", "(E)", "(F)"].map((label) => ({ label, text: label })),
    correctAnswer: "(B)",
    correctAnswers: ["(B)"],
    wrongOptionExplanations: {
      "(A)": "목적격 관계대명사 that.",
      "(C)": "과거분사 수식.",
      "(D)": "조동사 뒤 원형.",
      "(E)": "부사 수식.",
      "(F)": "복수 주어 수일치.",
    },
    keyPoints: ["(B) 수일치", "(A) 관계대명사", "(C) 분사"],
    explanation: "(B) 자리의 shows 는 복수 주어 reports 와 어긋난다.",
    ...overrides,
  };
}

const labelsOf = (draft) => draft.markedExpressions.map((me) => me.label).join(",");

// 1) 정답 코드(d) 반복 미끼 (F) 드랍
const conflictTrim = trimGrammarDecoySurplus(buildDraft(), { finalMarkerCount: 5, finalAnswerCount: 1 });

// 2) 산문 가드 — (F)가 keyPoints 에 참조되면 차순위(필러 (E) only)를 드랍
const guarded = trimGrammarDecoySurplus(
  buildDraft({ keyPoints: ["(B) 수일치", "(F) 수일치 미끼", "(C) 분사"] }),
  { finalMarkerCount: 5, finalAnswerCount: 1 },
);

// 3) 미끼 전원이 산문에 참조되면 무변형
const allReferenced = trimGrammarDecoySurplus(
  buildDraft({ explanation: "(A)(C)(D)(E)(F) 전부 언급" }),
  { finalMarkerCount: 5, finalAnswerCount: 1 },
);

// 4) 무잉여(5개)면 무변형
const noSurplusDraft = buildDraft();
noSurplusDraft.markedExpressions = noSurplusDraft.markedExpressions.slice(0, 5);
const noSurplus = trimGrammarDecoySurplus(noSurplusDraft, { finalMarkerCount: 5, finalAnswerCount: 1 });

// 5) 오류 개수 불일치(계약 위반) → 추정하지 않고 무변형
const twoErrorsDraft = buildDraft();
twoErrorsDraft.markedExpressions[5] = { ...twoErrorsDraft.markedExpressions[5], isError: true, errorExpression: "repeats", correction: "repeat" };
const twoErrors = trimGrammarDecoySurplus(twoErrorsDraft, { finalMarkerCount: 5, finalAnswerCount: 1 });

// 6) 충돌 없으면 필러 표면(only) 드랍
const noConflictDraft = buildDraft();
noConflictDraft.markedExpressions[5] = { ...noConflictDraft.markedExpressions[5], pointCode: "g" };
const fillerTrim = trimGrammarDecoySurplus(noConflictDraft, { finalMarkerCount: 5, finalAnswerCount: 1 });

// 7) 통합: 트림 초안 → 후처리 재라벨·재렌더
const pp = postProcessQuestion("GRAMMAR_ERROR", passage, conflictTrim);

console.log(JSON.stringify({
  conflict: {
    labels: labelsOf(conflictTrim),
    count: conflictTrim.markedExpressions.length,
    wrongKeys: Object.keys(conflictTrim.wrongOptionExplanations),
    optionCount: conflictTrim.options.length,
  },
  guarded: { labels: labelsOf(guarded) },
  allReferencedCount: allReferenced.markedExpressions.length,
  noSurplusSame: noSurplus === noSurplusDraft,
  twoErrorsCount: twoErrors.markedExpressions.length,
  fillerLabels: labelsOf(fillerTrim),
  pp: pp.success
    ? {
        count: pp.data.markedExpressions.length,
        optionCount: pp.data.options.length,
        correctAnswer: pp.data.correctAnswer,
        markerCount: (pp.data.passageWithMarkers.match(/__\\([A-J]\\)\\s[^_]+__/g) || []).length,
        hasRepeatMarker: /__\\([A-J]\\)\\srepeat__/.test(pp.data.passageWithMarkers),
      }
    : { error: pp.error },
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grammar-decoy-surplus-harness.mts");
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

test("정답 pointCode 반복 미끼가 최우선 드랍된다 (파생 필드 동기 정리)", () => {
  assert.equal(result.conflict.count, 5);
  assert.ok(!result.conflict.labels.includes("(F)"), result.conflict.labels);
  assert.ok(!result.conflict.wrongKeys.includes("(F)"), JSON.stringify(result.conflict.wrongKeys));
  assert.equal(result.conflict.optionCount, 5);
});

test("산문 가드: keyPoints 참조 미끼는 드랍 금지 — 차순위 필러가 드랍", () => {
  assert.ok(result.guarded.labels.includes("(F)"), result.guarded.labels);
  assert.ok(!result.guarded.labels.includes("(E)"), result.guarded.labels);
});

test("미끼 전원이 산문 참조되면 무변형 (기존 반려 경로로 폴백)", () => {
  assert.equal(result.allReferencedCount, 6);
});

test("무잉여·오류개수 불일치는 무변형", () => {
  assert.equal(result.noSurplusSame, true);
  assert.equal(result.twoErrorsCount, 6);
});

test("충돌이 없으면 장식 필러 표면이 드랍된다", () => {
  assert.ok(!result.fillerLabels.includes("(E)"), result.fillerLabels);
});

test("통합: 트림 초안이 후처리에서 5마커로 재라벨·재렌더된다", () => {
  assert.equal(result.pp.count, 5, JSON.stringify(result.pp));
  assert.equal(result.pp.optionCount, 5);
  assert.equal(result.pp.markerCount, 5);
  assert.equal(result.pp.hasRepeatMarker, false);
  assert.match(String(result.pp.correctAnswer), /B/);
});
