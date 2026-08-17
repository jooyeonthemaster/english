// 이원 티어 서버 코어 (26-07-20, 캠페인 O197~O201) 검증.
// (a) 티어 결정: 사용자 요청 플랜 존중 + 유형별 저장 설정 우선 (W2-E 유형 클램프 폐기)
// (b) 요금: 모드별 실효 청구액 — 단일 상품은 단일가, 이원 티어는 PREMIUM 2배
//     (26-07-22 사용자 확정). 요금 함수 자체는 모드와 무관하게 PREMIUM=2배이고,
//     단일 상품 모드에서 2배가 안 걷히는 이유는 리졸버가 PREMIUM 을 STANDARD 로
//     접기 때문이다. 그래서 "리졸버 + 요금 함수" 합성으로 검증한다.
// (c) 배선 회귀 가드: 엔진·진입점·검수리 훅·E-gate 기본값·모델 기본값.
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

// 진입점 시뮬레이션: fast/async/trigger/generate-question 공통 규칙 —
// 단일 상품(26-07-21 사용자 결정): resolveEffectiveGenerationPlan 이 정규화 후
// 전 요청을 STANDARD 로 접는다. env QUESTION_GENERATION_SINGLE_TIER=off 로 이원
// 티어 복귀. 유형별 저장 설정의 generationPlan 은 서버 미소비.
const { resolveEffectiveGenerationPlan } = plans;
const resolveEntry = (requested) => resolveEffectiveGenerationPlan(requested);

const base = CREDIT_COSTS.QUESTION_GEN_SINGLE;
// 사용자가 실제로 물게 되는 금액 = 요금함수(리졸버가 확정한 유효 플랜).
const chargedFor = (requested) =>
  getQuestionGenerationCreditCost(base, resolveEntry(requested));

delete process.env.QUESTION_GENERATION_SINGLE_TIER;
const singleTierPremiumFolded = resolveEntry("PREMIUM");
const singleTierChargedPremium = chargedFor("PREMIUM");
const singleTierChargedStandard = chargedFor("STANDARD");

process.env.QUESTION_GENERATION_SINGLE_TIER = "off";
const dualTierPremiumHonored = resolveEntry("PREMIUM");
const dualTierChargedPremium = chargedFor("PREMIUM");
const dualTierChargedStandard = chargedFor("STANDARD");

delete process.env.QUESTION_GENERATION_SINGLE_TIER;

const out = {
  // (a) 단일 상품 클램프 + env 복귀 스위치 + 방어적 정규화.
  singleTierPremiumFolded,
  dualTierPremiumHonored,
  requestedStandard: resolveEntry("STANDARD"),
  requestedGarbage: resolveEntry("banana"),
  requestedNull: resolveEntry(null),
  // 클라 헬퍼의 계약은 유지(서버 미소비와 별개).
  clientHelperOverride: readQuestionTypeGenerationPlanSetting(
    { generationPlan: "PREMIUM" },
    "STANDARD",
  ),
  // 어떤 유형이든 동일 규칙 — 유형→플랜 강제표는 존재하지 않는다.
  hasLegacyClampExport: typeof plans.resolveUnifiedGenerationPlan,

  // (b) 모드별 실효 청구액.
  baseSingle: base,
  singleTierChargedPremium,
  singleTierChargedStandard,
  dualTierChargedPremium,
  dualTierChargedStandard,
  // 요금 함수 자체의 값(모드 무관) — 표시 멀티플라이어와의 정합 확인용.
  costStandard: getQuestionGenerationCreditCost(base, "STANDARD"),
  costPremium: getQuestionGenerationCreditCost(base, "PREMIUM"),
  // 화면에 "2x"로 표시하면 실제로도 2배가 걷혀야 한다 — 표시/실제 불일치 방지.
  multStandard: QUESTION_GENERATION_PLANS.STANDARD.creditMultiplier,
  multPremium: QUESTION_GENERATION_PLANS.PREMIUM.creditMultiplier,
};
console.log(JSON.stringify(out));
`;

test("tier plan resolution honors user choice + per-type override, mode-aware pricing", () => {
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

    // (a) 단일 상품: PREMIUM 요청도 STANDARD 로 접힘, env off 면 이원 복귀.
    assert.equal(r.singleTierPremiumFolded, "STANDARD");
    assert.equal(r.dualTierPremiumHonored, "PREMIUM");
    assert.equal(r.requestedStandard, "STANDARD");
    assert.equal(r.requestedGarbage, "STANDARD");
    assert.equal(r.requestedNull, "STANDARD");
    assert.equal(r.clientHelperOverride, "PREMIUM");
    // W2-E 유형 클램프는 폐기됐다 — export 자체가 없어야 한다.
    assert.equal(r.hasLegacyClampExport, "undefined");

    // (b-1) 단일 상품 모드: 프리미엄을 요청해도 STANDARD 로 접히므로 단일가.
    assert.equal(r.singleTierChargedStandard, r.baseSingle);
    assert.equal(r.singleTierChargedPremium, r.baseSingle);

    // (b-2) 이원 티어 모드(env off): PREMIUM 2배 — 26-07-22 사용자 확정.
    // 프리미엄은 더 좋은 모델 + 풀 파이프라인(어법 사다리·E-gate enforce)을 타므로
    // 원가가 더 든다. 이 값을 1배로 되돌리려면 요금 정책 결정이 선행돼야 한다.
    assert.equal(r.dualTierChargedStandard, r.baseSingle);
    assert.equal(r.dualTierChargedPremium, r.baseSingle * 2);

    // (b-3) 표시 멀티플라이어 ↔ 실제 요금 정합: 화면에 2x 로 표시하면 실제로도
    // 2배가 걷혀야 한다(표시/실제 불일치가 과금 신뢰를 깨는 지점).
    assert.equal(r.multStandard, 1);
    assert.equal(r.multPremium, 2);
    assert.equal(r.costStandard, r.baseSingle * r.multStandard);
    assert.equal(r.costPremium, r.baseSingle * r.multPremium);
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
    "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
    "src/app/api/workbench/ai-jobs/question-generation/route.ts",
    "src/trigger/workbench-question-generation.ts",
    "src/app/api/ai/generate-question/route.ts",
  ]) {
    assert.ok(
      source(relPath).includes("resolveEffectiveGenerationPlan("),
      `${relPath} must resolve the plan via the single-tier resolver`,
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

  // 모델 기본값: 문제생성 두 티어 모두 flash3.
  const atlasSrc = source("src/lib/atlas-ai.ts");
  assert.ok(
    /ATLAS_PREMIUM_QGEN_MODEL_ID = resolveAtlasModel\(\s*\["PREMIUM_QGEN_MODEL_ID"\],\s*"google\/gemini-3-flash-preview",?\s*\)/.test(
      atlasSrc,
    ),
    "PREMIUM qgen default model must be flash3",
  );
  assert.ok(
    /ATLAS_STANDARD_QGEN_MODEL_ID = resolveAtlasModel\(\s*\["STANDARD_QGEN_MODEL_ID"\],\s*"google\/gemini-3-flash-preview",?\s*\)/.test(
      atlasSrc,
    ),
    "STANDARD qgen default model must be flash3 (dedicated constant, not the shared standard knob)",
  );
  const ladderSrc = source(
    "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts",
  );
  assert.ok(
    ladderSrc.includes(
      'DEFAULT_GRAMMAR_PREMIUM_MODEL_ID = "google/gemini-3-flash-preview"',
    ),
    "grammar ladder default model must be flash3",
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
