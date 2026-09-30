// ============================================================================
// orphan-passage / apply — 연산 실행기(쓰기). 이 모듈은 CLI 의 --apply 경로에서만 불린다.
// 한 트랜잭션 안에서 연산마다 영향 행 수를 확인하고, 하나라도 기대와 다르면 예외 → 전부 되돌린다.
// 실행기는 주입받는다(단위 테스트는 가짜 실행기로 가드·롤백 규칙을 확인한다).
// ============================================================================
import type { Plan, Stage } from "./plan";
import { PLAN_VERSION, planHash, sameStages, stagesLabel } from "./plan";
import type { SqlOp } from "./sql";

export type Executor = (sql: string, params: unknown[]) => Promise<number>;

export class ApplyMismatchError extends Error {
  constructor(
    readonly op: SqlOp,
    readonly affected: number,
  ) {
    super(`apply aborted: ${op.label} affected ${affected} row(s), expected ${op.expectRows}`);
  }
}

export async function executeOps(exec: Executor, ops: readonly SqlOp[]): Promise<{ applied: number }> {
  let applied = 0;
  for (const op of ops) {
    const affected = await exec(op.sql, op.params);
    if (affected !== op.expectRows) throw new ApplyMismatchError(op, affected);
    applied += 1;
  }
  return { applied };
}

/**
 * 검토본에서는 **승인 표시(approved)만** 가져오고, 쓸 내용은 방금 DB 로 다시 만든 계획(해시가 같음을 확인한 것)을 쓴다.
 * 검토본 JSON 의 content·after 를 손으로 고쳐도 그것이 DB 에 들어가지 않는다.
 */
export function mergeApprovals(recomputed: Plan, reviewed: Plan): Plan {
  const approved = new Set(reviewed.stage2.items.filter((i) => i.approved === true).map((i) => i.questionId));
  // 재연결 검토 대기는 (문항, 대상 지문) 짝으로 승인한다 — 재계산 뒤 대상이 바뀌었으면 승인이 따라가지 않는다.
  const relinkKey = (i: { questionId: string; toPassageId: string }) => `${i.questionId}>${i.toPassageId}`;
  const approvedRelinks = new Set((reviewed.relinkReview?.items ?? []).filter((i) => i.approved === true).map(relinkKey));
  return {
    ...recomputed,
    relinkReview: { items: recomputed.relinkReview.items.map((i) => ({ ...i, approved: approvedRelinks.has(relinkKey(i)) })) },
    stage2: { items: recomputed.stage2.items.map((i) => ({ ...i, approved: approved.has(i.questionId) })) },
  };
}

/**
 * --apply 전제 조건(순수). 하나라도 어기면 쓰지 않는다:
 *  - --apply 와 --academy 가 함께 있어야 한다(학원 하나씩).
 *  - --stages 가 있어야 하고(적용 단위를 말로 고른다), 검토본의 적용 범위(applyScope.stages — dry-run --stages 가
 *    적음)와 같아야 한다 — 검토하지 않은 단계는 쓰지 않는다(GA-1: 「0단계 14문항만 승인」이 1단계를 끌고 오지 않게).
 *  - --plan <검토본> 이 있어야 하고, 같은 계획 형식(planVersion)이며, 그 계획의 범위가 같은 학원이어야 한다.
 *  - 검토본 파일이 온전해야 한다(전 단계 해시 · 적용 범위 해시가 파일 안 값과 같음 — 승인 표시 외 수정 금지).
 *  - 지금 DB 로 다시 만든 계획의 **적용 범위 해시**가 검토본과 같아야 한다(그 단계의 데이터가 바뀌면 거부 —
 *    다른 단계의 변동은 이 적용을 막지 않는다).
 *  - 0단계만 고른 적용(--stages 0)이면 재계산한 0단계가 ready 여야 한다(다른 학원은 not-in-scope — 쓸 것이 없다).
 *    여러 단계를 고른 경우 0단계가 ready 가 아니면 0단계 몫이 비어 있을 뿐이다(검토 때 ready 였다면 해시가 이미 거부).
 */
export function validateApplyRequest(input: {
  apply: boolean;
  academyId: string | null;
  stages: readonly Stage[] | null;
  reviewedPlan: Plan | null;
  recomputed: Plan | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.apply) return { ok: false, reason: "dry-run(기본) — --apply 없음" };
  if (!input.academyId) return { ok: false, reason: "--apply 는 --academy <id> 와 함께만 쓴다" };
  if (!input.stages || input.stages.length === 0) return { ok: false, reason: "--stages <0|1|2|0,1|all> 이 필요하다(적용 단위를 명시)" };
  if (!input.reviewedPlan) return { ok: false, reason: "--plan <검토한 계획 JSON> 이 필요하다" };
  if (input.reviewedPlan.planVersion !== PLAN_VERSION) {
    return { ok: false, reason: `계획 형식이 다르다(검토본 planVersion ${String(input.reviewedPlan.planVersion)} ≠ ${PLAN_VERSION}) — dry-run 을 다시 돌려 검토할 것` };
  }
  if (input.reviewedPlan.scope.academyId !== input.academyId) {
    return { ok: false, reason: "검토본의 범위(scope.academyId)가 --academy 와 다르다" };
  }
  const scope = input.reviewedPlan.applyScope;
  if (!scope || !Array.isArray(scope.stages) || typeof scope.hash !== "string") {
    return { ok: false, reason: "검토본에 적용 범위(applyScope)가 없다 — dry-run --stages 로 다시 만들어 검토할 것" };
  }
  if (!sameStages(scope.stages, input.stages)) {
    return { ok: false, reason: `적용 범위가 검토본과 다르다(검토본 ${stagesLabel(scope.stages)} ≠ --stages ${stagesLabel(input.stages)}) — 검토하지 않은 단계는 적용하지 않는다` };
  }
  if (!input.recomputed) return { ok: false, reason: "계획을 다시 만들지 못했다" };
  if (planHash(input.reviewedPlan) !== input.reviewedPlan.planHash || planHash(input.reviewedPlan, scope.stages) !== scope.hash) {
    return { ok: false, reason: "검토본의 쓰기 내용이 파일 안 해시와 다르다(승인 표시 외 수정 금지)" };
  }
  if (planHash(input.recomputed, scope.stages) !== scope.hash) {
    return { ok: false, reason: `검토 뒤 데이터가 바뀌었다(적용 범위 ${stagesLabel(scope.stages)} 해시 불일치) — dry-run 을 다시 돌려 검토할 것` };
  }
  if (sameStages(scope.stages, [0]) && input.recomputed.stage0.status !== "ready") {
    return { ok: false, reason: `0단계가 ready 가 아니다(${input.recomputed.stage0.status}) — 적용할 0단계가 없다` };
  }
  return { ok: true };
}
