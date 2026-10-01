// qgen-lab 플래너 jev-full-soft (팔 코드 jf) — PLANNER-SPEC §2.
// ja 블록(정답 후보 상위 3) + 미끼 인벤토리 상위 8(범주·유혹도 등급) + 「이 중 4개 추천(문장 분산·코드 다양)」, 전부 soft.
// 추천 4 = 1순위 정답 후보 문장 밖 · 문장당 1 · 같은 코드 1(부족하면 2) · 밑줄 간격 ≥3단어 greedy.
import type { PlannerPlan } from "@/lib/qgen-lab/types";
import type { PlannerFn } from "./index";
import { buildInventory, contextInventoryOptions, inventoryDebug, numParam, placeOf, type Inventory } from "./inventory";
import { pickSpread } from "./inventory-utils";
import { answerPlanSite, buildSoftBlock, decoyPlanSite } from "./plan-block";

export const FULL_SOFT_ID = "jev-full-soft";

export function planFullSoft(
  inv: Inventory,
  t0: number,
  o: { answerTop?: number; decoyShow?: number; recommend?: number } = {},
): PlannerPlan {
  const answers = inv.answers.slice(0, o.answerTop ?? 3);
  if (answers.length === 0) {
    throw new Error(`${FULL_SOFT_ID}: D7 유효(p≥0.5) 정답 쌍 0개 — 쌍 ${inv.pairs.length}개 전부 탈락`);
  }
  const list = inv.decoys.slice(0, o.decoyShow ?? 8);
  const top = answers[0];
  const recommended = pickSpread(inv.passage, list, (d) => placeOf(d.site), (d) => d.site.code, {
    n: o.recommend ?? 4,
    avoidSentences: new Set([top.site.c.sentenceIdx]),
    perSentence: 1,
    perCode: 1,
    perCodeRelaxed: 2,
    fixed: [placeOf(top.site)],
  });
  return {
    plannerId: FULL_SOFT_ID,
    mode: "soft",
    answerCandidates: answers.map((p) => answerPlanSite(inv, p)),
    decoyCandidates: list.map((d) => decoyPlanSite(inv, d, { recommended: recommended.includes(d) ? 1 : 0 })),
    promptBlock: buildSoftBlock(inv, answers, { list, recommended }),
    ms: Math.round(performance.now() - t0),
    jevCalls: inv.stats.jevCalls,
    jevCostUsd: inv.stats.jevCostUsd,
    llmCostUsd: 0,
    llmMs: 0,
    debug: { inventory: inventoryDebug(inv), recommendedCount: recommended.length },
  };
}

export const jevFullSoft: PlannerFn = async (ctx) => {
  const t0 = performance.now();
  const inv = await buildInventory(ctx.passage.text, contextInventoryOptions(ctx));
  return planFullSoft(inv, t0, {
    answerTop: numParam(ctx.params, "answerTop", 1, 5),
    decoyShow: numParam(ctx.params, "decoyShow", 4, 12),
    recommend: numParam(ctx.params, "recommend", 1, 4),
  });
};
