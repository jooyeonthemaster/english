// qgen-lab 플래너 jev-answer-soft (팔 코드 ja) — PLANNER-SPEC §2.
// 공용 인벤토리의 정답 후보 상위 3개(자리·제안 오형·범주·p_valid)만 soft 블록으로 준다. 미끼는 모델 재량.
// 보정 근거: 자리 top-1 은 약하다(실물 hit@1 0.04~0.20) → 강제하지 않고 탈출구 문구 달린 추천 목록.
import type { PlannerPlan } from "@/lib/qgen-lab/types";
import type { PlannerFn } from "./index";
import { buildInventory, contextInventoryOptions, inventoryDebug, numParam, type Inventory } from "./inventory";
import { answerPlanSite, buildSoftBlock } from "./plan-block";

export const ANSWER_SOFT_ID = "jev-answer-soft";

/** 인벤토리 → ja 계획(순수). t0 = 계획 시작 시각(performance.now) — ms 에 인벤토리 시간 포함. */
export function planAnswerSoft(inv: Inventory, t0: number, o: { answerTop?: number } = {}): PlannerPlan {
  const answers = inv.answers.slice(0, o.answerTop ?? 3);
  if (answers.length === 0) {
    throw new Error(`${ANSWER_SOFT_ID}: D7 유효(p≥0.5) 정답 쌍 0개 — 쌍 ${inv.pairs.length}개 전부 탈락`);
  }
  return {
    plannerId: ANSWER_SOFT_ID,
    mode: "soft",
    answerCandidates: answers.map((p) => answerPlanSite(inv, p)),
    decoyCandidates: [],
    promptBlock: buildSoftBlock(inv, answers),
    ms: Math.round(performance.now() - t0),
    jevCalls: inv.stats.jevCalls,
    jevCostUsd: inv.stats.jevCostUsd,
    llmCostUsd: 0,
    llmMs: 0,
    debug: { inventory: inventoryDebug(inv) },
  };
}

export const jevAnswerSoft: PlannerFn = async (ctx) => {
  const t0 = performance.now();
  const inv = await buildInventory(ctx.passage.text, contextInventoryOptions(ctx));
  return planAnswerSoft(inv, t0, { answerTop: numParam(ctx.params, "answerTop", 1, 5) });
};
