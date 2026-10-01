// 구제 전략 cx — 대조 선호 카드 + 거울 점검줄(RESCUE-SPEC §5.2, DPO 비유).
//   프롬프트 = 프로덕션 v2 단일 user 턴 + "\n\n" + CARDS_BLOCK + "\n\n" + MIRROR_LINE(draftItem extraBlocks — 프로덕션 extras 자리)
//   → 게이트 이슈면 같은 extras + 피드백 블록(extras 뒤)으로 프로덕션식 재생성 1회(flow.ts).
//   계측: 채택 원문 설계메모의 "미끼점검:" 줄 "아니오" 수 → labChecks.decoySelfCheck(비차단, 줄이 없으면 null).
import { decoySelfCheckCount, loadIclCards } from "../rescue/icl/cards";
import { draftThenProductionRegen } from "../rescue/icl/flow";
import { estimateTokens } from "../rescue/icl/render";
import { BUDGET_EST } from "./context";
import type { StrategyFn } from "./index";

export const cx: StrategyFn = async (ctx) => {
  const cards = loadIclCards();
  ctx.rec.note(`cx cards=${estimateTokens(cards.cardsBlock)}tok built=${cards.builtAt}`);
  const flow = await draftThenProductionRegen(ctx, {
    extraBlocks: [cards.cardsBlock, cards.mirrorLine],
    regenUsd: BUDGET_EST.usd.draft,
  });
  return {
    adopted: { record: flow.adopted.record, parsed: flow.adopted.parsed },
    lastQuestion: flow.lastQuestion,
    labChecks: { decoySelfCheck: decoySelfCheckCount(flow.adopted.record.text) },
  };
};
