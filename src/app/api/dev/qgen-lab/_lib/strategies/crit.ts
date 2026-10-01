// crit — 비평 → luna 수정(RESCUE-SPEC §5.4, RLAIF 흉내). 부품 조합만 한다(rescue/* 가 실제 일).
//   1. 초안 = 프로덕션 v2 프롬프트 luna 1콜(K-L6-low 와 바이트 동일) → 게이트. 이슈가 있으면 프로덕션 재생성 1회(채택 규칙도 프로덕션).
//   2. 비평(게이트 통과본만): 미끼 T1 린트 + DG(≤4문장/요청), 정답 R-lint + D7. 결함이 없으면 그대로 출하(추가 콜 0).
//   3. 메뉴: 결함 미끼 → picker 상위 6(DG<0.45), 결함 정답 → 깊은 정답 ≤3(D7 ≥0.8·R-lint 무결·코드 거리 ≥5). 둘 다 비면 출하.
//   4. 수정 콜: luna 소형 1회(stage "crit", strict json_schema, 4000토큰, 30s) — 예산(§6) 안이면 경과 시간과 무관하게 허용.
//   5. 코드 적용 → 렌더 → 게이트(통과본 탐색) → 채택 = 프로덕션 규칙(수정본 이슈 ≤ 초안 이슈일 때만). rep 폴백은 없다.
import { adoptByProductionRule, regenFeedback } from "../rescue/draft";
import { buildAnswerMenu, type AnswerMenuItem } from "../rescue/answer-menu";
import { diagnosisRecord, finalDiagnosis, searchCleanRevision } from "../rescue/crit-finish";
import { buildRevisePrompt, CRIT_SCHEMA, parseReviseOutput, planChanges } from "../rescue/crit-revise";
import { critiqueItem, memoAnswerDist, type Critique } from "../rescue/critique";
import { buildDecoyMenu, type DecoyMenuItem } from "../rescue/decoy-picker";
import { FAMILY_CAT } from "../rescue/lint-answer";
import { answerOf, fromParsed, type ItemModel } from "../rescue/item-model";
import { BUDGET_EST, type StrategyFn, type StrategyResult } from "./index";

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export const runCrit: StrategyFn = async (ctx) => {
  const P = ctx.params;
  const rec = ctx.rec;
  type Adopted = StrategyResult["adopted"];
  // ── 1. 초안(+프로덕션 재생성) ──
  const first = await rec.stage("draft", () => ctx.draft({ stage: "draft#1", kind: "gen" }));
  let cur: Adopted = first;
  let lastQuestion = first.parsed.question;
  if (first.parsed.gateIssues.length > 0) {
    // 프로덕션 재생성 조건(이슈>0 · 벽 30s) + 비용 가드. 소프트 마감은 걸지 않는다 — 대조군(K-L6-low)과 같은 재생성 기회.
    if (ctx.budget.allow({ usd: BUDGET_EST.usd.draft, stage: "regen" }).ok) {
      const feedback = regenFeedback(first.parsed.gateIssues);
      ctx.emit({ t: "retry", reason: feedback.slice(0, 200) });
      try {
        const regen = await rec.stage("regen", () => ctx.draft({ stage: "regen", kind: "regen", feedback, seed: ctx.regenSeed }));
        if (regen.parsed.question) lastQuestion = regen.parsed.question;
        cur = adoptByProductionRule<Adopted>(first, regen);
      } catch (err) {
        rec.note(`regen 실패: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`);
      }
    }
  }
  const done = (fallback: string | null, crit: Critique | null, item: ItemModel | null): StrategyResult => {
    if (fallback) rec.fallback(fallback);
    const memo = item ? memoAnswerDist(cur.record.text, answerOf(item)) : null;
    const fd = item ? finalDiagnosis(item, crit, { decoy: [], answer: [] }, memo, cur.parsed.gateIssues) : null;
    if (fd) {
      for (const f of fd.residualFlags) rec.flag(f);
      rec.patch({ provenance: fd.provenance });
    } else if (cur.parsed.gateIssues.length > 0) rec.flag("gate");
    return { adopted: cur, lastQuestion, labChecks: fd?.labChecks };
  };
  if (cur.parsed.gateIssues.length > 0 || !cur.parsed.question) return done("draft-gate-fail", null, null);
  const draftItem = fromParsed(cur.parsed.question, ctx.passage.text);
  if (!draftItem) return done("item-model", null, null);
  const memoDist = memoAnswerDist(cur.record.text, answerOf(draftItem));

  // ── 2. 비평 ──
  const crit = await rec.stage("critique", async (s) => {
    const c = await critiqueItem(ctx, draftItem, {
      stage: "critique",
      thetaSwap: num(P.thetaSwap, 0.65),
      maxDecoyFlags: num(P.maxDecoyFlags, 2),
      pBrokeMin: num(P.pBrokeMin, 0.3),
      memoDist,
    });
    s.note(c.flags.join(" ") || "결함 없음");
    return c;
  });
  rec.patch({ diagnosis: diagnosisRecord(crit) });
  const flaggedDecoys = crit.decoys.filter((d) => d.flagged).map((d) => d.mark);
  if (flaggedDecoys.length === 0 && !crit.answer.flagged) return done(null, crit, draftItem);

  // ── 3. 메뉴 ──
  const [decoyMenu, answerMenu] = await rec.stage("menu", async (s) => {
    const [dm, am] = await Promise.all([
      flaggedDecoys.length
        ? buildDecoyMenu(ctx, { passageId: ctx.passage.id, item: draftItem, flagged: flaggedDecoys, answerCat: FAMILY_CAT[crit.answer.analysis.fam], stage: "menu:decoy", size: num(P.menuSize, 6), dgAsk: num(P.dgAsk, 12) })
        : Promise.resolve({ menu: [] as DecoyMenuItem[], funnel: {} }),
      crit.answer.flagged
        ? buildAnswerMenu(ctx, { passageId: ctx.passage.id, item: draftItem, stage: "menu:answer", size: num(P.answerMenuSize, 3), d7Min: num(P.answerD7Min, 0.8) })
        : Promise.resolve({ menu: [] as AnswerMenuItem[], funnel: {} }),
    ]);
    s.note(`M=${dm.menu.length} ${JSON.stringify(dm.funnel)} A=${am.menu.length} ${JSON.stringify(am.funnel)}`);
    return [dm.menu, am.menu] as const;
  });
  if (decoyMenu.length === 0 && answerMenu.length === 0) return done("no-menu", crit, draftItem);

  // ── 4. 수정 콜 ──
  const allow = ctx.budget.allow({ usd: BUDGET_EST.usd.revise, ms: BUDGET_EST.ms.revise, stage: "crit" });
  if (!allow.ok) return done(`skip-revise: ${allow.reason}`, crit, draftItem);
  let outText: string;
  try {
    outText = await rec.stage("revise", async () => {
      const r = await ctx.llm({
        stage: "crit",
        kind: "stage",
        prompt: buildRevisePrompt(draftItem, crit, decoyMenu, answerMenu),
        gen: { maxTokens: 4000 },
        jsonSchema: CRIT_SCHEMA,
        display: "none",
        timeoutMs: 30_000,
      });
      return r.call.text;
    });
  } catch (err) {
    return done(`revise-error: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`, crit, draftItem);
  }
  const out = parseReviseOutput(outText);
  if (!out) return done("revise-parse", crit, draftItem);
  const plan = planChanges(draftItem, crit, decoyMenu, answerMenu, out);
  rec.patch({ writer: { calls: 1, templated: plan.templated } });
  rec.note(`crit keep=${plan.keeps} change=${plan.changes.map((c) => c.menuId).join("+") || "-"}${plan.rejected.length ? ` rejected=${plan.rejected.join("; ")}` : ""}`);
  if (plan.changes.length === 0) return done(null, crit, draftItem);

  // ── 5. 적용 → 렌더 → 게이트 → 채택(프로덕션 규칙) ──
  const pick = await rec.stage("apply", async (s) => {
    const p = searchCleanRevision(draftItem, plan, (t) => ctx.gate(t), "(비평 수정본)");
    s.note(p ? `${p.clean ? "clean" : "gate-fail"} tried=${p.tried} applied=${p.applied.map((c) => c.menuId).join("+")}${p.templateAll ? " template" : ""}` : "적용 없음");
    return p;
  });
  if (!pick) return done("apply-none", crit, draftItem);
  const assembled = ctx.assemble("crit-apply", pick.text);
  const adopted = adoptByProductionRule<Adopted>(cur, assembled);
  if (adopted !== assembled) return done("revision-gate-fail", crit, draftItem);
  cur = adopted;
  lastQuestion = assembled.parsed.question;
  for (const c of pick.applied) rec.repair(c.kind, c.detail);
  if (pick.templateAll) rec.patch({ writer: { calls: 1, templated: pick.applied.length } });
  const fd = finalDiagnosis(pick.item, crit, { decoy: decoyMenu, answer: answerMenu }, memoDist, []);
  for (const f of fd.residualFlags) rec.flag(f);
  rec.patch({ provenance: fd.provenance });
  return { adopted: cur, lastQuestion, labChecks: fd.labChecks };
};
