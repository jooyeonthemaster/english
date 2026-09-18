// ============================================================================
// 수집 히트 파싱·정화 — /api/collect 본체(ingest.ts)의 입력 계층.
// 계약: docs/analytics/analytics-spec.md §3.2, §3.4
//
// 저장 전 마지막 관문이다 — 여기서 걸러지지 않은 값은 그대로 DB 에 남는다(I3).
// ============================================================================

import "server-only";
import type { Prisma } from "@prisma/client";
import { areaOfPath, clip, isAdminPath, isValidClientId, maskSensitivePath, normalizePath } from "./sanitize";

const MAX_HITS = 30;
const DAY_MS = 86_400_000;
const MAX_ENGAGED_DELTA_MS = 30 * 60_000;
const MAX_PAGE_ENGAGED_MS = 6 * 3_600_000;

export type PvHit = { t: "pv"; id: string; p: string; ti: string | null; pp: string | null; ts: number; masked: boolean };
export type EvHit = { t: "ev"; id: string; n: string; p: string; pr: Prisma.InputJsonValue | null; ts: number };
export type EngHit = { t: "eng"; id: string; p: string; ms: number; sc: number | null; d: number; ts: number };
export type HbHit = { t: "hb"; p: string; d: number; ts: number };
export type Hit = PvHit | EvHit | EngHit | HbHit;

export function clampTs(ts: unknown, now: number): number {
  const n = typeof ts === "number" && Number.isFinite(ts) ? ts : now;
  return Math.min(Math.max(n, now - DAY_MS), now);
}

export function intIn(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(Math.max(Math.round(v), min), max);
}

function cleanPath(raw: unknown): { path: string; masked: boolean } | null {
  const p = normalizePath(raw);
  if (!p || isAdminPath(p)) return null;
  const path = maskSensitivePath(p);
  return { path, masked: path !== p };
}

/** 토큰이 가려진 경로·학생/학부모/드릴 영역은 제목을 저장하지 않는다(제목에 학원·시험지·학생명이 들어온다 — SEC-6). */
const TITLE_BLOCKED_AREAS = new Set(["student", "parent", "drill"]);
export function titleOf(h: PvHit): string | null {
  if (h.masked) return null;
  const area = areaOfPath(h.p);
  return area && TITLE_BLOCKED_AREAS.has(area) ? null : h.ti;
}

const EVENT_NAME_RE = /^[a-z0-9][a-z0-9_:.-]{0,59}$/i;

export function parseHits(raw: unknown, now: number): { hits: Hit[]; acks: string[] } {
  if (!Array.isArray(raw)) return { hits: [], acks: [] };
  const out: Hit[] = [];
  const acks: string[] = [];
  for (const h of raw.slice(0, MAX_HITS)) {
    if (!h || typeof h !== "object") continue;
    const o = h as Record<string, unknown>;
    if (o.t === "ack") {
      if (isValidClientId(o.id)) acks.push(o.id);
      continue;
    }
    const c = cleanPath(o.p);
    if (!c) continue;
    const p = c.path;
    const ts = clampTs(o.ts, now);
    switch (o.t) {
      case "pv":
        if (!isValidClientId(o.id)) continue;
        out.push({ t: "pv", id: o.id, p, ti: clip(o.ti, 300), pp: o.pp ? cleanPath(o.pp)?.path ?? null : null, ts, masked: c.masked });
        break;
      case "ev": {
        if (!isValidClientId(o.id) || typeof o.n !== "string" || !EVENT_NAME_RE.test(o.n)) continue;
        let pr: Prisma.InputJsonValue | null = null;
        if (o.pr && typeof o.pr === "object" && !Array.isArray(o.pr)) {
          try {
            const s = JSON.stringify(o.pr);
            if (s.length <= 2000) pr = JSON.parse(s) as Prisma.InputJsonValue;
          } catch {
            pr = null;
          }
        }
        out.push({ t: "ev", id: o.id, n: o.n, p, pr, ts });
        break;
      }
      case "eng":
        if (!isValidClientId(o.id)) continue;
        out.push({
          t: "eng",
          id: o.id,
          p,
          ms: intIn(o.ms, 0, MAX_PAGE_ENGAGED_MS) ?? 0,
          sc: intIn(o.sc, 0, 100),
          d: intIn(o.d, 0, MAX_ENGAGED_DELTA_MS) ?? 0,
          ts,
        });
        break;
      case "hb":
        out.push({ t: "hb", p, d: intIn(o.d, 0, MAX_ENGAGED_DELTA_MS) ?? 0, ts });
        break;
    }
  }
  return { hits: out, acks };
}

