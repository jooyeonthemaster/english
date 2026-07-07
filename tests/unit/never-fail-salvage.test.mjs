// never-fail 구제 사다리 (26-07-06 유저 결정: "생성 실패"는 최악의 결과).
// 실측 근거: 26-07-06 01:14 KST 생성 실패 3건(어법 KILLER, 일반1+프리미엄2)의 거절
// 코드가 전부 craft(완성도) 계열 — grammar-weak-filler-decoys, grammar-obvious-local-
// agreement, grammar-killer-thin-answer 등 — 인데 전-모드 차단이라 출구가 없었다.
// 이 테스트는 (1) 그 실제 실패 코드들이 SALVAGE 강등 대상인지, (2) F급(정답무효·
// 누출·렌더파손)은 절대 강등되지 않는지, (3) 풀 재승인 로직의 선별·랭킹·notice 를 고정한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import constants from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts";
import helpers from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts";

const { SALVAGE_RELAXABLE_CODES, RELAXED_BLOCKING_QUALITY_CODES } = constants;
const { admitSalvageCandidatesFromPool, recordRejectedCandidate, buildSalvageNotice } = helpers;

// 26-07-06 실제 생성 실패 3건의 거절 코드(프리미엄 2건 + 일반 1건) — 전부 구제 대상이어야 한다.
const OBSERVED_FAILURE_CODES = [
  "grammar-obvious-local-agreement",
  "grammar-weak-filler-decoys",
  "grammar-killer-answer-point-repeated",
  "grammar-obvious-noun-what-relative",
  "grammar-obvious-adjacent-sv-agreement",
  "grammar-killer-thin-answer",
];

// F급 스팟 목록 — 정답 무효/복수정답 시비/누출/렌더 파손. 절대 SALVAGE 로 강등 금지.
const NEVER_SALVAGE_CODES = [
  "correct-answer-mismatch",
  "option-count",
  "duplicate-option-text",
  "grammar-error-not-mutated",
  "grammar-marker-count",
  "grammar-marker-error-form-mismatch",
  "grammar-perception-complement-toggle",
  "grammar-tense-only-error",
  "grammar-disputed-usage-target",
  "grammar-quantity-debatable",
  "sentence-order-answer-key-mismatch",
  "sentence-insert-answer-desync",
  "irrelevant-answer-desync",
  "irrelevant-answer-from-source",
  "multi-blank-answer-visible",
  "blank-answer-residual-visible",
  "blank-missing-answer",
  "blank-paraphrase-polarity-loss",
  "fbk-frame-altered",
  "fbk-direction-word-count-mismatch",
  "sw-modelanswer-present",
  "sw-gloss-answer-leak",
  "summary-mc-stem-unterminated",
  "summary-mc-duplicate-correct-option",
  "tsw-cloze-degenerate-stem",
  "cond-writing-condition-violated",
  "word-order-unreconstructable",
  // 26-07-06 과완화 적대검증으로 F급 원복된 5종 — 정답 선지 슬롯 비문(무정답급)
  // 3종 + 인라인 지문 정답 노출(verbatim) 2종. 재유입 방지.
  "blank-paraphrase-verb-form-slot-mismatch",
  "blank-paraphrase-clause-slot-mismatch",
  "negative-paraphrase-stacked-prepositions",
  "writing-answer-verbatim-copy",
  "cond-writing-verbatim-answer",
];

function makeCandidate(overrides) {
  return {
    subType: "GRAMMAR_ERROR",
    qualityMode: "strict",
    attemptIndex: 0,
    question: { correctAnswer: "(E)", direction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?", options: [{ label: "(A)", text: "meets" }] },
    blockingCodes: ["grammar-weak-filler-decoys"],
    blockingIssues: [{ code: "grammar-weak-filler-decoys", message: "weak filler decoy", severity: "error" }],
    warnings: [],
    ...overrides,
  };
}

// 시나리오 1: craft 결함만 있는 후보(오늘 실패 재현) → 재승인 + notice/검수권장 부착.
const recorder1 = { issues: [] };
recordRejectedCandidate(recorder1, makeCandidate({
  blockingCodes: ["grammar-obvious-local-agreement", "grammar-weak-filler-decoys"],
  blockingIssues: [
    { code: "grammar-obvious-local-agreement", message: "m1", severity: "error" },
    { code: "grammar-weak-filler-decoys", message: "m2", severity: "error" },
  ],
}));
const admitted1 = admitSalvageCandidatesFromPool(recorder1, { needed: 1 });

// 시나리오 2: F급 코드가 하나라도 섞이면 절대 재승인 금지.
const recorder2 = { issues: [] };
recordRejectedCandidate(recorder2, makeCandidate({
  blockingCodes: ["grammar-weak-filler-decoys", "grammar-perception-complement-toggle"],
  blockingIssues: [
    { code: "grammar-weak-filler-decoys", message: "m1", severity: "error" },
    { code: "grammar-perception-complement-toggle", message: "m2", severity: "error" },
  ],
}));
const admitted2 = admitSalvageCandidatesFromPool(recorder2, { needed: 1 });

// 시나리오 3: 랭킹 — 결함 수 적은 후보 우선, 동수면 늦은 시도 우선. dedupe 동작.
const recorder3 = { issues: [] };
recordRejectedCandidate(recorder3, makeCandidate({
  attemptIndex: 0,
  question: { correctAnswer: "(A)", direction: "d", options: [] },
  blockingCodes: ["grammar-weak-filler-decoys", "grammar-killer-thin-answer"],
  blockingIssues: [
    { code: "grammar-weak-filler-decoys", message: "m", severity: "error" },
    { code: "grammar-killer-thin-answer", message: "m", severity: "error" },
  ],
}));
recordRejectedCandidate(recorder3, makeCandidate({
  attemptIndex: 1,
  question: { correctAnswer: "(B)", direction: "d", options: [] },
  blockingCodes: ["grammar-killer-thin-answer"],
  blockingIssues: [{ code: "grammar-killer-thin-answer", message: "m", severity: "error" }],
}));
recordRejectedCandidate(recorder3, makeCandidate({
  attemptIndex: 2,
  question: { correctAnswer: "(B)", direction: "d", options: [] },
  blockingCodes: ["grammar-killer-thin-answer"],
  blockingIssues: [{ code: "grammar-killer-thin-answer", message: "m", severity: "error" }],
}));
const admitted3 = admitSalvageCandidatesFromPool(recorder3, { needed: 3 });

console.log(JSON.stringify({
  observedAllSalvageable: OBSERVED_FAILURE_CODES.every((c) => SALVAGE_RELAXABLE_CODES.has(c)),
  observedMissing: OBSERVED_FAILURE_CODES.filter((c) => !SALVAGE_RELAXABLE_CODES.has(c)),
  fatalLeaked: NEVER_SALVAGE_CODES.filter((c) => SALVAGE_RELAXABLE_CODES.has(c)),
  salvageSize: SALVAGE_RELAXABLE_CODES.size,
  scenario1: {
    count: admitted1.length,
    hasNotice: typeof admitted1[0]?._generationNotice === "string" && admitted1[0]._generationNotice.length > 10,
    reviewRecommended: admitted1[0]?._reviewRecommended === true,
    qualityMode: admitted1[0]?._qualityMode,
    warningCount: Array.isArray(admitted1[0]?._qualityWarnings) ? admitted1[0]._qualityWarnings.length : 0,
    warningsAllDemoted: Array.isArray(admitted1[0]?._qualityWarnings)
      ? admitted1[0]._qualityWarnings.every((w) => w.severity === "warning")
      : false,
  },
  scenario2Count: admitted2.length,
  scenario3: {
    count: admitted3.length,
    firstAnswer: admitted3[0]?.correctAnswer,
    // dedupe: (B) 후보 2개는 키가 같아 1개만 남는다.
    answers: admitted3.map((q) => q.correctAnswer),
  },
  noticeSample: buildSalvageNotice(["grammar-weak-filler-decoys", "grammar-killer-thin-answer"]),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".never-fail-salvage-harness.mts");
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

test("26-07-06 실측 실패 코드는 전부 salvage 강등 대상이다 (그 실패들은 이제 출하된다)", () => {
  assert.equal(result.observedAllSalvageable, true, JSON.stringify(result.observedMissing));
});

test("F급(정답무효·누출·렌더파손) 코드는 하나도 salvage 로 강등되지 않는다", () => {
  assert.deepEqual(result.fatalLeaked, []);
});

test("craft 결함만 있는 후보는 notice·검수권장·경고강등과 함께 재승인된다", () => {
  assert.equal(result.scenario1.count, 1);
  assert.equal(result.scenario1.hasNotice, true);
  assert.equal(result.scenario1.reviewRecommended, true);
  assert.equal(result.scenario1.qualityMode, "relaxed");
  assert.equal(result.scenario1.warningCount, 2);
  assert.equal(result.scenario1.warningsAllDemoted, true);
});

test("F급 코드가 섞인 후보는 절대 재승인되지 않는다", () => {
  assert.equal(result.scenario2Count, 0);
});

test("랭킹(결함 적은 후보 우선)과 dedupe 가 동작한다", () => {
  assert.equal(result.scenario3.firstAnswer, "(B)");
  assert.deepEqual(result.scenario3.answers, ["(B)", "(A)"]);
});

test("salvage notice 는 사람이 읽는 한국어 사유를 담는다", () => {
  assert.ok(result.noticeSample.includes("검수"), result.noticeSample);
  assert.ok(!/grammar-/.test(result.noticeSample), result.noticeSample);
});
