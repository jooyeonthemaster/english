// ============================================================================
// 리포트: 설정 — 수집기 상태(최근 24h/7d 히트·호스트·이벤트 종류)·전환·추적 링크·테이블 용량
// 계약: docs/analytics/analytics-spec.md §10 (/admin/analytics/setup)
//
// 수집기 "건강 상태"를 보는 화면이라 기간·필터·내부 트래픽 제외를 적용하지 않는다
// (관리자·로컬 방문도 수집기가 살아 있다는 증거다). 내부 비중은 internalShare7d 로 따로 보여준다.
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { num, pct } from "../query";

/** 용량을 보여줄 분석 테이블 — 화이트리스트(식별자는 이 목록에서만 Prisma.raw 로 들어간다). */
export const ANALYTICS_TABLES = [
  "analytics_visitors",
  "analytics_sessions",
  "analytics_events",
  "analytics_conversions",
  "analytics_tracked_links",
  "analytics_link_clicks",
] as const;

export interface SetupReport {
  collector: {
    events24h: number;
    events7d: number;
    /** 전체 기간 마지막 이벤트 시각(ISO) */
    lastEventAt: string | null;
    /** 최근 24시간 시작 세션 수(내부 포함) */
    sessions24h: number;
    visitors24h: number;
    /** 최근 7일 세션 중 내부(isInternal) 비율 % */
    internalShare7d: number;
    /** 최근 7일 세션의 호스트별 수 */
    hostnames: Array<{ hostname: string; sessions: number }>;
    /** 최근 7일 이벤트 type·name 별 수 상위 20 */
    eventsByType7d: Array<{ type: string; name: string | null; count: number }>;
    /**
     * 비정상 급증 점검(최근 24시간). /api/collect 는 무인증 쓰기라 외부에서 히트를 위조할 수 있다.
     * IP 는 저장하지 않으므로(I3) 단일 IP 비중 대신 단일 방문자 식별자 비중을 본다.
     */
    spike: {
      /** 히트가 가장 많았던 KST 시간대(예 "09-18 14시"). 이벤트가 없으면 null */
      peakHourLabel: string | null;
      peakHourHits: number;
      /** 한 방문자 식별자가 만든 최대 히트 수와 24시간 히트 대비 비중 % */
      topVisitorHits: number;
      topVisitorShare: number;
    };
  };
  /** 전환 누적(전체 기간) */
  conversions: { signup: number; purchase: number };
  trackedLinks: { active: number; total: number };
  tables: Array<{ table: string; rows: number; size: string }>;
  trackerEndpoint: "/api/collect";
}

const HOUR_MS = 3_600_000;

export async function getSetupReport(now: number = Date.now()): Promise<SetupReport> {
  const since24h = new Date(now - 24 * HOUR_MS);
  const since7d = new Date(now - 7 * 24 * HOUR_MS);

  const tableUnion = Prisma.join(
    ANALYTICS_TABLES.map(
      // t 는 위 상수 목록 값뿐이라 식별자·리터럴로 직접 넣어도 안전하다.
      (t) => Prisma.raw(`SELECT '${t}'::text AS "table",
        (SELECT COUNT(*) FROM "${t}") AS "rows",
        pg_size_pretty(pg_total_relation_size('"${t}"'::regclass)) AS "size"`),
    ),
    " UNION ALL ",
  );

  const [eventStats, lastEvent, sessionStats, hostnames, eventsByType, spike, conversions, links, tables] =
    await Promise.all([
      prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE e."createdAt" >= ${since24h}) AS "events24h",
               COUNT(*) FILTER (WHERE e."createdAt" >= ${since7d}) AS "events7d"
        FROM "analytics_events" e
        WHERE e."createdAt" >= ${since7d}`),
      // 마지막 이벤트는 7일 창 밖일 수도 있어 전체에서(createdAt 인덱스라 MAX 는 싸다).
      prisma.$queryRaw<Array<{ last: Date | null }>>(Prisma.sql`
        SELECT MAX(e."createdAt") AS last FROM "analytics_events" e`),
      prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE s."startedAt" >= ${since24h}) AS "sessions24h",
               COUNT(DISTINCT s."visitorId") FILTER (WHERE s."startedAt" >= ${since24h}) AS "visitors24h",
               COUNT(*) AS "sessions7d",
               COUNT(*) FILTER (WHERE s."isInternal") AS "internal7d"
        FROM "analytics_sessions" s
        WHERE s."startedAt" >= ${since7d}`),
      prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT COALESCE(s."hostname", '(none)') AS hostname, COUNT(*) AS sessions
        FROM "analytics_sessions" s
        WHERE s."startedAt" >= ${since7d}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 20`),
      prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT e."type" AS type, e."name" AS name, COUNT(*) AS count
        FROM "analytics_events" e
        WHERE e."createdAt" >= ${since7d}
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20`),
      // 급증 점검 — 시간대별 최대 히트(KST)와 단일 방문자 최대 히트를 한 번에.
      prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        WITH h AS (
          SELECT to_char(
                   date_trunc('hour', (e."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul'),
                   'MM-DD HH24"시"'
                 ) AS label,
                 COUNT(*) AS c
          FROM "analytics_events" e
          WHERE e."createdAt" >= ${since24h}
          GROUP BY 1 ORDER BY 2 DESC LIMIT 1
        ), v AS (
          SELECT COUNT(*) AS c
          FROM "analytics_events" e
          WHERE e."createdAt" >= ${since24h}
          GROUP BY e."visitorId" ORDER BY 1 DESC LIMIT 1
        )
        SELECT (SELECT label FROM h) AS "peakHourLabel",
               (SELECT c FROM h) AS "peakHourHits",
               (SELECT c FROM v) AS "topVisitorHits"`),
      prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE c."type" = 'signup') AS signup,
               COUNT(*) FILTER (WHERE c."type" = 'purchase') AS purchase
        FROM "analytics_conversions" c`),
      prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE l."isActive") AS active, COUNT(*) AS total
        FROM "analytics_tracked_links" l`),
      prisma.$queryRaw<Array<Record<string, unknown>>>(tableUnion),
    ]);

  const ev = eventStats[0];
  const sp = spike[0];
  const last = lastEvent[0];
  const ss = sessionStats[0];
  const tableMap = new Map(tables.map((r) => [String(r.table), r]));

  return {
    collector: {
      events24h: num(ev?.events24h),
      events7d: num(ev?.events7d),
      lastEventAt: last?.last ? new Date(last.last).toISOString() : null,
      sessions24h: num(ss?.sessions24h),
      visitors24h: num(ss?.visitors24h),
      internalShare7d: pct(num(ss?.internal7d), num(ss?.sessions7d)),
      hostnames: hostnames.map((r) => ({ hostname: String(r.hostname), sessions: num(r.sessions) })),
      eventsByType7d: eventsByType.map((r) => ({
        type: String(r.type),
        name: r.name === null || r.name === undefined ? null : String(r.name),
        count: num(r.count),
      })),
      spike: {
        peakHourLabel: sp?.peakHourLabel ? String(sp.peakHourLabel) : null,
        peakHourHits: num(sp?.peakHourHits),
        topVisitorHits: num(sp?.topVisitorHits),
        topVisitorShare: pct(num(sp?.topVisitorHits), num(ev?.events24h)),
      },
    },
    conversions: { signup: num(conversions[0]?.signup), purchase: num(conversions[0]?.purchase) },
    trackedLinks: { active: num(links[0]?.active), total: num(links[0]?.total) },
    tables: ANALYTICS_TABLES.map((t) => {
      const r = tableMap.get(t);
      return { table: t, rows: num(r?.rows), size: r?.size ? String(r.size) : "-" };
    }),
    trackerEndpoint: "/api/collect",
  };
}
