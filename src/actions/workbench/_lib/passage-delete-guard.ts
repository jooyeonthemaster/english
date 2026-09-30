// ============================================================================
// 지문 삭제 가드 — 지문을 지워도 그 지문으로 만든 문항이 조용히 고아가 되지 않게 한다.
//
// 배경(docs/customers/eastim-print-hwpx-2609.md, 계약 docs/EXAM-PAPER-MODEL.md §5):
//   questions.passageId 외래키는 ON DELETE SET NULL 이다. 지문을 물리 삭제하면
//   「source」 흐름 문항(주제·제목·요지·내용일치·요약 등)은 발문과 선지만 남아
//   웹·인쇄·HWPX·DOCX 전부에서 지문이 사라진다(플랫폼 전체 978문항 실측).
//
// 정책(막지 않는다):
//   (a) 학원 범위 강제 — 호출자 학원의 지문만 계획에 들어간다(IDOR 차단).
//   (b) 같은 학원에 정규화 전문이 **완전히 같은** 지문이 있으면, SET NULL 로 끊길
//       참조(문항·생성 잡·세트 기본 지문·교사 프롬프트·튜터 AI 로그)를 그쪽으로 옮긴다.
//   (c) 없으면 연결된 문항(휴지통 포함)마다 structuredData._sourcePassage 에
//       {passageId, title, content, detachedAt} 원문을 보관한 뒤 삭제한다.
//   (d) 감사 이벤트(PASSAGE_DELETE)는 호출자가 buildPassageDeleteAuditEvents 로 남긴다.
//   외래키는 그대로(SET NULL). RESTRICT 참조(튜터 수업 등)가 있으면 DB 가 어차피
//   거부하므로 미리 걸러 「삭제하지 않음」으로 보고한다.
//
// 이 모듈은 prisma 를 import 하지 않는다 — DB 접근은 PassageDeleteStore 포트로만 한다.
// 실제 구현은 ./passage-delete-store.ts, 단위 테스트는 가짜 스토어를 꽂는다.
// ============================================================================

// 타입·상수·스토어 포트는 ./passage-delete-types.ts (500줄 규칙으로 분리 — 이 모듈이 재수출).
import type {
  PassageRow,
  RelinkCounts,
  PassageDeleteStore,
  SourcePassageSnapshot,
  SnapshotMergeMode,
  PassageDeletionPlanItem,
  PassageDeletionPlan,
  PassageDeletionOutcome,
  PassageDeletionBlocked,
  PassageDeletionResult,
} from "./passage-delete-types";
export {
  RESTRICT_RELATIONS,
  RESTRICT_RELATION_LABELS,
} from "./passage-delete-types";
export type {
  PassageRow,
  RestrictRelation,
  PassageCascadeCounts,
  RelinkCounts,
  PassageDeleteStore,
  SourcePassageSnapshot,
  SnapshotMergeMode,
  PassageDeletionPlanItem,
  PassageDeletionPlan,
  PassageDeletionOutcome,
  PassageDeletionBlocked,
  PassageDeletionResult,
} from "./passage-delete-types";

export const PASSAGE_DELETE_EVENT_TYPE = "PASSAGE_DELETE";
/** 대량 삭제 대비 명시적 트랜잭션 한도(청크 하나 기준). */
export const PASSAGE_DELETE_TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 } as const;
/** 트랜잭션 하나에 담는 지문 수. 지문당 문항은 최대 210개(26-09-29 실측). */
export const PASSAGE_DELETE_CHUNK_SIZE = 20;

// ─── 정규화·동일 판정 ─────────────────────────────────────────────────────────

/**
 * 동일 지문 판정용 정규화: 공백 문자열(\s — 줄바꿈·탭·NBSP 포함)을 공백 하나로 접고
 * 앞뒤를 자른다. 그 밖의 글자(대소문자·문장부호·유니코드 형태)는 손대지 않는다.
 */
export function normalizePassageContent(content: unknown): string {
  if (typeof content !== "string") return "";
  return content.replace(/\s+/g, " ").trim();
}

/** 정규화 전문이 완전히 같을 때만 true. 빈 지문끼리는 같다고 보지 않는다. */
export function isSamePassageContent(a: unknown, b: unknown): boolean {
  const na = normalizePassageContent(a);
  return na.length > 0 && na === normalizePassageContent(b);
}

// ─── 동일 지문(옮겨 연결 대상) 선택 ─────────────────────────────────────────────

/**
 * 후보 중 정규화 전문이 완전히 같은 같은 학원 지문을 고른다(가장 먼저 만든 것).
 * 자기 자신과 이번에 함께 지우는 지문(excludeIds)은 대상이 될 수 없다.
 */
export function chooseRelinkTarget(
  passage: PassageRow,
  candidates: readonly PassageRow[],
  excludeIds: ReadonlySet<string>,
): PassageRow | null {
  const matches = candidates.filter(
    (c) =>
      c.id !== passage.id &&
      !excludeIds.has(c.id) &&
      c.academyId === passage.academyId &&
      isSamePassageContent(passage.content, c.content),
  );
  matches.sort((a, b) => {
    const dt = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (dt !== 0) return dt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return matches[0] ?? null;
}

// ─── structuredData 원문 보관 병합 ────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 입력을 변형하지 않는다. 기존 _sourcePassage 는 이번 지문으로 덮어쓴다. */
export function mergeSourcePassageSnapshot(
  structuredData: unknown,
  snapshot: SourcePassageSnapshot,
): { value: unknown; mode: SnapshotMergeMode } {
  if (structuredData === null || structuredData === undefined) {
    return { value: { _sourcePassage: snapshot }, mode: "empty" };
  }
  if (isPlainObject(structuredData)) {
    return { value: { ...structuredData, _sourcePassage: snapshot }, mode: "object" };
  }
  if (typeof structuredData === "string") {
    const trimmed = structuredData.trim();
    if (trimmed === "") {
      return { value: JSON.stringify({ _sourcePassage: snapshot }), mode: "json-string" };
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed === null) {
        return { value: JSON.stringify({ _sourcePassage: snapshot }), mode: "json-string" };
      }
      if (isPlainObject(parsed)) {
        return {
          value: JSON.stringify({ ...parsed, _sourcePassage: snapshot }),
          mode: "json-string",
        };
      }
    } catch {
      // 파싱 불가 — 아래에서 그대로 둔다.
    }
  }
  return { value: structuredData, mode: "unsupported" };
}

// ─── 계획(영향 범위) ──────────────────────────────────────────────────────────

export function sanitizePassageIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const v = id.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export async function planPassageDeletion(
  store: PassageDeleteStore,
  academyId: string,
  ids: unknown,
  opts: { lock: boolean; excludeFromRelink?: readonly string[] },
): Promise<PassageDeletionPlan> {
  if (typeof academyId !== "string" || academyId.length === 0) {
    throw new Error("학원 정보가 없어 지문을 삭제할 수 없습니다.");
  }
  const requestedIds = sanitizePassageIds(ids);
  if (requestedIds.length === 0) return { requestedIds, items: [], notFoundIds: [] };

  const requestedSet = new Set(requestedIds);
  const loaded = await store.loadPassages(academyId, requestedIds, { lock: opts.lock });
  // 방어 2중: 스토어가 잘못 구현돼도 다른 학원 행은 여기서 버린다.
  const scoped = loaded.filter(
    (p) => p.academyId === academyId && requestedSet.has(p.id),
  );
  const scopedIds = scoped.map((p) => p.id);
  const scopedSet = new Set(scopedIds);
  const notFoundIds = requestedIds.filter((id) => !scopedSet.has(id));
  if (scopedIds.length === 0) return { requestedIds, items: [], notFoundIds };

  const excludeSet = new Set<string>([...scopedIds, ...(opts.excludeFromRelink ?? [])]);
  const reads = [
    () => store.countQuestions(scopedIds),
    () => store.findExamUsage(scopedIds),
    () => store.countRestrictRefs(scopedIds),
    () => store.countCascadeRefs(scopedIds),
    () =>
      store.findDuplicateCandidates(academyId, scopedIds, [...excludeSet], { lock: opts.lock }),
  ] as const;
  // 영향 조회(lock:false, 트랜잭션 밖)는 병렬로 — 확인창 대기 시간을 줄인다.
  // 실행 경로(lock:true)는 트랜잭션 연결 하나에서 차례로 돈다.
  const [counts, examRows, restrictRows, cascadeRows, candidateRows] = opts.lock
    ? [
        await reads[0](),
        await reads[1](),
        await reads[2](),
        await reads[3](),
        await reads[4](),
      ]
    : await Promise.all([reads[0](), reads[1](), reads[2](), reads[3](), reads[4]()]);

  const items = scoped.map((passage): PassageDeletionPlanItem => {
    const c = counts.find((r) => r.passageId === passage.id);
    const exams = new Map<string, string>();
    for (const r of examRows) {
      if (r.passageId === passage.id) exams.set(r.examId, r.examTitle);
    }
    const blockedBy = restrictRows
      .filter((r) => r.passageId === passage.id && r.count > 0)
      .map((r) => ({ relation: r.relation, count: r.count }));
    const cascadeRow = cascadeRows.find((r) => r.passageId === passage.id);
    const candidates = candidateRows
      .filter((r) => r.forId === passage.id)
      .map((r) => r.candidate);
    return {
      passage,
      liveQuestionCount: c?.live ?? 0,
      trashedQuestionCount: c?.trashed ?? 0,
      exams: [...exams].map(([id, title]) => ({ id, title })),
      relinkTarget: chooseRelinkTarget(passage, candidates, excludeSet),
      blockedBy,
      cascade: {
        hasAnalysis: cascadeRow?.hasAnalysis ?? false,
        reports: cascadeRow?.reports ?? 0,
        webtoons: cascadeRow?.webtoons ?? 0,
        notes: cascadeRow?.notes ?? 0,
        tutorConversations: cascadeRow?.tutorConversations ?? 0,
      },
    };
  });
  return { requestedIds, items, notFoundIds };
}

// ─── 실행 ─────────────────────────────────────────────────────────────────────

export class PassageDeleteConflictError extends Error {
  constructor(passageId: string) {
    super(`지문 삭제 중 상태가 바뀌었습니다(${passageId}). 다시 시도해 주세요.`);
    this.name = "PassageDeleteConflictError";
  }
}

/** 트랜잭션 하나 안에서 부른다(스토어가 그 트랜잭션에 묶여 있어야 한다). */
export async function executePassageDeletion(
  store: PassageDeleteStore,
  academyId: string,
  ids: unknown,
  opts: { now?: Date; excludeFromRelink?: readonly string[] } = {},
): Promise<PassageDeletionResult> {
  const now = opts.now ?? new Date();
  const plan = await planPassageDeletion(store, academyId, ids, {
    lock: true,
    excludeFromRelink: opts.excludeFromRelink,
  });
  const outcomes: PassageDeletionOutcome[] = [];
  const blocked: PassageDeletionBlocked[] = [];

  for (const item of plan.items) {
    const { passage } = item;
    if (item.blockedBy.length > 0) {
      blocked.push({ passageId: passage.id, title: passage.title, blockedBy: item.blockedBy });
      continue;
    }
    let mode: PassageDeletionOutcome["mode"] = "plain";
    let moved: RelinkCounts | null = null;
    let snapshot: Record<SnapshotMergeMode, number> | null = null;
    const detachedQuestionIds: string[] = [];
    const unsupportedQuestionIds: string[] = [];

    if (item.relinkTarget) {
      moved = await store.relinkRefs(passage.id, item.relinkTarget.id);
      mode = "relinked";
    } else {
      const linked = await store.loadLinkedQuestions(passage.id);
      if (linked.length > 0) {
        mode = "detached";
        snapshot = { object: 0, empty: 0, "json-string": 0, unsupported: 0 };
        const snap: SourcePassageSnapshot = {
          passageId: passage.id,
          title: passage.title,
          content: passage.content,
          detachedAt: now.toISOString(),
        };
        for (const q of linked) {
          const merged = mergeSourcePassageSnapshot(q.structuredData, snap);
          snapshot[merged.mode] += 1;
          if (merged.mode === "unsupported") {
            unsupportedQuestionIds.push(q.id);
            continue;
          }
          await store.writeQuestionStructuredData(q.id, merged.value);
          detachedQuestionIds.push(q.id);
        }
      }
    }

    const deleted = await store.deletePassage(academyId, passage.id);
    if (deleted !== 1) throw new PassageDeleteConflictError(passage.id);

    outcomes.push({
      passageId: passage.id,
      title: passage.title,
      mode,
      relinkTarget: item.relinkTarget
        ? { id: item.relinkTarget.id, title: item.relinkTarget.title }
        : null,
      liveQuestionCount: item.liveQuestionCount,
      trashedQuestionCount: item.trashedQuestionCount,
      examIds: item.exams.map((e) => e.id),
      moved,
      snapshot,
      detachedQuestionIds,
      unsupportedQuestionIds,
      sourceContent: mode === "detached" ? passage.content : null,
    });
  }
  return { outcomes, blocked, notFoundIds: plan.notFoundIds };
}

// ─── 청크 실행기 ──────────────────────────────────────────────────────────────

export type PassageDeleteTxRunner = <T>(
  fn: (store: PassageDeleteStore) => Promise<T>,
) => Promise<T>;

export interface ChunkedPassageDeletionResult extends PassageDeletionResult {
  requested: number;
  /** 청크 하나가 실패하면 거기서 멈춘다(앞 청크는 이미 커밋). */
  error: unknown | null;
}

/**
 * 청크마다 트랜잭션 하나. 청크 안은 원자적(옮기기·원문 보관·삭제가 함께 커밋/롤백).
 * 옮겨 연결 대상에서는 요청 전체를 뺀다 — 뒤 청크에서 지울 지문으로 옮기지 않게.
 */
export async function runChunkedPassageDeletion(
  runTx: PassageDeleteTxRunner,
  academyId: string,
  ids: unknown,
  opts: { now?: Date; chunkSize?: number } = {},
): Promise<ChunkedPassageDeletionResult> {
  const all = sanitizePassageIds(ids);
  const size = Math.max(1, opts.chunkSize ?? PASSAGE_DELETE_CHUNK_SIZE);
  const acc: ChunkedPassageDeletionResult = {
    requested: all.length,
    outcomes: [],
    blocked: [],
    notFoundIds: [],
    error: null,
  };
  for (let i = 0; i < all.length; i += size) {
    const chunk = all.slice(i, i + size);
    try {
      const r = await runTx((store) =>
        executePassageDeletion(store, academyId, chunk, {
          now: opts.now,
          excludeFromRelink: all,
        }),
      );
      acc.outcomes.push(...r.outcomes);
      acc.blocked.push(...r.blocked);
      acc.notFoundIds.push(...r.notFoundIds);
    } catch (error) {
      acc.error = error;
      break;
    }
  }
  return acc;
}

// ─── 감사 이벤트 ──────────────────────────────────────────────────────────────

/** @/lib/app-events 의 AppEventInput 과 같은 모양(서버 모듈 import 를 피하려고 복제). */
export interface PassageDeleteAuditEvent {
  academyId: string;
  actorType: "STAFF";
  actorId: string | null;
  eventType: typeof PASSAGE_DELETE_EVENT_TYPE;
  resourceType: "PASSAGE";
  resourceId: string;
  metadata: Record<string, unknown>;
}

export function buildPassageDeleteAuditEvents(
  result: PassageDeletionResult,
  ctx: { academyId: string; actorId: string | null; via: string },
): PassageDeleteAuditEvent[] {
  return result.outcomes.map((o) => ({
    academyId: ctx.academyId,
    actorType: "STAFF" as const,
    actorId: ctx.actorId,
    eventType: PASSAGE_DELETE_EVENT_TYPE,
    resourceType: "PASSAGE" as const,
    resourceId: o.passageId,
    metadata: {
      via: ctx.via,
      title: o.title,
      mode: o.mode,
      relinkTargetId: o.relinkTarget?.id ?? null,
      liveQuestionCount: o.liveQuestionCount,
      trashedQuestionCount: o.trashedQuestionCount,
      examIds: o.examIds,
      moved: o.moved,
      snapshot: o.snapshot,
      // 원문 보관(detached)이면 원문과 대상 문항 id 를 감사 기록에도 남긴다. 문항 편집
      // 경로가 structuredData 를 다시 만들며 _sourcePassage 를 잃어도 여기서 복구한다.
      ...(o.mode === "detached"
        ? {
            detachedQuestionIds: o.detachedQuestionIds,
            sourcePassage: { title: o.title, content: o.sourceContent },
          }
        : {}),
      ...(o.unsupportedQuestionIds.length > 0
        ? { unsupportedQuestionIds: o.unsupportedQuestionIds }
        : {}),
    },
  }));
}

// ─── 오류 문구 ────────────────────────────────────────────────────────────────

/** Prisma 오류(PrismaClientKnownRequestError 모양)에서 code·meta.code 를 꺼낸다. */
function prismaCodes(error: unknown): { code: string; dbCode: string } {
  if (typeof error !== "object" || error === null) return { code: "", dbCode: "" };
  const e = error as { code?: unknown; meta?: unknown };
  const meta = typeof e.meta === "object" && e.meta !== null ? (e.meta as { code?: unknown }) : {};
  return {
    code: typeof e.code === "string" ? e.code : "",
    dbCode: typeof meta.code === "string" ? meta.code : "",
  };
}

/**
 * 삭제 실패를 사용자 문구로.
 * - 교착·직렬화 실패(P2034, SQLSTATE 40P01/40001): 서로를 옮겨 연결 대상으로 삼는
 *   삭제 두 건이 겹치면 DB 가 한쪽을 되돌린다 → 다시 시도하면 된다.
 * - P2003: 아직 모르는 RESTRICT 참조(옮겨 연결 대상은 FOR KEY SHARE 로 잠가 두므로
 *   대상이 사라져서 나는 P2003 은 없다).
 */
export function describePassageDeleteError(error: unknown): string {
  const { code, dbCode } = prismaCodes(error);
  const message = error instanceof Error ? error.message : "";
  if (
    code === "P2034" ||
    dbCode === "40P01" ||
    dbCode === "40001" ||
    /deadlock detected|could not serialize/i.test(message)
  ) {
    return "다른 곳에서 동시에 진행 중인 지문 삭제와 겹쳐 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  }
  if (code === "P2003" || dbCode === "23503") {
    return "다른 기능(수업·학습 기록 등)에 연결된 지문이 있어 삭제하지 못했습니다.";
  }
  return message || "지문 삭제 중 오류가 발생했습니다.";
}
