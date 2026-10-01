// qgen-lab 비용 원장 + 하드캡 (dev 전용, DB 0).
// 형식·파일은 .tmp-qgen-lab-2609/lib/ledger.mjs 와 동일 — 랩 서버와 mjs 스크립트가 같은
// ledger.jsonl 에 한 줄씩 append 한다: {at, phase, kind, model, costUsd, ms, ok, note?}.
// 캡은 env QGEN_LAB_CAP_USD(기본 25) — 누적이 캡 이상이면 호출 전에 거부한다.
// 구제 캡(RESCUE-SPEC §3.5): phase 에 "rescue-" 가 든 호출은 추가로 QGEN_RESCUE_CAP_USD(기본 4.5) — 집계 =
//   phase 에 "rescue-" 가 들고 at ≥ QGEN_RESCUE_SINCE(기본 2026-09-25T10:30:00+09:00)인 줄의 costUsd 합.
// 비상정지: .tmp-qgen-lab-2609/STOP 파일이 있으면 모든 신규 호출 거부(ledger.mjs 도 같은 규칙).
// 누적은 파일 크기·mtime 기준 증분 합산(수천 줄로 커져도 호출마다 전량 재파싱하지 않는다).
import fs from "node:fs";
import path from "node:path";

export const LAB_WS = path.join(process.cwd(), ".tmp-qgen-lab-2609");
export const LAB_LEDGER = path.join(LAB_WS, "ledger.jsonl");

export type LabCostKind = "gen" | "jev" | "llm-plan";

export interface LabCostEntry {
  phase: string;
  kind: LabCostKind;
  model: string;
  costUsd: number;
  ms: number;
  ok: boolean;
  note?: string;
}

/** 실험 전체 상한(USD). ledger.mjs 와 같은 env·기본값 — 호출 시점 판독. */
export function labCapUsd(): number {
  const n = Number(process.env.QGEN_LAB_CAP_USD || 25);
  return Number.isFinite(n) && n >= 0 ? n : 25;
}

export const RESCUE_PHASE_TAG = "rescue-";
const RESCUE_SINCE_DEFAULT = "2026-09-25T10:30:00+09:00";

/** 구제 실험 상한(USD) — ledger.mjs 와 같은 env·기본값. */
export function labRescueCapUsd(): number {
  const n = Number(process.env.QGEN_RESCUE_CAP_USD || 4.5);
  return Number.isFinite(n) && n >= 0 ? n : 4.5;
}

/** 구제 집계 시작 시각(epoch ms). 형식 오류면 기본값. */
export function labRescueSinceMs(): number {
  const t = Date.parse(process.env.QGEN_RESCUE_SINCE || RESCUE_SINCE_DEFAULT);
  return Number.isFinite(t) ? t : Date.parse(RESCUE_SINCE_DEFAULT);
}

export function isRescuePhase(phase: string | null | undefined): boolean {
  return typeof phase === "string" && phase.includes(RESCUE_PHASE_TAG);
}

// ── 증분 합산 캐시 ──────────────────────────────────────────────────────────
// committed = offset 앞(개행으로 끝난 완결 줄들)의 합. tail = 개행 없는 꼬리(다른 프로세스가
// 쓰는 중일 수 있음)가 JSON 으로 읽히면 그 값 — offset 은 올리지 않고 다음 증분에 다시 읽는다.
// rescue* = 같은 방식의 구제 집계(since 가 바뀌면 전량 재합산).
interface LedgerCache {
  offset: number;
  committed: number;
  tail: number;
  rescueCommitted: number;
  rescueTail: number;
  sinceMs: number;
  size: number;
  mtimeMs: number;
}

interface LineCost {
  total: number;
  rescue: number;
}

let cache: LedgerCache | null = null;

function lineCost(line: string, sinceMs: number): LineCost {
  const s = line.trim();
  if (!s) return { total: 0, rescue: 0 };
  try {
    const j = JSON.parse(s);
    const total = Number(j.costUsd) || 0;
    const at = typeof j.at === "string" ? Date.parse(j.at) : NaN;
    const rescue = isRescuePhase(j.phase) && Number.isFinite(at) && at >= sinceMs ? total : 0;
    return { total, rescue };
  } catch {
    return { total: 0, rescue: 0 };
  }
}

function sumLines(text: string, sinceMs: number): LineCost {
  const out: LineCost = { total: 0, rescue: 0 };
  for (const line of text.split("\n")) {
    const c = lineCost(line, sinceMs);
    out.total += c.total;
    out.rescue += c.rescue;
  }
  return out;
}

function readRange(start: number, end: number): Buffer {
  const len = end - start;
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(LAB_LEDGER, "r");
  try {
    let got = 0;
    while (got < len) {
      const n = fs.readSync(fd, buf, got, len - got, start + got);
      if (n <= 0) break;
      got += n;
    }
    return buf.subarray(0, got);
  } finally {
    fs.closeSync(fd);
  }
}

/** 원장 증분 합산(전체·구제). 파일이 없으면 둘 다 0. */
function ledgerTotals(): LineCost {
  const sinceMs = labRescueSinceMs();
  let st: fs.Stats;
  try {
    st = fs.statSync(LAB_LEDGER);
  } catch {
    cache = null;
    return { total: 0, rescue: 0 };
  }
  if (cache && cache.sinceMs === sinceMs && st.size === cache.size && st.mtimeMs === cache.mtimeMs) {
    return { total: cache.committed + cache.tail, rescue: cache.rescueCommitted + cache.rescueTail };
  }
  // 줄었거나(재작성) 크기는 같은데 mtime 만 바뀜, 또는 구제 시작 시각 변경 → 전량 재합산.
  if (!cache || cache.sinceMs !== sinceMs || st.size < cache.offset || st.size === cache.size) {
    cache = { offset: 0, committed: 0, tail: 0, rescueCommitted: 0, rescueTail: 0, sinceMs, size: 0, mtimeMs: 0 };
  }
  const c: LedgerCache = cache;
  if (st.size > c.offset) {
    const chunk = readRange(c.offset, st.size);
    const lastNl = chunk.lastIndexOf(0x0a);
    // 0x0a 는 UTF-8 다바이트 시퀀스에 나타나지 않으므로 바이트 경계 절단이 안전하다.
    if (lastNl >= 0) {
      const done = sumLines(chunk.subarray(0, lastNl + 1).toString("utf8"), sinceMs);
      c.committed += done.total;
      c.rescueCommitted += done.rescue;
      c.offset += lastNl + 1;
    }
    const tail = lineCost(chunk.subarray(lastNl + 1).toString("utf8"), sinceMs);
    c.tail = tail.total;
    c.rescueTail = tail.rescue;
  } else {
    c.tail = 0;
    c.rescueTail = 0;
  }
  c.size = st.size;
  c.mtimeMs = st.mtimeMs;
  return { total: c.committed + c.tail, rescue: c.rescueCommitted + c.rescueTail };
}

/** 원장 누적 지출(USD). 파일이 없으면 0. */
export function labSpentUsd(): number {
  return ledgerTotals().total;
}

/** 구제 실험 누적 지출(USD) — phase 에 "rescue-" · at ≥ QGEN_RESCUE_SINCE. */
export function labRescueSpentUsd(): number {
  return ledgerTotals().rescue;
}

/** 캡 초과면 throw — 모든 OpenRouter 호출(생성·jev·LLM 플래너) 직전에 부른다.
 *  phase 에 "rescue-" 가 들어 있으면 구제 캡도 검사한다(phase 없이 부르면 전체 캡·STOP 만). */
export function assertLabBudget(phase?: string): void {
  // 비상정지 스위치(감독 추가 26-09-25): .tmp-qgen-lab-2609/STOP 파일이 있으면 모든 신규 과금 호출 거부
  // — OpenRouter 공유 계정 잔액 소진 사고 후, 브라우저 탭 조작 없이도 배치를 멈추기 위한 장치.
  if (fs.existsSync(path.join(LAB_WS, "STOP"))) {
    throw new Error("[qgen-lab] 비상정지: .tmp-qgen-lab-2609/STOP 파일 존재 — 신규 호출 거부");
  }
  const totals = ledgerTotals();
  const cap = labCapUsd();
  if (totals.total >= cap) {
    throw new Error(
      `[qgen-lab] 비용 캡 도달: $${totals.total.toFixed(4)} >= $${cap} (env QGEN_LAB_CAP_USD)`,
    );
  }
  if (isRescuePhase(phase)) {
    const rcap = labRescueCapUsd();
    if (totals.rescue >= rcap) {
      throw new Error(
        `[qgen-lab] 구제 캡 도달: $${totals.rescue.toFixed(4)} >= $${rcap} (env QGEN_RESCUE_CAP_USD, phase ${phase})`,
      );
    }
  }
}

/** 한 호출 기록(ledger.mjs record 와 같은 줄 형식). 기록 실패는 경고만 — 생성 결과를 버리지 않는다. */
export function recordLabCost(e: LabCostEntry): void {
  const entry: LabCostEntry = {
    ...e,
    costUsd: Number.isFinite(e.costUsd) ? e.costUsd : 0,
    ms: Number.isFinite(e.ms) ? Math.round(e.ms) : 0,
  };
  try {
    fs.mkdirSync(LAB_WS, { recursive: true });
    fs.appendFileSync(
      LAB_LEDGER,
      JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n",
    );
  } catch (err) {
    console.error("[qgen-lab] 원장 기록 실패", err);
  }
}

/** OpenRouter usage → 실지출 USD. atlas-ai.ts:489-516(readAtlasCostFields) 규칙 —
 *  usage.cost 에 BYOK 면 cost_details.upstream_inference_cost 합산, 0 이하·미기재는 null. */
export function readOpenRouterCostUsd(usage: unknown): number | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  if (typeof u.cost !== "number" || !Number.isFinite(u.cost)) return null;
  let cost = u.cost;
  if (u.is_byok === true && u.cost_details && typeof u.cost_details === "object") {
    const upstream = (u.cost_details as Record<string, unknown>).upstream_inference_cost;
    if (typeof upstream === "number" && Number.isFinite(upstream)) cost += upstream;
  }
  return cost > 0 ? cost : null;
}
