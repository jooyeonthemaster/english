// qgen-lab API 클라이언트(브라우저 전용) — /api/dev/qgen-lab/{meta,batches,runs,client-timing}.
// 응답 형상은 LAB-SPEC §4 기준이되, 래핑 여부({batches:[…]} vs […])는 방어적으로 받는다.

import { ALL_ARMS } from "@/lib/qgen-lab/arms";
import type {
  ArmConfig,
  BatchManifest,
  ClientTiming,
  LabPassage,
  RunResult,
  RunStatus,
} from "@/lib/qgen-lab/types";

export const LAB_API = "/api/dev/qgen-lab";

/** /meta 의 지문 — 금표준은 정답 번호만 내려온다(원문 frags 는 서버에 둔다). */
export type MetaPassage = Omit<LabPassage, "gold"> & { gold: { ansNo: number } | null };

export interface LabMeta {
  arms: ArmConfig[];
  passages: MetaPassage[];
  spentUsd: number | null;
  capUsd: number | null;
  switches: Record<string, unknown>;
}

export interface BatchListItem {
  id: string;
  title: string | null;
}

/** /runs 요약 1행(라이브 결과도 같은 모양으로 접는다). */
export interface RunSummary {
  runId: string;
  batchId: string | null;
  armId: string;
  passageId: string;
  rep: number;
  status: RunStatus;
  totalMs: number | null;
  attempts: number | null;
  costUsd: number | null;
  failReason: string | null;
  answerLabel: string | null;
  clientMs: number | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text) as Obj;
    const msg = str(j.error) ?? str(j.message) ?? str(j.details);
    if (msg) return `HTTP ${res.status}: ${msg}`;
  } catch {
    /* HTML(404 페이지 등) */
  }
  if (res.status === 404) return "HTTP 404 — 라우트가 없거나 프로덕션 가드에 막혔습니다";
  if (res.status === 401) return "HTTP 401 — 스태프 세션이 필요합니다";
  return `HTTP ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 160)}`;
}

export async function labErrorOf(res: Response): Promise<string> {
  return readError(res);
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${LAB_API}${path}`, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

function arrayIn(raw: unknown, keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (isObj(raw)) {
    for (const k of keys) {
      const v = raw[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

export async function fetchMeta(): Promise<LabMeta> {
  const raw = await getJson("/meta");
  const o = isObj(raw) ? raw : {};
  const arms = Array.isArray(o.arms) && o.arms.length ? (o.arms as ArmConfig[]) : ALL_ARMS;
  const passages = arrayIn(o.passages, []).filter(isObj).map((p) => {
    const gold = isObj(p.gold) && num(p.gold.ansNo) != null ? { ansNo: num(p.gold.ansNo)! } : null;
    const text = typeof p.text === "string" ? p.text : "";
    return {
      id: String(p.id ?? ""),
      label: String(p.label ?? p.id ?? ""),
      source: (p.source === "gichul" || p.source === "prod" ? p.source : "custom") as LabPassage["source"],
      text,
      words: num(p.words) ?? countWords(text),
      gold,
    } satisfies MetaPassage;
  });
  return {
    arms,
    passages: passages.filter((p) => p.id),
    spentUsd: num(o.spentUsd),
    capUsd: num(o.capUsd),
    switches: isObj(o.switches) ? o.switches : {},
  };
}

export async function fetchBatchList(): Promise<BatchListItem[]> {
  const raw = await getJson("/batches");
  return arrayIn(raw, ["batches", "items", "ids", "manifests"])
    .map((x): BatchListItem | null => {
      if (typeof x === "string") return { id: x.replace(/\.json$/i, ""), title: null };
      if (isObj(x)) {
        const id = str(x.id) ?? str(x.name);
        return id ? { id: id.replace(/\.json$/i, ""), title: str(x.title) } : null;
      }
      return null;
    })
    .filter((x): x is BatchListItem => x !== null);
}

export async function fetchBatch(id: string): Promise<BatchManifest> {
  const raw = await getJson(`/batches?id=${encodeURIComponent(id)}`);
  const m = isObj(raw) && isObj(raw.manifest) ? raw.manifest : isObj(raw) && isObj(raw.batch) ? raw.batch : raw;
  if (!isObj(m) || !Array.isArray(m.armIds) || !Array.isArray(m.passageIds)) {
    throw new Error(`배치 매니페스트 형식이 아닙니다: ${id}`);
  }
  return {
    id: str(m.id) ?? id,
    title: str(m.title) ?? id,
    armIds: m.armIds.map(String),
    passageIds: m.passageIds.map(String),
    reps: Math.max(1, Math.floor(num(m.reps) ?? 1)),
    concurrency: Math.max(1, Math.floor(num(m.concurrency) ?? 2)),
    order: m.order === "by-arm" ? "by-arm" : "interleave",
  };
}

function normalizeSummary(x: Obj, batchId: string | null): RunSummary | null {
  const runId = str(x.runId);
  const armId = str(x.armId);
  const passageId = str(x.passageId);
  if (!runId || !armId || !passageId) return null;
  const status: RunStatus = x.status === "ok" || x.status === "gate_fail" ? x.status : "error";
  const cost = isObj(x.cost) ? num(x.cost.totalUsd) : null;
  const question = isObj(x.question) ? x.question : null;
  const answers = question && Array.isArray(question.answers) ? question.answers.map(String).join(",") : null;
  return {
    runId,
    batchId: str(x.batchId) ?? batchId,
    armId,
    passageId,
    rep: num(x.rep) ?? 0,
    status,
    totalMs: num(x.totalMs),
    attempts: Array.isArray(x.attempts)
      ? x.attempts.length
      : num(x.attempts) ?? num(x.attemptCount) ?? num(x.attemptsN),
    costUsd: cost ?? num(x.costUsd) ?? num(x.totalUsd) ?? num(x["cost.totalUsd"]),
    failReason: str(x.failReason),
    answerLabel: str(x.answerLabel) ?? str(x.answer) ?? answers ?? (question ? str(question.answer) : null),
    clientMs: num(x.clientMs) ?? num(x.clickToDoneMs) ?? (isObj(x.client) ? num(x.client.clickToDoneMs) : null),
  };
}

export async function fetchRunSummaries(batchId: string): Promise<RunSummary[]> {
  // "adhoc" 은 batchId 생략과 같은 원장(runs/adhoc.jsonl).
  const raw = await getJson(batchId === "adhoc" ? "/runs" : `/runs?batchId=${encodeURIComponent(batchId)}`);
  return arrayIn(raw, ["runs", "items", "results"])
    .filter(isObj)
    .map((x) => normalizeSummary(x, batchId))
    .filter((x): x is RunSummary => x !== null);
}

/** 서버 원장의 RunResult 전체 1건(GET /runs?batchId=&runId=). 이 세션에서 돌리지 않은 기록의 상세용. */
export async function fetchRunResult(batchId: string | null, runId: string): Promise<RunResult> {
  const qs = new URLSearchParams({ runId });
  if (batchId) qs.set("batchId", batchId);
  const raw = await getJson(`/runs?${qs.toString()}`);
  if (!isObj(raw) || typeof raw.runId !== "string") throw new Error(`실행 기록 형식이 아닙니다: ${runId}`);
  return raw as unknown as RunResult;
}

/** 체감 시간 기록 — batchId 로 runs/<batchId>.client.jsonl 을 고른다(ClientTiming 계약엔 batchId 가 없어 곁들인다, null = adhoc). */
export async function postClientTiming(t: ClientTiming, batchId: string | null): Promise<void> {
  await fetch(`${LAB_API}/client-timing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...t, batchId: batchId || null }),
  }).catch(() => undefined);
}

export function answerLabelOf(r: RunResult): string | null {
  const q = r.question;
  if (!q) return null;
  return q.answers?.length ? q.answers.join(",") : q.answer || null;
}

export function summarizeResult(r: RunResult, clientMs: number | null): RunSummary {
  return {
    runId: r.runId,
    batchId: r.batchId,
    armId: r.armId,
    passageId: r.passageId,
    rep: r.rep,
    status: r.status,
    totalMs: r.totalMs,
    attempts: r.attempts.length,
    costUsd: r.cost?.totalUsd ?? null,
    failReason: r.failReason,
    answerLabel: answerLabelOf(r),
    clientMs,
  };
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** 직접 입력 지문 id — 서버 getLabPassage 의 custom-<sha1 8> 규약에 맞춘다(비보안 컨텍스트면 "custom"). */
export async function customPassageId(text: string): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return "custom";
    const buf = await subtle.digest("SHA-1", new TextEncoder().encode(text));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `custom-${hex.slice(0, 8)}`;
  } catch {
    return "custom";
  }
}
