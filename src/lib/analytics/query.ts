// ============================================================================
// 리포트 공용 쿼리 빌더 — 서버 전용(Prisma). 기간·필터 → SQL 조각.
// 계약: docs/analytics/analytics-spec.md §5
//
// 규약:
// - 세션 테이블 별칭은 항상 s, 이벤트 테이블 별칭은 항상 e.
// - 모든 사용자 입력은 Prisma.sql 파라미터 바인딩. 컬럼명만 Prisma.raw(화이트리스트).
// - KST 버킷: kstDayExpr / kstHourExpr / kstDowExpr (I1).
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { resolvePeriod, type AnalyticsPeriod } from "./time";

export const FILTER_KEYS = [
  "channel",
  "source",
  "medium",
  "campaign",
  "device",
  "browser",
  "os",
  "inApp",
  "country",
  "region",
  "entry",
  "page",
  "area",
  "loggedIn",
  "referrerHost",
  "link",
] as const;

export type FilterKey = (typeof FILTER_KEYS)[number];
export type AnalyticsFilters = Partial<Record<FilterKey, string>>;

export interface AnalyticsQuery {
  period: AnalyticsPeriod;
  filters: AnalyticsFilters;
  includeInternal: boolean;
}

/** URLSearchParams → AnalyticsQuery (잘못된 값은 조용히 무시). */
export function parseAnalyticsQuery(sp: URLSearchParams): AnalyticsQuery {
  const period = resolvePeriod({ range: sp.get("range"), from: sp.get("from"), to: sp.get("to") });
  const filters: AnalyticsFilters = {};
  for (const k of FILTER_KEYS) {
    const v = sp.get(k);
    if (v && v.length <= 300) filters[k] = v;
  }
  return { period, filters, includeInternal: sp.get("internal") === "include" };
}

/** 필터값 "(none)" = NULL 매칭 */
function eqOrNull(col: string, value: string): Prisma.Sql {
  if (value === "(none)") return Prisma.sql`${Prisma.raw(col)} IS NULL`;
  return Prisma.sql`${Prisma.raw(col)} = ${value}`;
}

/** 세션 필터(기간 제외). alias s 고정. */
export function sessionFilterSql(q: AnalyticsQuery): Prisma.Sql {
  const f = q.filters;
  const parts: Prisma.Sql[] = [];
  if (!q.includeInternal) parts.push(Prisma.sql`s."isInternal" = false`);
  if (f.channel) parts.push(eqOrNull(`s."channel"`, f.channel));
  if (f.source) parts.push(eqOrNull(`s."source"`, f.source));
  if (f.medium) parts.push(eqOrNull(`s."medium"`, f.medium));
  if (f.campaign) parts.push(eqOrNull(`s."campaign"`, f.campaign));
  if (f.device) parts.push(eqOrNull(`s."deviceType"`, f.device));
  if (f.browser) parts.push(eqOrNull(`s."browser"`, f.browser));
  if (f.os) parts.push(eqOrNull(`s."os"`, f.os));
  if (f.inApp) parts.push(eqOrNull(`s."inApp"`, f.inApp));
  if (f.country) parts.push(eqOrNull(`s."country"`, f.country));
  if (f.region) parts.push(eqOrNull(`s."region"`, f.region));
  if (f.entry) parts.push(Prisma.sql`s."entryPath" = ${f.entry}`);
  if (f.referrerHost) parts.push(eqOrNull(`s."referrerHost"`, f.referrerHost));
  if (f.link) parts.push(eqOrNull(`s."trackedLink"`, f.link));
  if (f.loggedIn === "yes") parts.push(Prisma.sql`s."academyId" IS NOT NULL`);
  if (f.loggedIn === "no") parts.push(Prisma.sql`s."academyId" IS NULL`);
  if (f.page) {
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "analytics_events" fe WHERE fe."sessionId" = s."id" AND fe."type" = 'pageview' AND fe."path" = ${f.page})`,
    );
  }
  if (f.area) {
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "analytics_events" fa WHERE fa."sessionId" = s."id" AND fa."area" = ${f.area})`,
    );
  }
  return parts.length ? Prisma.join(parts, " AND ") : Prisma.sql`TRUE`;
}

/** 세션 기간 조건(startedAt 기준). */
export function sessionPeriodSql(q: AnalyticsQuery, which: "current" | "previous" = "current"): Prisma.Sql {
  const from = which === "current" ? q.period.from : q.period.prevFrom;
  const to = which === "current" ? q.period.to : q.period.prevTo;
  return Prisma.sql`s."startedAt" >= ${from} AND s."startedAt" < ${to}`;
}

/** 세션 기간 + 필터 WHERE 본문 */
export function sessionWhere(q: AnalyticsQuery, which: "current" | "previous" = "current"): Prisma.Sql {
  return Prisma.sql`${sessionPeriodSql(q, which)} AND ${sessionFilterSql(q)}`;
}

/**
 * 이벤트 기간(createdAt) + 세션 필터. FROM "analytics_events" e JOIN "analytics_sessions" s ON s."id" = e."sessionId" 와 함께 쓴다.
 */
export function eventWhere(q: AnalyticsQuery, which: "current" | "previous" = "current"): Prisma.Sql {
  const from = which === "current" ? q.period.from : q.period.prevFrom;
  const to = which === "current" ? q.period.to : q.period.prevTo;
  return Prisma.sql`e."createdAt" >= ${from} AND e."createdAt" < ${to} AND ${sessionFilterSql(q)}`;
}

/** KST 일자 'YYYY-MM-DD' */
export function kstDayExpr(col: string): Prisma.Sql {
  return Prisma.raw(`to_char((${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD')`);
}

/** KST 시각 버킷 'YYYY-MM-DD HH' */
export function kstHourExpr(col: string): Prisma.Sql {
  return Prisma.raw(`to_char((${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD HH24')`);
}

/** 기간 granularity 에 맞는 버킷 식 */
export function kstBucketExpr(q: AnalyticsQuery, col: string): Prisma.Sql {
  return q.period.granularity === "hour" ? kstHourExpr(col) : kstDayExpr(col);
}

/** KST 요일(0=일..6=토) */
export function kstDowExpr(col: string): Prisma.Sql {
  return Prisma.raw(`EXTRACT(DOW FROM (${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'))::int`);
}

/** KST 시(0..23) */
export function kstHourOfDayExpr(col: string): Prisma.Sql {
  return Prisma.raw(`EXTRACT(HOUR FROM (${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'))::int`);
}

/** 이탈 세션 조건 (§5) */
export const BOUNCE_SQL = Prisma.raw(`(s."pageviews" <= 1 AND s."eventsCount" = 0 AND s."engagedMs" < 10000)`);

/**
 * 학원 1곳의 [from, to) 순매출(충전) 스칼라 서브쿼리 — I9 / src/lib/admin-revenue.ts 와 같은 정의.
 * 결제일 기준 결제액(COMPLETED+REFUNDED) − 환불일 기준 환불(REFUNDED).
 * academyIdCol 예: `acq."academyId"`
 */
export function academyNetRevenueSql(academyIdCol: string, from: Date, to: Date): Prisma.Sql {
  const col = Prisma.raw(academyIdCol);
  return Prisma.sql`(
    COALESCE((SELECT SUM(COALESCE(t."paidAmount", t."price")) FROM "credit_top_ups" t
      WHERE t."academyId" = ${col} AND t."status" IN ('COMPLETED','REFUNDED')
        AND COALESCE(t."paidAt", t."completedAt") >= ${from} AND COALESCE(t."paidAt", t."completedAt") < ${to}), 0)
    - COALESCE((SELECT SUM(COALESCE(t."paidAmount", t."price")) FROM "credit_top_ups" t
      WHERE t."academyId" = ${col} AND t."status" = 'REFUNDED'
        AND COALESCE(t."cancelledAt", t."updatedAt") >= ${from} AND COALESCE(t."cancelledAt", t."updatedAt") < ${to}), 0)
  )`;
}

/** 학원 1곳의 [from, to) 결제 완료 건수(환불 전 기준) 스칼라 서브쿼리 */
export function academyPaidCountSql(academyIdCol: string, from: Date, to: Date): Prisma.Sql {
  const col = Prisma.raw(academyIdCol);
  return Prisma.sql`(SELECT COUNT(*) FROM "credit_top_ups" t
    WHERE t."academyId" = ${col} AND t."status" IN ('COMPLETED','REFUNDED')
      AND COALESCE(t."paidAt", t."completedAt") >= ${from} AND COALESCE(t."paidAt", t."completedAt") < ${to})`;
}

/** $queryRaw 결과의 bigint/Decimal → number 변환 */
export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "object" && v && "toNumber" in v && typeof (v as { toNumber: unknown }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}
