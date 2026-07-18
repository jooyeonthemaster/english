// 상품 단일화 서버 코어 (임무 W2-E) 검증.
// (a) resolveUnifiedGenerationPlan 유형표 (단일 진실)
// (b) fast route 가 클라 PREMIUM 요청에도 단일가 차감 + 유형 기반 라우팅
// (c) 과거 저장 PREMIUM config 재실행 시나리오 클램프
// + 서버 3개 진입점·라우팅 소비부·크레딧 함수의 배선 회귀 가드.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function source(relPath) {
  return readFileSync(path.join(repoRoot, relPath), "utf8");
}

// ─── 실제 컴파일 동작 검증 (tsx 하니스로 진짜 함수를 구동) ──────────────────────
const harnessSource = `
import plans from "@/lib/question-generation-plans";
import creditCostsMod from "@/lib/credit-costs";

const { resolveUnifiedGenerationPlan, getQuestionGenerationCreditCost } = plans;
const { CREDIT_COSTS } = creditCostsMod;

// 지휘관 확정 유형표: 이 8종만 PREMIUM 파이프라인, 그 외 전부 STANDARD.
const PREMIUM_TYPES = [
  "GRAMMAR_ERROR", "BLANK_INFERENCE", "TITLE", "TOPIC",
  "MAIN_IDEA", "TOPIC_MAIN_IDEA", "IMPLIED_MEANING", "CONTENT_MATCH",
];
const STANDARD_TYPES = [
  "SENTENCE_ORDER", "SENTENCE_INSERT", "SUMMARY_WRITING", "SUMMARY_COMPLETE",
  "SUMMARY_COMPLETE_MC", "TOPIC_SENTENCE_WRITING", "VOCAB_CHOICE", "WORD_ORDER",
  "GRAMMAR_CORRECTION", "GRAMMAR_CHOICE_COMBO", "ANTONYM", "SYNONYM",
  "CONTEXT_MEANING", "IRRELEVANT", "KO_GRAMMAR", "UNKNOWN_TYPE_XYZ",
];

// 서버 라우팅 시뮬레이션: 클라가 무엇을 보내든 유형만으로 결정한다.
const serverResolve = (questionType) => resolveUnifiedGenerationPlan(questionType);

const out = {
  premiumMap: Object.fromEntries(PREMIUM_TYPES.map((t) => [t, resolveUnifiedGenerationPlan(t)])),
  standardMap: Object.fromEntries(STANDARD_TYPES.map((t) => [t, resolveUnifiedGenerationPlan(t)])),
  nullPlan: resolveUnifiedGenerationPlan(null),
  undefinedPlan: resolveUnifiedGenerationPlan(undefined),
  emptyPlan: resolveUnifiedGenerationPlan(""),

  baseSingle: CREDIT_COSTS.QUESTION_GEN_SINGLE,
  baseVocab: CREDIT_COSTS.QUESTION_GEN_VOCAB,

  // 크레딧 단일가: 플랜 인자 유무·값과 무관하게 baseCost.
  costNoArg: getQuestionGenerationCreditCost(CREDIT_COSTS.QUESTION_GEN_SINGLE),
  costStandard: getQuestionGenerationCreditCost(CREDIT_COSTS.QUESTION_GEN_SINGLE, "STANDARD"),
  costPremium: getQuestionGenerationCreditCost(CREDIT_COSTS.QUESTION_GEN_SINGLE, "PREMIUM"),
  costVocabPremium: getQuestionGenerationCreditCost(CREDIT_COSTS.QUESTION_GEN_VOCAB, "PREMIUM"),

  // (b) fast route: 클라가 PREMIUM 을 보내도 STANDARD 유형이면 STANDARD 라우팅 + 단일가.
  bClientPremiumOnStandardType: {
    plan: serverResolve("SENTENCE_ORDER"),
    cost: getQuestionGenerationCreditCost(CREDIT_COSTS.QUESTION_GEN_SINGLE, serverResolve("SENTENCE_ORDER")),
  },
  // 유형이 PREMIUM 대상이면 클라 STANDARD 여도 PREMIUM 라우팅(유형이 결정).
  bClientStandardOnPremiumType: {
    plan: serverResolve("GRAMMAR_ERROR"),
    cost: getQuestionGenerationCreditCost(CREDIT_COSTS.QUESTION_GEN_SINGLE, serverResolve("GRAMMAR_ERROR")),
  },

  // (c) 과거 저장 PREMIUM config 재실행: STANDARD 유형이면 클램프(STANDARD + 단일가).
  cPastPremiumConfigPlan: serverResolve("SENTENCE_INSERT"),
  cPastPremiumConfigCost: getQuestionGenerationCreditCost(CREDIT_COSTS.QUESTION_GEN_SINGLE, serverResolve("SENTENCE_INSERT")),
};
console.log(JSON.stringify(out));
`;

test("resolveUnifiedGenerationPlan type table + unified credit + clamp scenarios", () => {
  const tmpDir = path.join(repoRoot, "tests", ".tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".unified-generation-plan-clamp-harness.mts");

  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const r = JSON.parse(raw);

    // (a) 유형표 — 8종 PREMIUM, 그 외 전부 STANDARD, null/undefined/"" → STANDARD.
    for (const [type, plan] of Object.entries(r.premiumMap)) {
      assert.equal(plan, "PREMIUM", `${type} should resolve to PREMIUM`);
    }
    for (const [type, plan] of Object.entries(r.standardMap)) {
      assert.equal(plan, "STANDARD", `${type} should resolve to STANDARD`);
    }
    assert.equal(r.nullPlan, "STANDARD");
    assert.equal(r.undefinedPlan, "STANDARD");
    assert.equal(r.emptyPlan, "STANDARD");

    // 크레딧 단일화 — 플랜과 무관하게 baseCost(2x 폐지).
    assert.equal(r.costNoArg, r.baseSingle);
    assert.equal(r.costStandard, r.baseSingle);
    assert.equal(r.costPremium, r.baseSingle);
    assert.equal(r.costStandard, r.costPremium);
    assert.equal(r.costVocabPremium, r.baseVocab);

    // (b) 클라 PREMIUM → STANDARD 유형이면 STANDARD + 단일가.
    assert.equal(r.bClientPremiumOnStandardType.plan, "STANDARD");
    assert.equal(r.bClientPremiumOnStandardType.cost, r.baseSingle);
    // 유형이 결정: PREMIUM 유형은 클라 STANDARD 여도 PREMIUM(단, 요금은 여전히 단일가).
    assert.equal(r.bClientStandardOnPremiumType.plan, "PREMIUM");
    assert.equal(r.bClientStandardOnPremiumType.cost, r.baseSingle);

    // (c) 과거 저장 PREMIUM config 재실행 → 클램프.
    assert.equal(r.cPastPremiumConfigPlan, "STANDARD");
    assert.equal(r.cPastPremiumConfigCost, r.baseSingle);
  } finally {
    rmSync(harnessPath, { force: true });
  }
});

// ─── 배선 회귀 가드 (소스 정적 검사) ─────────────────────────────────────────────
test("unified clamp is wired at the credit function, routing consumer, and entry points", () => {
  // 크레딧 단일화 함수: 2x 멀티플라이어 곱셈 제거 + 단일 진실 함수 export.
  const plansSrc = source("src/lib/question-generation-plans.ts");
  assert.ok(
    plansSrc.includes("export function resolveUnifiedGenerationPlan("),
    "question-generation-plans.ts should export resolveUnifiedGenerationPlan",
  );
  assert.ok(
    !plansSrc.includes("baseCost * getQuestionGenerationPlanConfig"),
    "getQuestionGenerationCreditCost must not multiply by the plan creditMultiplier anymore",
  );

  // 라우팅 값 소비부(공유): 유형 기반 유도로 대체, 플랜 세팅 읽기 폐지.
  const runSrc = source("src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts");
  assert.ok(
    runSrc.includes("resolveUnifiedGenerationPlan(subType)"),
    "run-question-generation.ts should derive effectiveGenerationPlan from subType",
  );
  assert.ok(
    !runSrc.includes("readQuestionTypeGenerationPlanSetting"),
    "run-question-generation.ts must no longer consume the client/type generationPlan setting",
  );

  // 서버 3개 진입점(fast·async·trigger) + 단건 라우트: 유형 기반 대체 + 클라 플랜 폐지.
  const entryPoints = [
    [
      "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
      "resolveUnifiedGenerationPlan(config.questionType)",
      true,
    ],
    [
      "src/app/api/workbench/ai-jobs/question-generation/route.ts",
      "resolveUnifiedGenerationPlan(parsed.data.questionType)",
      true,
    ],
    [
      "src/trigger/workbench-question-generation.ts",
      "resolveUnifiedGenerationPlan(config.questionType)",
      false,
    ],
    [
      "src/app/api/ai/generate-question/route.ts",
      "resolveUnifiedGenerationPlan(questionType)",
      true,
    ],
  ];
  for (const [relPath, needle, expectRequestedLog] of entryPoints) {
    const text = source(relPath);
    assert.ok(text.includes(needle), `${relPath} should include ${JSON.stringify(needle)}`);
    assert.ok(
      !text.includes("readQuestionTypeGenerationPlanSetting"),
      `${relPath} must no longer read the client generationPlan setting`,
    );
    if (expectRequestedLog) {
      // 클라 값은 로깅용으로만 보존(감사 추적).
      assert.ok(
        text.includes("requestedGenerationPlan"),
        `${relPath} should preserve the client-requested plan for logging`,
      );
    }
  }
});
