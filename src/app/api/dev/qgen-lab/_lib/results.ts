// qgen-lab 실행 결과 원장 — .tmp-qgen-lab-2609/runs/<batchId ?? "adhoc">.jsonl (한 줄 = RunResult 1건),
// 클라 체감 시간은 같은 이름의 .client.jsonl. DB 0 — 분석 스크립트가 이 파일들을 직접 읽는다.
import fs from "node:fs";
import path from "node:path";

import type { ClientTiming, RunResult, RunStatus } from "@/lib/qgen-lab/types";
import { LAB_WS } from "./ledger";

export const RUNS_DIR = path.join(LAB_WS, "runs");

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;

/** 배치 id 가 파일명으로 안전한가(경로 이탈 차단). */
export function isSafeBatchId(id: string): boolean {
  return ID_RE.test(id) && !id.includes("..");
}

/** null·빈값 = "adhoc". 안전하지 않은 id 는 throw(라우트가 400 으로 먼저 거른다). */
export function batchKey(batchId: string | null | undefined): string {
  if (!batchId) return "adhoc";
  if (!isSafeBatchId(batchId)) throw new Error(`[qgen-lab] 잘못된 batchId: ${batchId}`);
  return batchId;
}

function runsFile(batchId: string | null | undefined): string {
  return path.join(RUNS_DIR, `${batchKey(batchId)}.jsonl`);
}

function clientFile(batchId: string | null | undefined): string {
  return path.join(RUNS_DIR, `${batchKey(batchId)}.client.jsonl`);
}

function readJsonl<T>(file: string): T[] {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s) as T);
    } catch {
      /* 쓰는 중인 꼬리 줄 등 — 건너뜀 */
    }
  }
  return out;
}

/** RunResult 1건 append. 반환 = 기록한 파일 경로. */
export function appendRunResult(r: RunResult): string {
  const file = runsFile(r.batchId);
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.appendFileSync(file, JSON.stringify(r) + "\n");
  return file;
}

export function readRunResults(batchId: string | null | undefined): RunResult[] {
  return readJsonl<RunResult>(runsFile(batchId));
}

export function findRunResult(batchId: string | null | undefined, runId: string): RunResult | null {
  const all = readRunResults(batchId);
  for (let i = all.length - 1; i >= 0; i--) if (all[i].runId === runId) return all[i];
  return null;
}

export interface ClientTimingRecord extends ClientTiming {
  at: string;
  batchId: string | null;
}

export function appendClientTiming(batchId: string | null | undefined, t: ClientTiming): void {
  const rec: ClientTimingRecord = { at: new Date().toISOString(), batchId: batchId || null, ...t };
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.appendFileSync(clientFile(batchId), JSON.stringify(rec) + "\n");
}

export function readClientTimings(batchId: string | null | undefined): ClientTimingRecord[] {
  return readJsonl<ClientTimingRecord>(clientFile(batchId));
}

/** GET /runs 요약 행(요약 필드만 — 원문·문항 본문 제외). */
export interface RunSummary {
  runId: string;
  armId: string;
  passageId: string;
  rep: number;
  status: RunStatus;
  startedAt: string;
  totalMs: number;
  attempts: number;
  costUsd: number;
  failReason: string | null;
  /** 최종 문항 정답 라벨("(C)") — 문항이 없으면 null. */
  answerLabel: string | null;
  /** 클라 체감 완료 시간(client-timing 이 기록됐을 때만). */
  clientMs: number | null;
}

export function summarizeRun(r: RunResult, clientMs: number | null = null): RunSummary {
  return {
    runId: r.runId,
    armId: r.armId,
    passageId: r.passageId,
    rep: r.rep,
    status: r.status,
    startedAt: r.startedAt,
    totalMs: r.totalMs,
    attempts: r.attempts.length,
    costUsd: r.cost.totalUsd,
    failReason: r.failReason,
    answerLabel: r.question?.answer ?? null,
    clientMs,
  };
}

export function listRunSummaries(batchId: string | null | undefined): RunSummary[] {
  const clientMs = new Map<string, number>();
  for (const t of readClientTimings(batchId)) {
    if (typeof t.clickToDoneMs === "number") clientMs.set(t.runId, t.clickToDoneMs);
  }
  return readRunResults(batchId).map((r) => summarizeRun(r, clientMs.get(r.runId) ?? null));
}
