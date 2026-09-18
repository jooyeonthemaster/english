// ============================================================================
// 리포트: 실시간 — 최근 5분 신호 기준 현재 접속자 + 최근 30분 흐름.
// 계약: docs/analytics/analytics-spec.md §5(실시간 = 비내부 세션 중 lastSeenAt >= now-5분), §10
//
// - 기간 파라미터(range/from/to)는 무시한다. 공용 필터·내부 트래픽 토글(sessionFilterSql)만 적용.
// - 분 버킷은 KST 'HH:MM'(I1). 빈 분은 0 으로 채운다.
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { num, sessionFilterSql, type AnalyticsQuery } from "../query";

const MINUTE_MS = 60_000;
const KST_OFFSET_MS = 9 * 3_600_000;
/** 「지금 접속 중」 판정 창 */
const ACTIVE_WINDOW_MS = 5 * MINUTE_MS;
/** 분당 추이·최근 이벤트 창 */
const RECENT_MINUTES = 30;
const ACTIVE_SESSIONS_LIMIT = 50;
const RECENT_EVENTS_LIMIT = 40;
const TOP_LIMIT = 10;

export interface RealtimeActiveSession {
  id: string;
  visitorId: string;
  startedAt: string;
  lastSeenAt: string;
  /** 세션의 마지막 경로(exitPath). 없으면 null — 화면은 entryPath 로 대체 표시 */
  currentPath: string | null;
  entryPath: string;
  pageviews: number;
  engagedMs: number;
  channel: string;
  source: string | null;
  deviceType: string | null;
  os: string | null;
  inApp: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  isNewVisitor: boolean;
  academyId: string | null;
  academyName: string | null;
}

export interface RealtimeReport {
  activeNow: number;
  activeByChannel: Array<{ channel: string; count: number }>;
  activeByDevice: Array<{ deviceType: string | null; count: number }>;
  /** 최근 30분, 분 단위(KST 'HH:MM'), 오래된 → 최신 */
  perMinute: Array<{ key: string; pageviews: number; sessions: number }>;
  activeSessions: RealtimeActiveSession[];
  /**
   * 활성 세션이 **지금 머물러 있는** 경로(exitPath, 없으면 entryPath) — 세션 수 기준.
   * 활성 세션과 같은 모집단이라 sessions 합 = activeNow(상위 10개 밖은 제외).
   * (이전 구현은 「최근 5분 페이지뷰」라 하트비트로만 살아있는 세션이 빠지고 이미 떠난 페이지가 남았다)
   */
  topPagesNow: Array<{ path: string; sessions: number }>;
  /** 활성 세션의 유입 소스 — source NULL 은 '(none)' */
  topSourcesNow: Array<{ source: string; channel: string; sessions: number }>;
  recentEvents: Array<{
    id: string;
    type: string;
    name: string | null;
    path: string;
    createdAt: string;
    channel: string;
    source: string | null;
    deviceType: string | null;
    region: string | null;
  }>;
  serverTime: string;
}

type Row = Record<string, unknown>;

function strOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

/** 분 버킷 키 목록(KST 'HH:MM') — floorMinute 포함 최근 RECENT_MINUTES 개 */
function minuteKeys(floorMinute: number): { start: Date; keys: string[] } {
  const startMs = floorMinute - (RECENT_MINUTES - 1) * MINUTE_MS;
  const keys: string[] = [];
  for (let t = startMs; t <= floorMinute; t += MINUTE_MS) {
    keys.push(new Date(t + KST_OFFSET_MS).toISOString().slice(11, 16));
  }
  return { start: new Date(startMs), keys };
}

const KST_MINUTE_KEY = Prisma.raw(`to_char((e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'), 'HH24:MI')`);

export async function getRealtimeReport(q: AnalyticsQuery): Promise<RealtimeReport> {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const activeSince = new Date(nowMs - ACTIVE_WINDOW_MS);
  const recentSince = new Date(nowMs - RECENT_MINUTES * MINUTE_MS);
  const { start: minuteStart, keys } = minuteKeys(Math.floor(nowMs / MINUTE_MS) * MINUTE_MS);

  const filter = sessionFilterSql(q);
  const activeWhere = Prisma.sql`s."lastSeenAt" >= ${activeSince} AND ${filter}`;

  const [countRows, channelRows, deviceRows, minuteRows, sessionRows, pageRows, sourceRows, eventRows] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT COUNT(*) AS n FROM "analytics_sessions" s WHERE ${activeWhere}`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT s."channel" AS channel, COUNT(*) AS n
      FROM "analytics_sessions" s WHERE ${activeWhere}
      GROUP BY 1 ORDER BY 2 DESC, 1`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT s."deviceType" AS "deviceType", COUNT(*) AS n
      FROM "analytics_sessions" s WHERE ${activeWhere}
      GROUP BY 1 ORDER BY 2 DESC, 1`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT ${KST_MINUTE_KEY} AS key,
             COUNT(*) FILTER (WHERE e."type" = 'pageview') AS pageviews,
             COUNT(DISTINCT e."sessionId") AS sessions
      FROM "analytics_events" e JOIN "analytics_sessions" s ON s."id" = e."sessionId"
      WHERE e."createdAt" >= ${minuteStart} AND ${filter}
      GROUP BY 1`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT s."id", s."visitorId", s."startedAt", s."lastSeenAt", s."exitPath", s."entryPath",
             s."pageviews", s."engagedMs", s."channel", s."source", s."deviceType", s."os", s."inApp",
             s."country", s."region", s."city", s."isNewVisitor", s."academyId", a."name" AS "academyName"
      FROM "analytics_sessions" s LEFT JOIN "academies" a ON a."id" = s."academyId"
      WHERE ${activeWhere}
      ORDER BY s."lastSeenAt" DESC
      LIMIT ${ACTIVE_SESSIONS_LIMIT}`),
    // 「지금 보는 페이지」 = 활성 세션의 현재 경로. 이벤트 시각이 아니라 활성 세션 모집단으로 센다
    // (하트비트만 보내는 세션도 포함되고, 5분 안에 스쳐 지나간 옛 경로는 빠진다).
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT COALESCE(s."exitPath", s."entryPath") AS path, COUNT(*) AS sessions
      FROM "analytics_sessions" s WHERE ${activeWhere}
      GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${TOP_LIMIT}`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT COALESCE(s."source", '(none)') AS source, s."channel" AS channel, COUNT(*) AS sessions
      FROM "analytics_sessions" s WHERE ${activeWhere}
      GROUP BY 1, 2 ORDER BY 3 DESC, 1 LIMIT ${TOP_LIMIT}`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT e."id", e."type", e."name", e."path", e."createdAt",
             s."channel", s."source", s."deviceType", s."region"
      FROM "analytics_events" e JOIN "analytics_sessions" s ON s."id" = e."sessionId"
      WHERE e."createdAt" >= ${recentSince} AND ${filter}
      ORDER BY e."createdAt" DESC
      LIMIT ${RECENT_EVENTS_LIMIT}`),
  ]);

  const minuteMap = new Map(minuteRows.map((r) => [String(r.key), r]));

  return {
    activeNow: num(countRows[0]?.n),
    activeByChannel: channelRows.map((r) => ({ channel: String(r.channel), count: num(r.n) })),
    activeByDevice: deviceRows.map((r) => ({ deviceType: strOrNull(r.deviceType), count: num(r.n) })),
    perMinute: keys.map((key) => {
      const r = minuteMap.get(key);
      return { key, pageviews: num(r?.pageviews), sessions: num(r?.sessions) };
    }),
    activeSessions: sessionRows.map((r) => ({
      id: String(r.id),
      visitorId: String(r.visitorId),
      startedAt: iso(r.startedAt),
      lastSeenAt: iso(r.lastSeenAt),
      currentPath: strOrNull(r.exitPath),
      entryPath: String(r.entryPath),
      pageviews: num(r.pageviews),
      engagedMs: num(r.engagedMs),
      channel: String(r.channel),
      source: strOrNull(r.source),
      deviceType: strOrNull(r.deviceType),
      os: strOrNull(r.os),
      inApp: strOrNull(r.inApp),
      country: strOrNull(r.country),
      region: strOrNull(r.region),
      city: strOrNull(r.city),
      isNewVisitor: r.isNewVisitor === true,
      academyId: strOrNull(r.academyId),
      academyName: strOrNull(r.academyName),
    })),
    topPagesNow: pageRows.map((r) => ({ path: String(r.path), sessions: num(r.sessions) })),
    topSourcesNow: sourceRows.map((r) => ({ source: String(r.source), channel: String(r.channel), sessions: num(r.sessions) })),
    recentEvents: eventRows.map((r) => ({
      id: String(r.id),
      type: String(r.type),
      name: strOrNull(r.name),
      path: String(r.path),
      createdAt: iso(r.createdAt),
      channel: String(r.channel),
      source: strOrNull(r.source),
      deviceType: strOrNull(r.deviceType),
      region: strOrNull(r.region),
    })),
    serverTime: now.toISOString(),
  };
}
