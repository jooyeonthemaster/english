// 난이도 기반 티어 픽스처 (26-08-18) — API 0콜.
// resolveEffectiveGenerationPlan(requested, difficulty): KILLER→PREMIUM(2배), 그 외→STANDARD.
// 요청 플랜 무시·단일상품 클램프 우회·킬스위치(QGEN_DIFFICULTY_TIER=off) 종전 규칙 복귀.
import {
  QUESTION_GENERATION_PLANS,
  getQuestionGenerationCreditCost,
  planForDifficulty,
  resolveEffectiveGenerationPlan,
} from "../src/lib/question-generation-plans";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// 1) planForDifficulty
check("KILLER → PREMIUM", planForDifficulty("KILLER") === "PREMIUM");
check("killer(소문자) → PREMIUM", planForDifficulty(" killer ") === "PREMIUM");
check("INTERMEDIATE → STANDARD", planForDifficulty("INTERMEDIATE") === "STANDARD");
check("BASIC → STANDARD", planForDifficulty("BASIC") === "STANDARD");
check("undefined → STANDARD", planForDifficulty(undefined) === "STANDARD");
check("쓰레기값 → STANDARD", planForDifficulty(42) === "STANDARD");

// 2) resolveEffectiveGenerationPlan — 요청 플랜 무시
delete process.env.QGEN_DIFFICULTY_TIER;
check("요청 PREMIUM + 중급 → STANDARD (플랜 무시)", resolveEffectiveGenerationPlan("PREMIUM", "INTERMEDIATE") === "STANDARD");
check("요청 STANDARD + KILLER → PREMIUM", resolveEffectiveGenerationPlan("STANDARD", "KILLER") === "PREMIUM");
check("요청 없음 + KILLER → PREMIUM", resolveEffectiveGenerationPlan(undefined, "KILLER") === "PREMIUM");
check("난이도 미전달 → STANDARD", resolveEffectiveGenerationPlan("PREMIUM") === "STANDARD");

// 3) 단일상품 클램프 우회 — 프로덕션 env(on)에서도 KILLER 2배
const prevSingle = process.env.QUESTION_GENERATION_SINGLE_TIER;
delete process.env.QUESTION_GENERATION_SINGLE_TIER; // = on
check("단일상품 on 이어도 KILLER → PREMIUM", resolveEffectiveGenerationPlan("STANDARD", "KILLER") === "PREMIUM");
process.env.QUESTION_GENERATION_SINGLE_TIER = "off";
check("단일상품 off + 중급 → STANDARD", resolveEffectiveGenerationPlan("PREMIUM", "BASIC") === "STANDARD");
if (prevSingle === undefined) delete process.env.QUESTION_GENERATION_SINGLE_TIER;
else process.env.QUESTION_GENERATION_SINGLE_TIER = prevSingle;

// 4) 킬스위치 — 종전 규칙(요청 플랜 + 단일상품 클램프)
process.env.QGEN_DIFFICULTY_TIER = "off";
process.env.QUESTION_GENERATION_SINGLE_TIER = "off";
const legacy = resolveEffectiveGenerationPlan("PREMIUM", "BASIC");
check("킬스위치 off: 요청 PREMIUM 존중(플래그 의존)", legacy === "PREMIUM" || legacy === "STANDARD");
check("킬스위치 off: KILLER 도 요청 플랜 따름", resolveEffectiveGenerationPlan("STANDARD", "KILLER") === "STANDARD");
delete process.env.QGEN_DIFFICULTY_TIER;
if (prevSingle === undefined) delete process.env.QUESTION_GENERATION_SINGLE_TIER;
else process.env.QUESTION_GENERATION_SINGLE_TIER = prevSingle;

// 5) 요금
check("PREMIUM 배수 2", QUESTION_GENERATION_PLANS.PREMIUM.creditMultiplier === 2);
check("KILLER 요금 = 2배", getQuestionGenerationCreditCost(2, resolveEffectiveGenerationPlan(null, "KILLER")) === 4);
check("중급 요금 = 1배", getQuestionGenerationCreditCost(2, resolveEffectiveGenerationPlan("PREMIUM", "INTERMEDIATE")) === 2);
check("라벨: PREMIUM shortLabel 킬러", QUESTION_GENERATION_PLANS.PREMIUM.shortLabel === "킬러");

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
