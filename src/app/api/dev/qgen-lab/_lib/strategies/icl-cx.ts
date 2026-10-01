// 구제 전략 icl+cx — 시연(§5.1) + 대조 카드(§5.2)를 한 콜에(수술·수리 없음, 감독 축소판).
//   system = V2_CORE + ICL_NOTE + CARDS_BLOCK · 마지막 user = 대상 지문 + MIRROR_LINE · 재생성은 같은 메시지 + 피드백.
import { runIcl } from "./icl";
import type { StrategyFn } from "./index";

export const iclCx: StrategyFn = (ctx) => runIcl(ctx, true);
