// ============================================================================
// 리포트: 개요 (견본 — 다른 리포트는 이 파일의 구조·스타일을 따른다)
// 계약: docs/analytics/analytics-spec.md §5, §10
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sumRevenue } from "@/lib/admin-revenue";
import {
  BOUNCE_SQL,
  academyNetRevenueSql,
  eventWhere,
  kstBucketExpr,
  num,
  pct,
  sessionFilterSql,
  sessionWhere,
  type AnalyticsQuery,
} from "../query";
import { acquisitionCte, academyCreatedBetween } from "../attribution";
import { bucketKeys } from "../time";

export interface OverviewKpis {
  visitors: number;
  sessions: number;
  pageviews: number;
  bounceRate: number;
  avgEngagedMs: number;
  pagesPerSession: number;
  newVisitorRate: number;
  /** 기간 내 가입 학원 전체(필터 무관) */
  signupsTotal: number;
  /** 유입 추적된 가입(필터 적용) */
  signupsTracked: number;
  /** 기간 내 순매출 전체(필터 무관, src/lib/admin-revenue.ts 정의) */
  revenueTotal: number;
  /** 기간 내 가입 + 유입 추적된 학원의 기간 내 충전 순매출(필터 적용) */
  revenueTracked: number;
}

export interface OverviewReport {
  current: OverviewKpis;
  previous: OverviewKpis;
  series: Array<{
    key: string;
    visitors: number;
    sessions: number;
    pageviews: number;
    prevVisitors: number;
    prevSessions: number;
    prevPageviews: number;
  }>;
  granularity: "hour" | "day";
  activeNow: number;
  topChannels: Array<{ channel: string; sessions: number; visitors: number }>;
  topSources: Array<{ source: string; channel: string; sessions: number }>;
  topPages: Array<{ path: string; pageviews: number; visitors: number }>;
  collector: { lastEventAt: string | null; events24h: number };
}

async function kpis(q: AnalyticsQuery, which: "current" | "previous"): Promise<OverviewKpis> {
  const from = which === "current" ? q.period.from : q.period.prevFrom;
  const to = which === "current" ? q.period.to : q.period.prevTo;

  // 서로 의존이 없는 4개다 — 직렬 await 로 두면 개요만 3초대로 늦는다(실측 직렬 2,566ms → 병렬 371ms).
  const [sessionAgg, signupsTotalRows, revenue, trackedRows] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT COUNT(*) AS sessions,
             COUNT(DISTINCT s."visitorId") AS visitors,
             COALESCE(SUM(s."pageviews"), 0) AS pageviews,
             COUNT(*) FILTER (WHERE ${BOUNCE_SQL}) AS bounces,
             COALESCE(AVG(s."engagedMs"), 0) AS "avgEngagedMs",
             COUNT(*) FILTER (WHERE s."isNewVisitor") AS "newSessions"
      FROM "analytics_sessions" s
      WHERE ${sessionWhere(q, which)}`),
    prisma.$queryRaw<Array<{ n: unknown }>>(Prisma.sql`
      SELECT COUNT(*) AS n FROM "academies" a WHERE ${academyCreatedBetween(from, to)}`),
    sumRevenue(from, to),
    prisma.$queryRaw<Array<{ signups: unknown; krw: unknown }>>(Prisma.sql`
      WITH ${acquisitionCte("first", academyCreatedBetween(from, to))}
      SELECT COUNT(*) AS signups,
             COALESCE(SUM(${academyNetRevenueSql(`acq."academyId"`, from, to)}), 0) AS krw
      FROM acq JOIN "analytics_sessions" s ON s."id" = acq."sessionId"
      WHERE ${sessionFilterSql({ ...q, includeInternal: true })}`),
  ]);

  const s = sessionAgg[0];
  const signupsTotal = signupsTotalRows[0];
  const tracked = trackedRows[0];

  const sessions = num(s?.sessions);
  const pageviews = num(s?.pageviews);
  return {
    visitors: num(s?.visitors),
    sessions,
    pageviews,
    bounceRate: pct(num(s?.bounces), sessions),
    avgEngagedMs: Math.round(num(s?.avgEngagedMs)),
    pagesPerSession: sessions ? Math.round((pageviews / sessions) * 10) / 10 : 0,
    newVisitorRate: pct(num(s?.newSessions), sessions),
    signupsTotal: num(signupsTotal?.n),
    signupsTracked: num(tracked?.signups),
    revenueTotal: revenue.net,
    revenueTracked: num(tracked?.krw),
  };
}

async function series(q: AnalyticsQuery): Promise<OverviewReport["series"]> {
  const bucket = kstBucketExpr(q, `s."startedAt"`);
  const [cur, prev] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT ${bucket} AS key, COUNT(*) AS sessions, COUNT(DISTINCT s."visitorId") AS visitors, COALESCE(SUM(s."pageviews"),0) AS pageviews
      FROM "analytics_sessions" s WHERE ${sessionWhere(q, "current")} GROUP BY 1`),
    prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT ${bucket} AS key, COUNT(*) AS sessions, COUNT(DISTINCT s."visitorId") AS visitors, COALESCE(SUM(s."pageviews"),0) AS pageviews
      FROM "analytics_sessions" s WHERE ${sessionWhere(q, "previous")} GROUP BY 1`),
  ]);

  const keys = bucketKeys(q.period);
  const prevKeys = bucketKeys({ from: q.period.prevFrom, to: q.period.prevTo, granularity: q.period.granularity });
  const curMap = new Map(cur.map((r) => [String(r.key), r]));
  const prevMap = new Map(prev.map((r) => [String(r.key), r]));
  return keys.map((key, i) => {
    const c = curMap.get(key);
    const p = prevMap.get(prevKeys[i] ?? "");
    return {
      key,
      visitors: num(c?.visitors),
      sessions: num(c?.sessions),
      pageviews: num(c?.pageviews),
      prevVisitors: num(p?.visitors),
      prevSessions: num(p?.sessions),
      prevPageviews: num(p?.pageviews),
    };
  });
}

export async function getOverviewReport(q: AnalyticsQuery): Promise<OverviewReport> {
  const [current, previous, seriesRows] = await Promise.all([kpis(q, "current"), kpis(q, "previous"), series(q)]);

  const [active, topChannels, topSources, topPages, collector] = await Promise.all([
    prisma.$queryRaw<Array<{ n: unknown }>>(Prisma.sql`
      SELECT COUNT(*) AS n FROM "analytics_sessions" s
      WHERE s."lastSeenAt" >= ${new Date(Date.now() - 5 * 60_000)} AND ${sessionFilterSql(q)}`),
    prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT s."channel" AS channel, COUNT(*) AS sessions, COUNT(DISTINCT s."visitorId") AS visitors
      FROM "analytics_sessions" s WHERE ${sessionWhere(q)} GROUP BY 1 ORDER BY 2 DESC LIMIT 6`),
    prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      -- (source, channel) 쌍으로 나눈다. MIN(channel) 로 합치면 네이버 자연검색 194 + 광고 18 이
      -- 「네이버 212 = 검색(자연)」 한 줄로 찍혀 유입경로 탭과 어긋난다.
      SELECT COALESCE(s."source", '(none)') AS source, s."channel" AS channel, COUNT(*) AS sessions
      FROM "analytics_sessions" s WHERE ${sessionWhere(q)} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 6`),
    prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT e."path" AS path, COUNT(*) AS pageviews, COUNT(DISTINCT e."visitorId") AS visitors
      FROM "analytics_events" e JOIN "analytics_sessions" s ON s."id" = e."sessionId"
      WHERE e."type" = 'pageview' AND ${eventWhere(q)} GROUP BY 1 ORDER BY 2 DESC LIMIT 6`),
    prisma.$queryRaw<Array<{ last: Date | null; n: unknown }>>(Prisma.sql`
      SELECT MAX("createdAt") AS last, COUNT(*) FILTER (WHERE "createdAt" >= ${new Date(Date.now() - 86_400_000)}) AS n
      FROM "analytics_events" WHERE "createdAt" >= ${new Date(Date.now() - 30 * 86_400_000)}`),
  ]);

  return {
    current,
    previous,
    series: seriesRows,
    granularity: q.period.granularity,
    activeNow: num(active[0]?.n),
    topChannels: topChannels.map((r) => ({ channel: String(r.channel), sessions: num(r.sessions), visitors: num(r.visitors) })),
    topSources: topSources.map((r) => ({ source: String(r.source), channel: String(r.channel), sessions: num(r.sessions) })),
    topPages: topPages.map((r) => ({ path: String(r.path), pageviews: num(r.pageviews), visitors: num(r.visitors) })),
    collector: {
      lastEventAt: collector[0]?.last ? new Date(collector[0].last).toISOString() : null,
      events24h: num(collector[0]?.n),
    },
  };
}
