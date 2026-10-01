// 구제 생성 시점 전략(icl · cx · icl+cx) 공용 흐름 — 사후 수리·교체 없음(감독 축소판 26-09-25).
//   초안 1콜(프로덕션 md v2 파싱·게이트) → 게이트 이슈가 있으면 프로덕션식 재생성 1회
//   (같은 메시지·extras 에 피드백 블록을 마지막 user 턴 끝에 덧붙임, 시드 = labRegenSeed) → 채택 = 프로덕션 규칙(재생성 이슈 수 ≤ 1차).
// 재생성 허가 = 대조군(K-L6-low·K-L6-medium)과 같은 프로덕션 조건(벽까지 30s 이상) + 비용 가드(maxUsd, §6 추정치).
//   §6 의 소프트 마감(45s)은 기본으로 재생성에 걸지 않는다 — low 초안(~25s)+재생성 추정(25s)이 45s 를 넘어 사실상
//   "<20s 일 때만 재생성" 게이트가 되고(비평 반영으로 금지), 대조군보다 gate_fail 이 구조적으로 높아진다.
//   params.regenSoftDeadline === true 면 스펙 §6 문자 그대로 소프트 마감도 검사한다.
// 재생성 콜의 전송 실패는 프로덕션처럼 실행 오류로 전파된다(1차 초안으로 조용히 대체하지 않는다).
import type { MdGrammarQuestion } from "@/lib/md-qgen/parser";
import type { LabChatMessage } from "../../stream-once";
import { BUDGET_EST } from "../../strategies/context";
import type { StrategyContext } from "../../strategies/index";
import { adoptByProductionRule, regenFeedback, type DraftOutcome } from "../draft";

export interface GenFlowOpts {
  /** ICL 여러 턴(없으면 프로덕션 v2 단일 user 턴). */
  messages?: LabChatMessage[] | null;
  /** 프롬프트(또는 마지막 user 턴) 뒤 블록 — cx 카드·거울줄. */
  extraBlocks?: string[] | null;
  /** 재생성 비용 추정(§6 — 평범 초안 draft, ICL 초안 iclDraft). */
  regenUsd: number;
}

export interface GenFlowResult {
  adopted: DraftOutcome;
  first: DraftOutcome;
  regen: DraftOutcome | null;
  /** 게이트 실패로 끝나도 기록할 마지막 파싱본. */
  lastQuestion: MdGrammarQuestion | null;
}

export async function draftThenProductionRegen(ctx: StrategyContext, o: GenFlowOpts): Promise<GenFlowResult> {
  const first = await ctx.rec.stage("draft#1", () =>
    ctx.draft({ stage: "draft#1", kind: "gen", messages: o.messages ?? null, extraBlocks: o.extraBlocks ?? null }),
  );
  let lastQuestion = first.parsed.question;
  let adopted = first;
  let regen: DraftOutcome | null = null;
  const issues = first.parsed.gateIssues;
  if (issues.length > 0) {
    const softDeadline = ctx.params.regenSoftDeadline === true;
    const gate = ctx.budget.allow({ usd: o.regenUsd, stage: "regen", ...(softDeadline ? { ms: BUDGET_EST.ms.regen } : {}) });
    if (gate.ok) {
      const feedback = regenFeedback(issues);
      ctx.emit({ t: "retry", reason: feedback.slice(0, 200) });
      const r = await ctx.rec.stage("regen", () =>
        ctx.draft({
          stage: "regen",
          kind: "regen",
          messages: o.messages ?? null,
          extraBlocks: o.extraBlocks ?? null,
          feedback,
          seed: ctx.regenSeed,
        }),
      );
      regen = r;
      if (r.parsed.question) lastQuestion = r.parsed.question;
      adopted = adoptByProductionRule(first, r);
    }
  }
  if (adopted.parsed.gateIssues.length > 0) ctx.rec.flag("gate-issues");
  return { adopted, first, regen, lastQuestion };
}
