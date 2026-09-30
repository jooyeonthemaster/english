// ============================================================================
// export-parity / simulate-plan — 백필 계획(scripts/backfill/orphan-passage-backfill 의 계획 JSON)을 **메모리에서만**
// 적용한 상태로 감사를 돌린다. 운영 DB 는 그대로(대상 지문을 SELECT 로 읽을 뿐).
//  - 0·1단계 재연결: 해당 문항의 question.passage 를 대상 지문으로 채운다(자동 항목 + 재연결 검토 대기 중 승인된 것).
//  - 2단계 원문 보관: approved:true 인 것만 structuredData 를 after 로 바꾼다.
//  - --simulate-stage2(= --simulate-review): 검토 대상 전부(재연결 검토 대기 + 2단계 후보)를 승인했다고 가정한다.
//  - 계획에 적용 범위(applyScope — dry-run --stages 가 적음)가 있으면 **그 단계만** 입힌다(26-09-30 GA-1: 0단계 전용
//    계획이면 0단계 14문항만 — 승인 단위 그대로 시뮬레이션). 없으면(옛 계획) 전 단계.
// 용도: 적용 전에 「백필 뒤 인쇄물이 웹·HWPX·DOCX 에서 같은지」와 「지문 없이 찍히던 문항이 몇 개 줄어드는지」를 본다
// (설계 F8 — 재연결로 지문이 붙는 지문 내장형 문항에서 번호 없는 원문이 다시 찍히지 않는지).
// ============================================================================
import fs from "node:fs";
import type { LoadedExam, ReadOnlyPrisma } from "./load";

type PlanLike = {
  stage0: { status: string; items: Array<{ questionId: string; toPassageId: string }> };
  stage1: { items: Array<{ questionId: string; toPassageId: string }> };
  /** planVersion 2+ — 문항별 근거 없는 재연결(검토 대기). 없으면(옛 계획) 빈 목록. */
  relinkReview?: { items: Array<{ questionId: string; toPassageId: string; stage: number; approved?: boolean }> };
  stage2: { items: Array<{ questionId: string; approved?: boolean; after: { structuredData: unknown } }> };
  /** planVersion 3+ — 이 단계만 적용 대상 */
  applyScope?: { stages: number[] };
};

/** 계획에서 입힐 재연결 · 원문 보관 고르기(순수) — 적용 범위 · 승인 · 0단계 ready 를 따른다. */
export function selectPlanWrites(plan: PlanLike, opts: { includeUnapproved?: boolean }) {
  const on = new Set(plan.applyScope?.stages ?? [0, 1, 2]);
  const all = Boolean(opts.includeUnapproved);
  const ready0 = plan.stage0.status === "ready";
  const reviewed = (plan.relinkReview?.items ?? []).filter(
    (i) => on.has(i.stage) && (all || i.approved === true) && (i.stage === 1 || ready0),
  );
  const relinks = [...(on.has(0) && ready0 ? plan.stage0.items : []), ...(on.has(1) ? plan.stage1.items : []), ...reviewed];
  const stage2 = on.has(2) ? plan.stage2.items.filter((i) => all || i.approved === true) : [];
  return { relinks, reviewed, stage2 };
}

export type PlanSimulation = {
  relinkTo: Map<string, { id: string; title: string; content: string }>;
  structuredDataOf: Map<string, unknown>;
  counts: { relinks: number; reviewedRelinks: number; sourcePassages: number };
};

export async function loadPlanSimulation(
  db: ReadOnlyPrisma,
  planPath: string,
  opts: { includeUnapproved?: boolean; includeUnapprovedStage2?: boolean },
): Promise<PlanSimulation> {
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as PlanLike;
  const { relinks, reviewed, stage2 } = selectPlanWrites(plan, { includeUnapproved: Boolean(opts.includeUnapproved ?? opts.includeUnapprovedStage2) });
  const ids = [...new Set(relinks.map((r) => r.toPassageId))];
  const passages = await db.passage.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, content: true } });
  const byId = new Map(passages.map((p) => [p.id, p]));
  const relinkTo = new Map<string, { id: string; title: string; content: string }>();
  for (const r of relinks) {
    const p = byId.get(r.toPassageId);
    if (p) relinkTo.set(r.questionId, p);
  }
  const structuredDataOf = new Map<string, unknown>();
  for (const i of stage2) structuredDataOf.set(i.questionId, i.after.structuredData);
  return {
    relinkTo,
    structuredDataOf,
    counts: { relinks: relinkTo.size, reviewedRelinks: reviewed.length, sourcePassages: structuredDataOf.size },
  };
}

/** 시험지 사본에 계획을 입힌다(원본 불변). 이미 지문이 있는 문항은 건드리지 않는다(계획은 고아만 대상). */
export function applyPlanSimulation(exam: LoadedExam, sim: PlanSimulation): LoadedExam {
  return {
    ...exam,
    questions: exam.questions.map((eq) => {
      const q = eq.question;
      const to = q.passage ? undefined : sim.relinkTo.get(q.id);
      const sd = sim.structuredDataOf.has(q.id) ? sim.structuredDataOf.get(q.id) : q.structuredData;
      if (!to && sd === q.structuredData) return eq;
      return { ...eq, question: { ...q, passage: to ? { ...to } : q.passage, structuredData: sd } };
    }),
  };
}
