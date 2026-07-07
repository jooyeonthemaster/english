import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// GRAMMAR_ERROR 후처리 결정론 자동수리(수리 A 완전동일 마커 중복 제거 · 수리 B
// 필드 역할 스왑 복구)와 비표준 문법 용어 결정형 치환을 실코드로 검증한다.
const harnessSource = `
import pp from "@/lib/question-postprocess";
import sanitize from "@/lib/question-postprocess/grammar-explanation-sanitize";

const { postProcessQuestion } = pp;
const { sanitizeGrammarExplanationMeta } = sanitize;

// ── [수리 A] 완전동일 마커 중복 ──────────────────────────────────────────────
const dedupPassage =
  "The clever cat sat on the warm mat under a bright lamp during the long dark night.";
const decoy = (label, expression) => ({ label, expression, isError: false });

// (E)·(F) 가 expression/errorExpression/correction/isError 4필드 바이트동일.
const dedupInput = {
  markedExpressions: [
    decoy("(A)", "clever"),
    decoy("(B)", "warm"),
    decoy("(C)", "bright"),
    decoy("(D)", "lamp"),
    decoy("(E)", "dark"),
    decoy("(F)", "dark"),
  ],
  correctAnswer: "(A)",
};

// 서로 다른 잉여 마커(모두 distinct) → dedup 미발화, 6개 유지(abstain).
const distinctInput = {
  markedExpressions: [
    decoy("(A)", "clever"),
    decoy("(B)", "warm"),
    decoy("(C)", "bright"),
    decoy("(D)", "lamp"),
    decoy("(E)", "dark"),
    decoy("(F)", "night"),
  ],
  correctAnswer: "(A)",
};

const dedupResult = postProcessQuestion("GRAMMAR_ERROR", dedupPassage, dedupInput);
const distinctResult = postProcessQuestion("GRAMMAR_ERROR", dedupPassage, distinctInput);

// ── [수리 B] 필드 역할 스왑 ─────────────────────────────────────────────────
// 실측: expr="what" errExpr="what" corr="that". 지문엔 "that" 실재, "what" 부재.
const swapPassage =
  "Everyone knew that the results were final. The committee later announced the outcome.";
const swapInput = {
  markedExpressions: [
    {
      label: "(A)",
      expression: "what",
      errorExpression: "what",
      correction: "that",
      isError: true,
      surroundingText: "Everyone knew that the results were final",
    },
  ],
  correctAnswer: "(A)",
};
const swapResult = postProcessQuestion("GRAMMAR_ERROR", swapPassage, swapInput);

// 정문 오판(playing/playing/played): 원문 "playing" 이 지문에 실재 → abstain.
const abstainPassage =
  "The children were playing in the park all afternoon while their parents watched.";
const abstainInput = {
  markedExpressions: [
    {
      label: "(A)",
      expression: "playing",
      errorExpression: "playing",
      correction: "played",
      isError: true,
      surroundingText: "The children were playing in the park",
    },
  ],
  correctAnswer: "(A)",
};
const abstainResult = postProcessQuestion("GRAMMAR_ERROR", abstainPassage, abstainInput);

// ── 비표준 용어 결정형 치환 ─────────────────────────────────────────────────
const term1 = sanitizeGrammarExplanationMeta("이 문장은 통사적으로 주어와 동사가 일치해야 한다.");
const term2 = sanitizeGrammarExplanationMeta("여기서 전사구가 부사어 역할을 한다.");
const termExcluded = sanitizeGrammarExplanationMeta("이 자리에는 계사가 와야 한다.");

process.stdout.write(JSON.stringify({
  dedupResult,
  distinctResult,
  swapResult,
  abstainResult,
  term1,
  term2,
  termExcluded,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grammar-postprocess-auto-repair-harness.mts");
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

test("[수리 A] byte-identical duplicate grammar marker is removed (6 -> 5)", () => {
  assert.equal(result.dedupResult.success, true);
  assert.equal(result.dedupResult.data.markedExpressions.length, 5);
  assert.ok(
    result.dedupResult.warnings.some((w) => /byte-identical duplicate grammar marker/.test(w)),
    JSON.stringify(result.dedupResult.warnings),
  );
});

test("[수리 A] distinct surplus markers abstain (6 kept, no dedup)", () => {
  assert.equal(result.distinctResult.success, true);
  assert.equal(result.distinctResult.data.markedExpressions.length, 6);
  assert.ok(
    !result.distinctResult.warnings.some((w) => /byte-identical duplicate/.test(w)),
    JSON.stringify(result.distinctResult.warnings),
  );
});

test("[수리 B] role swap (what/what/that) restores expression to the real source", () => {
  assert.equal(result.swapResult.success, true);
  const marker = result.swapResult.data.markedExpressions[0];
  // expression := correction — 진짜 소스로 복구.
  assert.equal(marker.expression, "that");
  // 표면(errorExpression)은 불변 → 렌더도 불변.
  assert.equal(marker.errorExpression, "what");
  // not-mutated 시그니처(errorExpression === expression) 가 깨져 게이트 반려 해소.
  assert.notEqual(marker.expression, marker.errorExpression);
  assert.ok(
    result.swapResult.warnings.some((w) => /Expression restored to source/.test(w)),
    JSON.stringify(result.swapResult.warnings),
  );
  // 밑줄 표면은 여전히 오류형 "what".
  assert.match(result.swapResult.data.passageWithMarkers, /__\(A\) what__/);
});

test("[수리 B] correct form misflagged as error (playing/playing/played) abstains", () => {
  assert.equal(result.abstainResult.success, true);
  const marker = result.abstainResult.data.markedExpressions[0];
  // 원문 "playing" 이 지문에 실재하므로 자동 제외 — expression 미변경.
  assert.equal(marker.expression, "playing");
  assert.ok(
    !result.abstainResult.warnings.some((w) => /Expression restored to source/.test(w)),
    JSON.stringify(result.abstainResult.warnings),
  );
});

test("[용어] '통사적으로' → '문장 구조상' 결정형 치환", () => {
  assert.doesNotMatch(result.term1, /통사적으로/);
  assert.match(result.term1, /문장 구조상/);
});

test("[용어] '전사구' → '전치사구' 결정형 치환", () => {
  assert.doesNotMatch(result.term2, /전사구/);
  assert.match(result.term2, /전치사구/);
});

test("[용어] 대응이 애매한 용어('계사')는 치환하지 않고 게이트 반려에 맡긴다", () => {
  assert.match(result.termExcluded, /계사/);
});
