// 난이도 기반 티어 서버 코어 (26-08-18, O223 귀결 — 26-07-20 이원 티어 테스트 개정) 검증.
// (a) 티어 결정: **난이도가 결정** — KILLER → PREMIUM, 그 외 → STANDARD. 요청 플랜·
//     유형별 저장 플랜은 서버 미소비. 단일상품 클램프도 난이도 규칙에 양보.
//     비상 복귀 env QGEN_DIFFICULTY_TIER=off 면 종전(요청 플랜 + 단일상품 클램프).
// (b) 요금: KILLER(PREMIUM) 2배 — creditMultiplier 표와 동기.
// (c) 배선 회귀 가드: 엔진·진입점 6곳(+세트 2곳)·검수리 훅·E-gate 기본값·모델 기본값
//     (PREMIUM 기본 gemini-3.7-flash, STANDARD flash3 잔여, 사다리 flash3).
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
import typeSettings from "@/lib/question-type-generation-settings";
import creditCostsMod from "@/lib/credit-costs";

const {
  QUESTION_GENERATION_PLANS,
  normalizeQuestionGenerationPlan,
  getQuestionGenerationCreditCost,
} = plans;
const { readQuestionTypeGenerationPlanSetting } = typeSettings;
const { CREDIT_COSTS } = creditCostsMod;

// 진입점 시뮬레이션: md-stream/fast/async/trigger/generate-question/grammar-studio
// 공통 규칙 — resolveEffectiveGenerationPlan(requested, difficulty) 는 난이도로만
// 결정하고 요청 플랜은 무시한다. 단일상품 env 도 난이도 규칙에 양보한다.
const { resolveEffectiveGenerationPlan, planForDifficulty } = plans;

delete process.env.QGEN_DIFFICULTY_TIER;
delete process.env.QUESTION_GENERATION_SINGLE_TIER; // 프로덕션 기본(on)
const killerUnderSingleTier = resolveEffectiveGenerationPlan("STANDARD", "KILLER");
const premiumRequestNonKiller = resolveEffectiveGenerationPlan("PREMIUM", "INTERMEDIATE");
process.env.QUESTION_GENERATION_SINGLE_TIER = "off";
const premiumRequestNonKillerDual = resolveEffectiveGenerationPlan("PREMIUM", "BASIC");
delete process.env.QUESTION_GENERATION_SINGLE_TIER;

// 킬스위치: 종전 규칙 복귀(요청 플랜 + 단일상품 클램프).
process.env.QGEN_DIFFICULTY_TIER = "off";
const legacySingleFolded = resolveEffectiveGenerationPlan("PREMIUM", "KILLER");
process.env.QUESTION_GENERATION_SINGLE_TIER = "off";
const legacyDualHonored = resolveEffectiveGenerationPlan("PREMIUM", "BASIC");
delete process.env.QUESTION_GENERATION_SINGLE_TIER;
delete process.env.QGEN_DIFFICULTY_TIER;

const out = {
  // (a) 난이도 기반 결정.
  killerUnderSingleTier,
  premiumRequestNonKiller,
  premiumRequestNonKillerDual,
  requestedGarbage: resolveEffectiveGenerationPlan("banana", "banana"),
  requestedNull: resolveEffectiveGenerationPlan(null, null),
  helperKiller: planForDifficulty(" killer "),
  helperMissing: planForDifficulty(undefined),
  legacySingleFolded,
  legacyDualHonored,
  // 클라 헬퍼의 계약은 유지(서버 미소비와 별개).
  clientHelperOverride: readQuestionTypeGenerationPlanSetting(
    { generationPlan: "PREMIUM" },
    "STANDARD",
  ),
  hasLegacyClampExport: typeof plans.resolveUnifiedGenerationPlan,

  // (b) 요금: KILLER 2배.
  baseSingle: CREDIT_COSTS.QUESTION_GEN_SINGLE,
  costStandard: getQuestionGenerationCreditCost(CREDIT_COSTS.QUESTION_GEN_SINGLE, "STANDARD"),
  costPremium: getQuestionGenerationCreditCost(CREDIT_COSTS.QUESTION_GEN_SINGLE, "PREMIUM"),
  multStandard: QUESTION_GENERATION_PLANS.STANDARD.creditMultiplier,
  multPremium: QUESTION_GENERATION_PLANS.PREMIUM.creditMultiplier,
};
console.log(JSON.stringify(out));
`;

test("tier is decided by difficulty (KILLER=PREMIUM x2), request plan ignored", () => {
  const tmpDir = path.join(repoRoot, "tests", ".tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".tier-generation-plan-harness.mts");

  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const r = JSON.parse(raw);

    // (a) 난이도 기반: KILLER 는 단일상품 env(on)에서도 PREMIUM, 비KILLER 는 요청
    //     PREMIUM 이어도 STANDARD(이원/단일 무관).
    assert.equal(r.killerUnderSingleTier, "PREMIUM");
    assert.equal(r.premiumRequestNonKiller, "STANDARD");
    assert.equal(r.premiumRequestNonKillerDual, "STANDARD");
    assert.equal(r.requestedGarbage, "STANDARD");
    assert.equal(r.requestedNull, "STANDARD");
    assert.equal(r.helperKiller, "PREMIUM");
    assert.equal(r.helperMissing, "STANDARD");
    // 킬스위치 off: 종전 규칙(단일상품 클램프 → STANDARD, 이원이면 요청 존중).
    assert.equal(r.legacySingleFolded, "STANDARD");
    assert.equal(r.legacyDualHonored, "PREMIUM");
    assert.equal(r.clientHelperOverride, "PREMIUM");
    assert.equal(r.hasLegacyClampExport, "undefined");

    // (b) KILLER 2배 + 표시 멀티플라이어 정합.
    assert.equal(r.costStandard, r.baseSingle);
    assert.equal(r.costPremium, r.baseSingle * 2);
    assert.equal(r.multStandard, 1);
    assert.equal(r.multPremium, 2);
  } finally {
    rmSync(harnessPath, { force: true });
  }
});

// ─── 배선 회귀 가드 (소스 정적 검사) ─────────────────────────────────────────────
test("dual-tier pipeline is wired at the engine, entry points, and gates", () => {
  // 플랜 모듈: 유형 강제표 제거.
  const plansSrc = source("src/lib/question-generation-plans.ts");
  assert.ok(
    !plansSrc.includes("export function resolveUnifiedGenerationPlan"),
    "the W2-E type clamp must be removed from question-generation-plans.ts",
  );

  // 엔진: 호출자 플랜 소비 + KO 동결 + 검수리 훅 + 솔버 프리미엄 한정.
  const runSrc = source(
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  );
  assert.ok(
    runSrc.includes("koTypeFrozenStandard"),
    "engine must freeze KO types to the legacy STANDARD lane",
  );
  assert.ok(
    runSrc.includes("runReviewRepairGate("),
    "engine must invoke the unified review-repair gate",
  );
  assert.ok(
    /subType === "GRAMMAR_ERROR" &&\s*\n\s*effectiveGenerationPlan === "PREMIUM"/.test(
      runSrc,
    ),
    "grammar solver gate must be PREMIUM-only (STANDARD relies on the review-repair call)",
  );
  assert.ok(
    !runSrc.includes("resolveUnifiedGenerationPlan(subType)"),
    "engine must not re-derive the plan from subType anymore",
  );

  // 진입점 4곳: 요청 top-level 플랜 단일 권위 — 유형별 저장 플랜 서버 미소비 +
  // 구 클램프 부재.
  for (const relPath of [
    "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
    "src/app/api/workbench/ai-jobs/question-generation/route.ts",
    "src/trigger/workbench-question-generation.ts",
    "src/app/api/ai/generate-question/route.ts",
  ]) {
    const text = source(relPath);
    assert.ok(
      !text.includes("readQuestionTypeGenerationPlanSetting("),
      `${relPath} must not consume the per-type saved generationPlan (zombie-config override trap)`,
    );
    assert.ok(
      !text.includes("resolveUnifiedGenerationPlan("),
      `${relPath} must not use the removed W2-E clamp`,
    );
  }
  for (const relPath of [
    "src/app/api/workbench/ai-jobs/question-generation/md-stream/route.ts",
    "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
    "src/app/api/workbench/ai-jobs/question-generation/route.ts",
    "src/trigger/workbench-question-generation.ts",
    "src/app/api/ai/generate-question/route.ts",
    "src/app/api/workbench/ai-jobs/grammar-studio/route.ts",
    "src/app/api/workbench/ai-jobs/question-set/route.ts",
    "src/app/api/workbench/ai-jobs/korean-question-set/route.ts",
    "src/app/api/ai/generate-questions-auto/route.ts",
    "src/lib/question-sets/generate-set.ts",
  ]) {
    const text = source(relPath);
    assert.ok(
      text.includes("resolveEffectiveGenerationPlan("),
      `${relPath} must resolve the tier via the single resolver`,
    );
    // 난이도 기반: 결정 함수 호출에 난이도 인자가 전달돼야 한다(1인자 호출 금지).
    assert.ok(
      !/resolveEffectiveGenerationPlan\(\s*[A-Za-z_.?\[\]"']+\s*\)/.test(text),
      `${relPath} must pass difficulty to resolveEffectiveGenerationPlan (no 1-arg call)`,
    );
  }
  // 단일 상품: 어법 KILLER 는 플랜 무관 사다리 라우팅(O205 — 1방 생성 재시도 지배).
  assert.ok(
    /\(effectiveGenerationPlan === "PREMIUM" \|\|\s*\n\s*effectiveDiffLabel === "KILLER"\)/.test(
      source(
        "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
      ),
    ),
    "grammar KILLER must route through the ladder regardless of plan",
  );

  // fast 라우트: PENDING 문항이 있을 때만 async 검증 워커 인큐.
  const fastSrc = source(
    "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  );
  assert.ok(
    fastSrc.includes("hasPendingExplanationVerify"),
    "fast route must enqueue the verify worker only when a question is PENDING",
  );

  // E-gate: STANDARD 기본 off(검수리 대체) / PREMIUM 기본 enforce 유지.
  const egateSrc = source(
    "src/app/api/ai/generate-questions-auto/_lib/explanation-verify-gate.ts",
  );
  assert.ok(
    egateSrc.includes(
      'parseMode(process.env.EXPLANATION_VERIFY_GATE_MODE_STANDARD) ?? "off"',
    ),
    "STANDARD E-gate default must be off (replaced by the review-repair call)",
  );
  assert.ok(
    egateSrc.includes(
      'parseMode(process.env.EXPLANATION_VERIFY_GATE_MODE_PREMIUM) ?? "enforce"',
    ),
    "PREMIUM E-gate default must remain enforce",
  );
  assert.ok(
    egateSrc.includes(
      'DEFAULT_EXPLANATION_VERIFY_MODEL_ID = "google/gemini-3-flash-preview"',
    ),
    "E-gate verifier default model must be flash3 (O196/O197)",
  );

  // 모델 기본값(26-08-19 전 라인업 3.7 통일, O226): PREMIUM(=KILLER 티어)과
  // STANDARD 모두 gemini-3.7-flash. luna 레인은 옵트인(QGEN_LUNA_LANE=on).
  const atlasSrc = source("src/lib/atlas-ai.ts");
  assert.ok(
    /ATLAS_PREMIUM_QGEN_MODEL_ID = resolveAtlasModel\(\s*\["PREMIUM_QGEN_MODEL_ID"\],\s*"google\/gemini-3\.7-flash",?\s*\)/.test(
      atlasSrc,
    ),
    "PREMIUM qgen default model must be gemini-3.7-flash",
  );
  assert.ok(
    /ATLAS_STANDARD_QGEN_MODEL_ID = resolveAtlasModel\(\s*\["STANDARD_QGEN_MODEL_ID"\],\s*"google\/gemini-3\.7-flash",?\s*\)/.test(
      atlasSrc,
    ),
    "STANDARD qgen default model must be gemini-3.7-flash (26-08-19 unification, O226)",
  );
  // luna 레인 옵트인 반전(26-08-19): 기본은 전 유형 gemini(3.7) — 'on' 일 때만 luna.
  const lunaSrc = source("src/lib/md-qgen/luna-lane.ts");
  assert.ok(
    /QGEN_LUNA_LANE\?\.trim\(\)\.toLowerCase\(\) !== "on"/.test(lunaSrc),
    "luna lane must be opt-in (QGEN_LUNA_LANE=on)",
  );
  const lunaExtSrc = source("src/lib/md-qgen/luna-ext-registry.ts");
  assert.ok(
    /QGEN_LUNA_LANE\?\.trim\(\)\.toLowerCase\(\) !== "on"/.test(lunaExtSrc),
    "luna ext registry must be opt-in (QGEN_LUNA_LANE=on)",
  );
  const ladderSrc = source(
    "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts",
  );
  assert.ok(
    ladderSrc.includes(
      'DEFAULT_GRAMMAR_PREMIUM_MODEL_ID = "google/gemini-3.7-flash"',
    ),
    "grammar ladder default model must be gemini-3.7-flash (26-08-19 unification)",
  );

  // 신규 결정형 게이트 등재 정책(리뷰 실측 판정 26-07-20): 문장삼킴 비율만
  // F급 등재(relaxed 차단 유지). 트레일링 의존은 선행사 중의성으로 경고 강등,
  // 인용 실재는 인용 관행 오탐면이 남아 strict 전용(미등재 → relaxed 강등 출하).
  const constantsSrc = source(
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
  );
  assert.ok(
    constantsSrc.includes('"blank-span-sentence-swallow"'),
    "blank-span-sentence-swallow must be registered in RELAXED_BLOCKING_QUALITY_CODES",
  );
  assert.ok(
    !constantsSrc.includes('"blank-trailing-dependent"'),
    "blank-trailing-dependent must stay warning-only (antecedent ambiguity)",
  );
  assert.ok(
    !constantsSrc.includes('"explanation-quoted-token-missing"'),
    "explanation-quoted-token-missing must stay strict-only (citation-idiom FP surface)",
  );
});
