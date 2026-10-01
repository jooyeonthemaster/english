// 구제 전략 icl — 검색형 다중 시연(RESCUE-SPEC §5.1, SFT 비유). icl+cx 도 이 조합을 카드 켜고 쓴다(icl-cx.ts).
//   은행(bank.json) → 태거·검색(k=6, 쿼터·누설 차단) → 조립(system = V2_CORE + ICL_NOTE [+ CARDS], 시연 user/assistant 쌍,
//   마지막 user = 대상 지문 [+ MIRROR]) — 14k 토큰(글자/3.2) 초과면 k 를 5, 4 로 줄인다
//   → 초안 1콜 → 게이트 이슈면 같은 메시지 + 피드백으로 프로덕션식 재생성 1회(flow.ts).
// params: bank("teacher"|"self") · k(기본 6) · maxPromptTokens(기본 14000) · effort(strategyGen) · regenSoftDeadline.
import { iclBankKind, loadIclBank } from "../rescue/icl/bank";
import { decoySelfCheckCount, loadIclCards } from "../rescue/icl/cards";
import { draftThenProductionRegen } from "../rescue/icl/flow";
import { buildIclMessages, estimateTokens } from "../rescue/icl/render";
import { retrieveDemos } from "../rescue/icl/retrieve";
import { BUDGET_EST } from "./context";
import type { StrategyContext, StrategyFn, StrategyResult } from "./index";

const DEFAULT_K = 6;
const MIN_K = 4;
const DEFAULT_MAX_PROMPT_TOKENS = 14_000;

const intParam = (v: unknown, dflt: number, lo: number, hi: number): number =>
  typeof v === "number" && Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : dflt;

export async function runIcl(ctx: StrategyContext, withCards: boolean): Promise<StrategyResult> {
  const bankKind = iclBankKind(ctx.params.bank);
  const k0 = intParam(ctx.params.k, DEFAULT_K, 1, 8);
  const maxTokens = intParam(ctx.params.maxPromptTokens, DEFAULT_MAX_PROMPT_TOKENS, 2_000, 60_000);
  const assembled = await ctx.rec.stage("retrieve", async (s) => {
    const bank = loadIclBank(bankKind);
    const cards = withCards ? loadIclCards() : null;
    const target = { id: ctx.passage.id, text: ctx.passage.text };
    const kMin = Math.min(MIN_K, k0);
    for (let k = k0; ; k--) {
      const r = retrieveDemos(bank, target, { k, seed: ctx.seed });
      const messages = buildIclMessages({
        targetText: ctx.passage.text,
        demos: r.demos,
        cardsBlock: cards?.cardsBlock ?? null,
        mirrorLine: cards?.mirrorLine ?? null,
      });
      const est = estimateTokens(messages);
      if (est <= maxTokens || k <= kMin) {
        const over = est > maxTokens ? ` 초과(${maxTokens})` : "";
        const note = `k=${r.demos.length}/${k0} est=${est}tok${over} T=[${r.targetTags.join(",")}] demos=${r.demos
          .map((d) => `${d.id}(${d.family})`)
          .join(",")} excluded=${r.excluded.length}`;
        s.note(note);
        ctx.rec.note(`icl ${note}`);
        if (over) ctx.rec.flag("icl-over-budget");
        return { messages, cards };
      }
    }
  });
  const flow = await draftThenProductionRegen(ctx, { messages: assembled.messages, regenUsd: BUDGET_EST.usd.iclDraft });
  return {
    adopted: { record: flow.adopted.record, parsed: flow.adopted.parsed },
    lastQuestion: flow.lastQuestion,
    ...(withCards ? { labChecks: { decoySelfCheck: decoySelfCheckCount(flow.adopted.record.text) } } : {}),
  };
}

export const icl: StrategyFn = (ctx) => runIcl(ctx, false);
