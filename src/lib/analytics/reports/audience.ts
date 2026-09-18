// ============================================================================
// 리포트: 방문자·시간대 — 기기·브라우저·OS·인앱·화면·언어·국가·시도·도시 분해,
// 신규/재방문·로그인 비율, 요일×시간 히트맵, 방문 많은 날 TOP 10, 최근 90일 캘린더.
// 계약: docs/analytics/analytics-spec.md §5, §10
//
// 규약:
// - 세션 기준 집계(시각 = startedAt). KST 버킷은 query.ts 헬퍼만(I1).
// - 분해 값이 NULL 인 행은 null 그대로 내려준다 → 화면에서 필터값 "(none)" 으로 드릴다운.
// - 지역 분해(시·도·도시)는 항상 국가를 함께 묶는다 — region 코드는 국가 안에서만 유일하다.
// - calendar 는 조회 기간과 무관하게 최근 90일(KST) 전체, 필터·내부 제외는 적용. 빈 날 0.
// - topDays.pageviews 는 개요 추이 차트와 같은 정의(그날 시작한 세션의 pageviews 합).
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  kstDayExpr,
  kstDowExpr,
  kstHourOfDayExpr,
  num,
  sessionFilterSql,
  sessionWhere,
  type AnalyticsQuery,
} from "../query";
import { bucketKeys, resolvePeriod } from "../time";

export interface AudienceReport {
  devices: Array<{ deviceType: string | null; sessions: number; visitors: number }>;
  browsers: Array<{ browser: string | null; sessions: number }>;
  os: Array<{ os: string | null; sessions: number }>;
  inApps: Array<{ inApp: string | null; sessions: number }>;
  screens: Array<{ screen: string | null; sessions: number }>;
  languages: Array<{ language: string | null; sessions: number }>;
  countries: Array<{ country: string | null; sessions: number; visitors: number }>;
  regions: Array<{ country: string | null; region: string | null; sessions: number; visitors: number }>;
  cities: Array<{ country: string | null; city: string | null; region: string | null; sessions: number }>;
  newVsReturning: { newSessions: number; returningSessions: number };
  loggedIn: { loggedInSessions: number; anonymousSessions: number };
  /** 7×24 = 168칸 전부(빈 칸 0). dow 0=일 … 6=토, hour 0..23 (KST) */
  heatmap: Array<{ dow: number; hour: number; sessions: number }>;
  /** 방문자 상위 10일(기간 내, KST) */
  topDays: Array<{ day: string; dow: number; visitors: number; sessions: number; pageviews: number }>;
  /** 최근 90일(KST, 오래된 날 → 오늘), 빈 날 0 */
  calendar: Array<{ day: string; visitors: number }>;
  /** 0..23시 24칸(기간 합산, KST) */
  hourly: Array<{ hour: number; sessions: number }>;
}

/** 분해 차원별 최대 행 수(화면 표는 10개 + 「전체 보기」) */
const DIM_LIMIT = 100;

type DimRow = { dim: unknown; k1: unknown; k2: unknown; k3: unknown; sessions: unknown; visitors: unknown };

function strOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

/** 'YYYY-MM-DD' 달력 날짜의 요일(0=일). 날짜 자체의 요일이라 시간대와 무관. */
function dowOfDay(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** 세션 속성 분해 — 한 번의 스캔(base CTE)으로 전 차원을 UNION ALL. */
async function dimensions(q: AnalyticsQuery): Promise<DimRow[]> {
  return prisma.$queryRaw<DimRow[]>(Prisma.sql`
    WITH base AS (
      SELECT s."visitorId", s."deviceType", s."browser", s."os", s."inApp", s."screen", s."language",
             s."country", s."region", s."city", s."isNewVisitor", s."academyId"
      FROM "analytics_sessions" s
      WHERE ${sessionWhere(q)}
    ),
    dims AS (
      SELECT 'device'::text AS dim, "deviceType" AS k1, NULL::text AS k2, NULL::text AS k3, COUNT(*) AS sessions, COUNT(DISTINCT "visitorId") AS visitors
        FROM base GROUP BY "deviceType"
      UNION ALL
      SELECT 'browser', "browser", NULL, NULL, COUNT(*), COUNT(DISTINCT "visitorId") FROM base GROUP BY "browser"
      UNION ALL
      SELECT 'os', "os", NULL, NULL, COUNT(*), COUNT(DISTINCT "visitorId") FROM base GROUP BY "os"
      UNION ALL
      SELECT 'inApp', "inApp", NULL, NULL, COUNT(*), COUNT(DISTINCT "visitorId") FROM base GROUP BY "inApp"
      UNION ALL
      SELECT 'screen', "screen", NULL, NULL, COUNT(*), COUNT(DISTINCT "visitorId") FROM base GROUP BY "screen"
      UNION ALL
      SELECT 'language', "language", NULL, NULL, COUNT(*), COUNT(DISTINCT "visitorId") FROM base GROUP BY "language"
      UNION ALL
      SELECT 'country', "country", NULL, NULL, COUNT(*), COUNT(DISTINCT "visitorId") FROM base GROUP BY "country"
      UNION ALL
      SELECT 'region', "country", "region", NULL, COUNT(*), COUNT(DISTINCT "visitorId") FROM base GROUP BY "country", "region"
      UNION ALL
      -- 도시는 국가까지 묶는다: region 코드(11=서울 등)는 국가마다 다른 뜻이라 국가를 빼면
      -- 서로 다른 나라의 같은 이름 도시가 한 행에 합쳐지고 시·도 라벨도 엉뚱한 나라 이름이 된다.
      SELECT 'city', "city", "region", "country", COUNT(*), COUNT(DISTINCT "visitorId") FROM base GROUP BY "country", "city", "region"
      UNION ALL
      SELECT 'newVisitor', CASE WHEN "isNewVisitor" THEN 'new' ELSE 'returning' END, NULL, NULL, COUNT(*), COUNT(DISTINCT "visitorId")
        FROM base GROUP BY 2
      UNION ALL
      SELECT 'loggedIn', CASE WHEN "academyId" IS NOT NULL THEN 'yes' ELSE 'no' END, NULL, NULL, COUNT(*), COUNT(DISTINCT "visitorId")
        FROM base GROUP BY 2
    )
    SELECT dim, k1, k2, k3, sessions, visitors FROM (
      SELECT d.*, ROW_NUMBER() OVER (
        PARTITION BY d.dim ORDER BY d.sessions DESC, d.visitors DESC, d.k1 NULLS LAST, d.k2 NULLS LAST, d.k3 NULLS LAST
      ) AS rn
      FROM dims d
    ) ranked
    WHERE rn <= ${DIM_LIMIT}
    ORDER BY dim, rn`);
}

export async function getAudienceReport(q: AnalyticsQuery): Promise<AudienceReport> {
  const calendarPeriod = resolvePeriod({ range: "90d" });
  const startedAt = `s."startedAt"`;

  const [dimRows, heatRows, dayRows, calendarRows] = await Promise.all([
    dimensions(q),
    prisma.$queryRaw<Array<{ dow: unknown; hour: unknown; sessions: unknown }>>(Prisma.sql`
      SELECT ${kstDowExpr(startedAt)} AS dow, ${kstHourOfDayExpr(startedAt)} AS hour, COUNT(*) AS sessions
      FROM "analytics_sessions" s
      WHERE ${sessionWhere(q)}
      GROUP BY 1, 2`),
    prisma.$queryRaw<Array<{ day: unknown; visitors: unknown; sessions: unknown; pageviews: unknown }>>(Prisma.sql`
      SELECT ${kstDayExpr(startedAt)} AS day,
             COUNT(DISTINCT s."visitorId") AS visitors,
             COUNT(*) AS sessions,
             COALESCE(SUM(s."pageviews"), 0) AS pageviews
      FROM "analytics_sessions" s
      WHERE ${sessionWhere(q)}
      GROUP BY 1
      ORDER BY visitors DESC, sessions DESC, day DESC
      LIMIT 10`),
    prisma.$queryRaw<Array<{ day: unknown; visitors: unknown }>>(Prisma.sql`
      SELECT ${kstDayExpr(startedAt)} AS day, COUNT(DISTINCT s."visitorId") AS visitors
      FROM "analytics_sessions" s
      WHERE s."startedAt" >= ${calendarPeriod.from} AND s."startedAt" < ${calendarPeriod.to}
        AND ${sessionFilterSql(q)}
      GROUP BY 1`),
  ]);

  const byDim = new Map<string, DimRow[]>();
  for (const r of dimRows) {
    const key = String(r.dim);
    const list = byDim.get(key);
    if (list) list.push(r);
    else byDim.set(key, [r]);
  }
  const rowsOf = (dim: string) => byDim.get(dim) ?? [];
  const countOf = (dim: string, k1: string) => num(rowsOf(dim).find((r) => r.k1 === k1)?.sessions);

  // 히트맵 168칸 + 시간대 24칸(히트맵 합산 — 같은 쿼리라 수치가 어긋날 수 없다)
  const heat = new Map<string, number>();
  for (const r of heatRows) heat.set(`${num(r.dow)}-${num(r.hour)}`, num(r.sessions));
  const heatmap: AudienceReport["heatmap"] = [];
  const hourly: AudienceReport["hourly"] = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: 0 }));
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const sessions = heat.get(`${dow}-${hour}`) ?? 0;
      heatmap.push({ dow, hour, sessions });
      hourly[hour].sessions += sessions;
    }
  }

  const calMap = new Map(calendarRows.map((r) => [String(r.day), num(r.visitors)]));
  const calendar = bucketKeys(calendarPeriod).map((day) => ({ day, visitors: calMap.get(day) ?? 0 }));

  return {
    devices: rowsOf("device").map((r) => ({ deviceType: strOrNull(r.k1), sessions: num(r.sessions), visitors: num(r.visitors) })),
    browsers: rowsOf("browser").map((r) => ({ browser: strOrNull(r.k1), sessions: num(r.sessions) })),
    os: rowsOf("os").map((r) => ({ os: strOrNull(r.k1), sessions: num(r.sessions) })),
    inApps: rowsOf("inApp").map((r) => ({ inApp: strOrNull(r.k1), sessions: num(r.sessions) })),
    screens: rowsOf("screen").map((r) => ({ screen: strOrNull(r.k1), sessions: num(r.sessions) })),
    languages: rowsOf("language").map((r) => ({ language: strOrNull(r.k1), sessions: num(r.sessions) })),
    countries: rowsOf("country").map((r) => ({ country: strOrNull(r.k1), sessions: num(r.sessions), visitors: num(r.visitors) })),
    regions: rowsOf("region").map((r) => ({
      country: strOrNull(r.k1),
      region: strOrNull(r.k2),
      sessions: num(r.sessions),
      visitors: num(r.visitors),
    })),
    cities: rowsOf("city").map((r) => ({
      country: strOrNull(r.k3),
      city: strOrNull(r.k1),
      region: strOrNull(r.k2),
      sessions: num(r.sessions),
    })),
    newVsReturning: { newSessions: countOf("newVisitor", "new"), returningSessions: countOf("newVisitor", "returning") },
    loggedIn: { loggedInSessions: countOf("loggedIn", "yes"), anonymousSessions: countOf("loggedIn", "no") },
    heatmap,
    topDays: dayRows.map((r) => {
      const day = String(r.day);
      return { day, dow: dowOfDay(day), visitors: num(r.visitors), sessions: num(r.sessions), pageviews: num(r.pageviews) };
    }),
    calendar,
    hourly,
  };
}
