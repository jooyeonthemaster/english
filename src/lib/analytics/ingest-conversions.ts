// ============================================================================
// 전환(가입·결제) 판정·발사 확인 — /api/collect 수집 본체(ingest.ts)에서만 쓴다.
// 계약: docs/analytics/analytics-spec.md §6, §14 D17
//
// D17: firedAt 은 **픽셀 발사 확인 시각**이다. insert 시 NULL 로 두고,
//      firedAt 이 NULL 이며 7일 이내인 전환은 다음 페이지뷰 응답에 다시 실어 보낸다.
//      클라이언트가 {t:"ack", id:<conversionId>} 를 보내면 그때 firedAt 을 채운다.
// 비용: 로그인 사용자의 매 페이지뷰마다 조회하지 않는다 — 세션 단위 캐시로 창을 둔다(L4-4).
// ============================================================================

import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;
/** 같은 세션에서 전환 조회를 다시 하기까지의 최소 간격(원장 1명이 페이지를 넘길 때마다 조회하지 않는다). */
export const DETECT_INTERVAL_MS = 60_000;
const SESSION_STATE_TTL_MS = 30 * 60_000;
const SESSION_STATE_MAX = 1_000;

export interface ConversionInstruction {
  type: "signup" | "purchase";
  value?: number;
  /** 원본 참조 id(충전 건 id 등) — 픽셀 중복 발사 방지 키 */
  id?: string;
  /** analytics_conversions.id — 클라이언트가 이 값으로 발사 확인(ack)을 보낸다 */
  cid?: string;
}

interface SessionState {
  academyId: string | null;
  role: string | null;
  /** 이 시각 전에는 전환 조회를 하지 않는다 */
  nextDetectAt: number;
  touchedAt: number;
}

/** 인스턴스 수명 캐시 — 세션당 계정 연결·전환 조회 반복을 줄인다(정확성에 영향 없음: 없으면 DB 를 본다). */
const SESSION_STATE = new Map<string, SessionState>();

export function getSessionState(sessionId: string): SessionState | null {
  const s = SESSION_STATE.get(sessionId);
  if (!s) return null;
  if (Date.now() - s.touchedAt > SESSION_STATE_TTL_MS) {
    SESSION_STATE.delete(sessionId);
    return null;
  }
  return s;
}

export function setSessionState(sessionId: string, patch: Partial<SessionState>) {
  const prev = getSessionState(sessionId);
  const next: SessionState = {
    academyId: patch.academyId ?? prev?.academyId ?? null,
    role: patch.role ?? prev?.role ?? null,
    nextDetectAt: patch.nextDetectAt ?? prev?.nextDetectAt ?? 0,
    touchedAt: Date.now(),
  };
  SESSION_STATE.set(sessionId, next);
  if (SESSION_STATE.size > SESSION_STATE_MAX) {
    const oldest = SESSION_STATE.keys().next();
    if (!oldest.done) SESSION_STATE.delete(oldest.value);
  }
}

/** 이번 요청에서 전환을 조회할 차례인가(세션당 DETECT_INTERVAL_MS 에 1회). */
export function dueForDetect(sessionId: string, now: number): boolean {
  const s = getSessionState(sessionId);
  if (s && now < s.nextDetectAt) return false;
  setSessionState(sessionId, { nextDetectAt: now + DETECT_INTERVAL_MS });
  return true;
}

/** 전환 판정 + 기록(§6). firedAt 은 채우지 않는다(D17). */
export async function detectConversions(args: {
  academyId: string;
  visitorId: string;
  sessionId: string;
}): Promise<number> {
  const now = Date.now();
  let inserted = 0;

  const academy = await prisma.academy.findUnique({
    where: { id: args.academyId },
    select: { id: true, createdAt: true },
  });
  if (academy && academy.createdAt.getTime() >= now - 2 * DAY_MS) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "analytics_conversions" ("id","type","refId","academyId","visitorId","sessionId","value","occurredAt","firedAt")
      VALUES (${randomUUID()}, 'signup', ${academy.id}, ${academy.id}, ${args.visitorId}, ${args.sessionId}, 0, ${academy.createdAt}, NULL)
      ON CONFLICT ("type","refId") DO NOTHING
      RETURNING "id"`);
    inserted += rows.length;
  }

  const since = new Date(now - 7 * DAY_MS);
  const topUps = await prisma.$queryRaw<Array<{ id: string; value: number; paidAt: Date }>>(Prisma.sql`
    SELECT t."id", COALESCE(t."paidAmount", t."price")::int AS "value",
           COALESCE(t."completedAt", t."paidAt", t."createdAt") AS "paidAt"
    FROM "credit_top_ups" t
    WHERE t."academyId" = ${args.academyId}
      AND t."status" = 'COMPLETED'
      AND COALESCE(t."completedAt", t."paidAt", t."createdAt") >= ${since}
      AND NOT EXISTS (SELECT 1 FROM "analytics_conversions" c WHERE c."type" = 'purchase' AND c."refId" = t."id")
    ORDER BY 3 ASC
    LIMIT 3`);
  for (const t of topUps) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "analytics_conversions" ("id","type","refId","academyId","visitorId","sessionId","value","occurredAt","firedAt")
      VALUES (${randomUUID()}, 'purchase', ${t.id}, ${args.academyId}, ${args.visitorId}, ${args.sessionId}, ${Number(t.value)}, ${t.paidAt}, NULL)
      ON CONFLICT ("type","refId") DO NOTHING
      RETURNING "id"`);
    inserted += rows.length;
  }

  if (inserted) {
    await prisma.$executeRaw(Prisma.sql`UPDATE "analytics_sessions" SET "hasConversion" = true WHERE "id" = ${args.sessionId}`);
  }
  return inserted;
}

/**
 * 아직 발사 확인이 안 된 전환(7일 이내)을 다시 실어 보낸다(D17).
 * 방금 insert 한 건도 여기 포함되므로 지시의 단일 출처다.
 */
export async function pendingConversions(visitorId: string): Promise<ConversionInstruction[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; type: string; refId: string; value: number }>>(Prisma.sql`
    SELECT "id", "type", "refId", COALESCE("value", 0)::int AS "value"
    FROM "analytics_conversions"
    WHERE "visitorId" = ${visitorId}
      AND "firedAt" IS NULL
      AND "occurredAt" >= ${new Date(Date.now() - 7 * DAY_MS)}
    ORDER BY "occurredAt" ASC
    LIMIT 5`);
  return rows.map((r) => ({
    type: r.type === "purchase" ? "purchase" : "signup",
    value: r.type === "purchase" ? Number(r.value) : undefined,
    id: r.refId,
    cid: r.id,
  }));
}

/** 발사 확인(ack) — 같은 방문자의 미확인 전환에만 시각을 찍는다. */
export async function ackConversions(visitorId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  return prisma.$executeRaw(Prisma.sql`
    UPDATE "analytics_conversions"
    SET "firedAt" = ${new Date()}
    WHERE "id" IN (${Prisma.join(ids)}) AND "visitorId" = ${visitorId} AND "firedAt" IS NULL`);
}
