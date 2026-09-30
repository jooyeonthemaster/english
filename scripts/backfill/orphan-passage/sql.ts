// ============================================================================
// orphan-passage / sql — 계획 → 실행할 SQL 문(매개변수·기대 행 수)과 되돌리기 문. 순수.
// 모든 쓰기는 「지금도 계획 때 상태인가」를 WHERE 로 다시 확인한다(낙관적 가드):
//   재연결  passageId IS NULL · deletedAt IS NULL · 학원 일치
//   원문 보관 passageId IS NULL · md5(structuredData) = 계획 때 값 · 학원 일치
// 기대 행 수와 다르면 apply 가 트랜잭션 전체를 되돌린다. updatedAt 은 건드리지 않는다(데이터 복구 — 사용자 편집 아님).
// 승인 게이트: 0단계는 status ready 일 때만, 재연결 검토 대기(relinkReview)·2단계는 검토본에서 approved:true 인 것만.
// 단계 선택(stages, GA-1): 고른 단계의 연산만 만든다 — 0단계 = 0단계 재연결 + 승인된 stage 0 검토 대기(잡 없음, GA-2),
//   1단계 = 1단계 재연결 + 승인된 stage 1 검토 대기 + (includeJobs 면) 생성 잡, 2단계 = 승인된 원문 보관.
// ============================================================================
import { ALL_STAGES, type PendingRelinkItem, type Plan, type RelinkItem, type RelinkJobItem, type SourcePassageItem, type Stage } from "./plan";

export type SqlOp = { label: string; sql: string; params: unknown[]; expectRows: number };

export type UndoEntry = {
  table: "questions" | "workbench_ai_jobs";
  id: string;
  column: "passageId" | "structuredData";
  before: unknown;
  after: unknown;
  undo: SqlOp;
};

function relinkOp(i: RelinkItem): SqlOp {
  const reviewed = i.evidence === "no-evidence" ? " (reviewed)" : "";
  return {
    label: `stage${i.stage} relink question ${i.questionId} → ${i.toPassageId}${reviewed}`,
    sql: `UPDATE questions SET "passageId" = $1 WHERE id = $2 AND "passageId" IS NULL AND "deletedAt" IS NULL AND "academyId" = $3`,
    params: [i.toPassageId, i.questionId, i.academyId],
    expectRows: 1,
  };
}

function relinkJobOp(j: RelinkJobItem): SqlOp {
  return {
    label: `stage${j.stage} relink job ${j.jobId} (${j.domain}) → ${j.toPassageId}`,
    sql: `UPDATE workbench_ai_jobs SET "passageId" = $1 WHERE id = $2 AND "passageId" IS NULL AND "academyId" = $3 AND result->>'passageId' = $4`,
    params: [j.toPassageId, j.jobId, j.academyId, j.deletedPassageId],
    expectRows: 1,
  };
}

/** jsonb 로 넣을 값: 객체 → JSON 텍스트, JSON 문자열로 저장된 값(jsonb string) → 그 문자열을 JSON 인코딩. */
export function jsonbParam(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function sourcePassageOp(i: SourcePassageItem): SqlOp {
  return {
    label: `stage2 _sourcePassage ${i.questionId} (${i.source}, ${i.contentChars}자)`,
    sql:
      `UPDATE questions SET "structuredData" = $1::jsonb WHERE id = $2 AND "passageId" IS NULL ` +
      `AND md5(coalesce("structuredData"::text, '')) = $3 AND "academyId" = $4`,
    params: [jsonbParam(i.after.structuredData), i.questionId, i.before.structuredDataMd5, i.academyId],
    expectRows: 1,
  };
}

type OpsOptions = { academyId: string; includeJobs: boolean; stages?: readonly Stage[] };

/** 검토 대기 재연결 중 적용할 것: 고른 단계 · approved:true 이고, 0단계 항목이면 0단계가 ready 일 때만. */
function approvedPendingRelinks(plan: Plan, inScope: (a: string) => boolean, stage: 0 | 1): PendingRelinkItem[] {
  return (plan.relinkReview?.items ?? []).filter(
    (i) => i.stage === stage && inScope(i.academyId) && i.approved === true && (i.stage === 1 || plan.stage0.status === "ready"),
  );
}

/** 고른 단계의 재연결 문항(0단계 ready 항목 · 승인된 검토 대기 포함) */
function relinksFor(plan: Plan, inScope: (a: string) => boolean, on: ReadonlySet<Stage>): RelinkItem[] {
  return [
    ...(on.has(0) && plan.stage0.status === "ready" ? plan.stage0.items.filter((i) => inScope(i.academyId)) : []),
    ...(on.has(0) ? approvedPendingRelinks(plan, inScope, 0) : []),
    ...(on.has(1) ? plan.stage1.items.filter((i) => inScope(i.academyId)) : []),
    ...(on.has(1) ? approvedPendingRelinks(plan, inScope, 1) : []),
  ];
}

/**
 * 적용할 연산 목록. 0단계는 status ready 일 때만, 재연결 검토 대기·2단계는 검토본에서 approved:true 인 것만,
 * 잡 재연결은 1단계 · includeJobs 일 때만(0단계는 잡을 잇지 않는다 — GA-2). academyId · stages 로 범위를 한 번 더 자른다.
 */
export function buildOps(plan: Plan, opts: OpsOptions): SqlOp[] {
  const on = new Set(opts.stages ?? ALL_STAGES);
  const inScope = (a: string) => a === opts.academyId;
  const ops: SqlOp[] = relinksFor(plan, inScope, on).map(relinkOp);
  if (on.has(1) && opts.includeJobs) ops.push(...plan.stage1.jobs.filter((j) => inScope(j.academyId)).map(relinkJobOp));
  if (on.has(2)) ops.push(...plan.stage2.items.filter((i) => inScope(i.academyId) && i.approved === true).map(sourcePassageOp));
  return ops;
}

/** 되돌리기: 적용 결과(after)일 때만 before 로 되돌린다. */
export function buildUndo(plan: Plan, opts: OpsOptions): UndoEntry[] {
  const out: UndoEntry[] = [];
  const on = new Set(opts.stages ?? ALL_STAGES);
  const inScope = (a: string) => a === opts.academyId;
  const relinks = relinksFor(plan, inScope, on);
  for (const i of relinks) {
    out.push({
      table: "questions",
      id: i.questionId,
      column: "passageId",
      before: null,
      after: i.toPassageId,
      undo: {
        label: `undo relink ${i.questionId}`,
        sql: `UPDATE questions SET "passageId" = NULL WHERE id = $1 AND "passageId" = $2`,
        params: [i.questionId, i.toPassageId],
        expectRows: 1,
      },
    });
  }
  if (on.has(1) && opts.includeJobs) {
    const jobs = plan.stage1.jobs.filter((j) => inScope(j.academyId));
    for (const j of jobs) {
      out.push({
        table: "workbench_ai_jobs",
        id: j.jobId,
        column: "passageId",
        before: null,
        after: j.toPassageId,
        undo: {
          label: `undo relink job ${j.jobId}`,
          sql: `UPDATE workbench_ai_jobs SET "passageId" = NULL WHERE id = $1 AND "passageId" = $2`,
          params: [j.jobId, j.toPassageId],
          expectRows: 1,
        },
      });
    }
  }
  for (const i of on.has(2) ? plan.stage2.items.filter((x) => inScope(x.academyId) && x.approved === true) : []) {
    out.push({
      table: "questions",
      id: i.questionId,
      column: "structuredData",
      before: i.before.structuredData,
      after: i.after.structuredData,
      undo: {
        label: `undo _sourcePassage ${i.questionId}`,
        sql:
          `UPDATE questions SET "structuredData" = $1::jsonb WHERE id = $2 ` +
          `AND md5(coalesce("structuredData"::text, '')) = md5(coalesce($3::jsonb::text, ''))`,
        params: [jsonbParam(i.before.structuredData), i.questionId, jsonbParam(i.after.structuredData)],
        expectRows: 1,
      },
    });
  }
  return out;
}

/** 사람이 읽을 SQL 미리보기(매개변수는 주석으로, 긴 JSON 은 줄임). */
export function renderSql(ops: readonly SqlOp[]): string {
  const show = (v: unknown) => {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s === undefined ? "NULL" : s.length > 160 ? `${s.slice(0, 157)}…(${s.length}자)` : s;
  };
  return ops
    .map((op) => `-- ${op.label} (expect ${op.expectRows})\n${op.sql};\n--   params: ${op.params.map(show).join(" | ")}`)
    .join("\n");
}

/** SQL 리터럴(작은따옴표 이스케이프). jsonb 매개변수는 이미 JSON 텍스트다 — 문의 `$n::jsonb` 가 형을 붙인다. */
export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * 사람이 그대로 읽고(승인용) 필요하면 psql 로 돌릴 수 있는 한 덩어리 — DO 블록 하나(= 한 트랜잭션)에서 문마다
 * ROW_COUNT 가 기대와 다르면 예외로 전부 되돌린다. 정식 경로는 CLI --apply(해시 가드 · 되돌리기 파일 선기록)다.
 */
const DO_TAG = "$orphan_backfill$";
export function renderLiteralSql(ops: readonly SqlOp[], title: string): string {
  const body = ops.map((op) => {
    // 한 번에 치환한다 — 넣은 리터럴(지문 본문 등) 안의 「$3」 같은 글자가 다시 치환되지 않게.
    const sql = op.sql.replace(/\$(\d+)/g, (_m, n: string) => sqlLiteral(op.params[Number(n) - 1]));
    if (sql.includes(DO_TAG)) throw new Error(`literal SQL: 값에 DO 블록 구분자 ${DO_TAG} 가 들어 있다 — ${op.label}`);
    const label = op.label.replace(/'/g, "''").replace(/%/g, "%%");
    return `  -- ${op.label}\n  ${sql};\n  GET DIAGNOSTICS n = ROW_COUNT;\n  IF n <> ${op.expectRows} THEN RAISE EXCEPTION '${label}: % row(s), expected ${op.expectRows}', n; END IF;`;
  });
  return [
    `-- ${title}`,
    `-- ${ops.length} statement(s) · one DO block = one transaction (any row-count mismatch rolls back everything)`,
    `DO ${DO_TAG}`, "DECLARE n integer;", "BEGIN", ...body, `END ${DO_TAG};`, "",
  ].join("\n");
}
