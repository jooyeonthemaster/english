// ============================================================================
// 리포트: 전환·가입 — 가입 퍼널, 채널/소스별 가입·결제·매출, 가입 학원 귀속 목록, 커스텀 이벤트, 픽셀 전환 기록.
// 계약: docs/analytics/analytics-spec.md §6.4(귀속), §7(퍼널), §10(conversions), I9(매출)
//
// 정의(유닛 계약):
//  - funnel.visitors       기간 내 세션의 distinct visitor(세션 필터·내부 제외 기본)
//  - funnel.authVisitors   그 방문자 중 기간 내 area='auth' 페이지뷰가 있는 방문자(① 의 부분집합)
//  - funnel.signups        기간 내 가입 학원 전체(필터 무관)
//  - funnel.signupsTracked 귀속 모델 acq 에 있고 귀속 세션이 세션 필터를 통과한 학원
//                          (내부 트래픽 토글은 적용하지 않음 — 개요 리포트와 같은 규약)
//  - funnel.purchasers     signupsTracked 중 결제 완료(COMPLETED) 1건 이상 — §14 D15(전액 환불만 있는 학원 제외). 기간 제한 없는 코호트 누적.
//  - revenue(채널·소스)     해당 학원들의 기간 내 충전 순매출(academyNetRevenueSql, I9)
//  - lifetimeRevenue       전체 기간 순매출(결제액 COMPLETED+REFUNDED − 환불 REFUNDED)
//  - tracked(목록·커버리지) first 또는 last 귀속 행이 있는 학원. 둘 다 없으면 「추적 시작 전 가입」.
//  - signupList          최신순 최대 300곳(SIGNUP_LIST_LIMIT). 절단 여부는 signupListTotal 로 화면에 표시한다.
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { academyNetRevenueSql, eventWhere, num, pct, sessionFilterSql, sessionWhere, type AnalyticsQuery } from "../query";
import { acquisitionCte, academyCreatedBetween, isAttributionModel, type AttributionModel } from "../attribution";

const DAY_MS = 86_400_000;
const SIGNUP_LIST_LIMIT = 300;
const EVENTS_LIMIT = 100;

export interface ConversionsFirstTouch {
  channel: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrerHost: string | null;
  landingPath: string | null;
  firstSeenAt: string | null;
}

export interface ConversionsLastTouch {
  channel: string | null;
  source: string | null;
  campaign: string | null;
  startedAt: string | null;
}

export interface ConversionsSignupRow {
  academyId: string;
  academyName: string;
  createdAt: string;
  directorStaffId: string | null;
  directorName: string | null;
  tracked: boolean;
  first: ConversionsFirstTouch | null;
  last: ConversionsLastTouch | null;
  touchCount: number;
  daysToSignup: number | null;
  firstPaidAt: string | null;
  firstPaidAmount: number | null;
  lifetimeRevenue: number;
}

export interface ConversionsReport {
  model: AttributionModel;
  funnel: { visitors: number; authVisitors: number; signups: number; signupsTracked: number; purchasers: number };
  byChannel: Array<{ channel: string; signups: number; purchasers: number; revenue: number }>;
  bySource: Array<{ source: string; channel: string; signups: number; purchasers: number; revenue: number }>;
  signupList: ConversionsSignupRow[];
  /** 절단 전 목록 후보 수(필터 적용 후). signupList.length 와 다르면 잘린 것 */
  signupListTotal: number;
  /** 목록 상한(SIGNUP_LIST_LIMIT) */
  signupListLimit: number;
  events: Array<{ name: string; count: number; visitors: number; sessions: number }>;
  pixelConversions: Array<{ type: string; count: number; value: number }>;
  coverage: { signups: number; tracked: number; pct: number };
}

type Row = Record<string, unknown>;

/** 귀속 모델 1개의 학원별 행(필터 통과 여부·결제 여부·기간 매출 포함) */
interface AttributionRow {
  academyId: string;
  touchCount: number;
  /** 귀속 세션의 채널·소스(집계 기준) */
  channel: string;
  source: string | null;
  passes: boolean;
  hasPaid: boolean;
  revenue: number;
}

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseAttributionModel(sp: URLSearchParams): AttributionModel {
  const m = sp.get("model");
  return isAttributionModel(m) ? m : "first";
}

/** acq 행 공통 열: 필터 통과·결제 이력·기간 순매출. FROM acq JOIN "analytics_sessions" s 와 함께. */
function attributionCommonCols(q: AnalyticsQuery): Prisma.Sql {
  const filter = sessionFilterSql({ ...q, includeInternal: true });
  return Prisma.sql`
    acq."academyId" AS "academyId",
    acq."touchCount" AS "touchCount",
    s."channel" AS "channel",
    s."source" AS "source",
    (${filter}) AS "passes",
    EXISTS (SELECT 1 FROM "credit_top_ups" tp
      WHERE tp."academyId" = acq."academyId" AND tp."status" = 'COMPLETED') AS "hasPaid",
    ${academyNetRevenueSql(`acq."academyId"`, q.period.from, q.period.to)} AS "revenue"`;
}

function toAttributionRow(r: Row): AttributionRow {
  return {
    academyId: String(r.academyId),
    touchCount: num(r.touchCount),
    channel: String(r.channel),
    source: str(r.source),
    passes: r.passes === true,
    hasPaid: r.hasPaid === true,
    revenue: num(r.revenue),
  };
}

async function firstTouchRows(q: AnalyticsQuery) {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH ${acquisitionCte("first", academyCreatedBetween(q.period.from, q.period.to))}
    SELECT ${attributionCommonCols(q)},
      COALESCE(v."firstChannel", s."channel") AS "firstChannel",
      v."firstSource" AS "firstSource",
      v."firstMedium" AS "firstMedium",
      v."firstCampaign" AS "firstCampaign",
      v."firstReferrerHost" AS "firstReferrerHost",
      v."firstLandingPath" AS "firstLandingPath",
      v."firstSeenAt" AS "firstSeenAt"
    FROM acq
    JOIN "analytics_visitors" v ON v."id" = acq."visitorId"
    JOIN "analytics_sessions" s ON s."id" = acq."sessionId"`);
  return rows.map((r) => ({
    attr: toAttributionRow(r),
    first: {
      channel: str(r.firstChannel),
      source: str(r.firstSource),
      medium: str(r.firstMedium),
      campaign: str(r.firstCampaign),
      referrerHost: str(r.firstReferrerHost),
      landingPath: str(r.firstLandingPath),
      firstSeenAt: iso(r.firstSeenAt),
    } satisfies ConversionsFirstTouch,
  }));
}

async function lastTouchRows(q: AnalyticsQuery) {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH ${acquisitionCte("last", academyCreatedBetween(q.period.from, q.period.to))}
    SELECT ${attributionCommonCols(q)},
      s."campaign" AS "campaign",
      s."startedAt" AS "startedAt"
    FROM acq
    JOIN "analytics_sessions" s ON s."id" = acq."sessionId"`);
  return rows.map((r) => ({
    attr: toAttributionRow(r),
    last: {
      channel: str(r.channel),
      source: str(r.source),
      campaign: str(r.campaign),
      startedAt: iso(r.startedAt),
    } satisfies ConversionsLastTouch,
  }));
}

/** 퍼널 ①② — 기간 내 방문자와 그중 가입·로그인 화면 페이지뷰가 있는 방문자 */
async function funnelVisitors(q: AnalyticsQuery) {
  const [r] = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT COUNT(DISTINCT s."visitorId") AS "visitors",
           COUNT(DISTINCT s."visitorId") FILTER (WHERE EXISTS (
             SELECT 1 FROM "analytics_events" ae
             WHERE ae."sessionId" = s."id" AND ae."type" = 'pageview' AND ae."area" = 'auth'
               AND ae."createdAt" >= ${q.period.from} AND ae."createdAt" < ${q.period.to}
           )) AS "authVisitors"
    FROM "analytics_sessions" s
    WHERE ${sessionWhere(q)}`);
  return { visitors: num(r?.visitors), authVisitors: num(r?.authVisitors) };
}

async function academiesInPeriod(q: AnalyticsQuery) {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT a."id" AS "id", a."name" AS "name", a."createdAt" AS "createdAt"
    FROM "academies" a
    WHERE ${academyCreatedBetween(q.period.from, q.period.to)}
    ORDER BY a."createdAt" DESC, a."id" ASC`);
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? ""), createdAt: iso(r.createdAt) ?? "" }));
}

/** 목록에 실릴 학원의 원장·첫 결제·누적 매출 */
async function academyDetails(ids: string[]) {
  if (ids.length === 0) return new Map<string, Row>();
  const lifetimeTo = new Date(Date.now() + DAY_MS);
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT a."id" AS "academyId",
           d."id" AS "directorStaffId",
           d."name" AS "directorName",
           fp."paidAt" AS "firstPaidAt",
           fp."amount" AS "firstPaidAmount",
           ${academyNetRevenueSql(`a."id"`, new Date(0), lifetimeTo)} AS "lifetimeRevenue"
    FROM "academies" a
    LEFT JOIN LATERAL (
      SELECT st."id", st."name" FROM "staff" st
      WHERE st."academyId" = a."id" AND st."role" = 'DIRECTOR'
      ORDER BY st."isActive" DESC, st."createdAt" ASC
      LIMIT 1
    ) d ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(t."paidAt", t."completedAt") AS "paidAt", COALESCE(t."paidAmount", t."price") AS "amount"
      FROM "credit_top_ups" t
      WHERE t."academyId" = a."id" AND t."status" IN ('COMPLETED','REFUNDED')
        AND COALESCE(t."paidAt", t."completedAt") IS NOT NULL
      ORDER BY COALESCE(t."paidAt", t."completedAt") ASC
      LIMIT 1
    ) fp ON TRUE
    WHERE a."id" IN (${Prisma.join(ids)})`);
  return new Map(rows.map((r) => [String(r.academyId), r]));
}

async function customEvents(q: AnalyticsQuery) {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT COALESCE(e."name", '(none)') AS "name",
           COUNT(*) AS "count",
           COUNT(DISTINCT e."visitorId") AS "visitors",
           COUNT(DISTINCT e."sessionId") AS "sessions"
    FROM "analytics_events" e
    JOIN "analytics_sessions" s ON s."id" = e."sessionId"
    WHERE e."type" = 'event' AND ${eventWhere(q)}
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC
    LIMIT ${EVENTS_LIMIT}`);
  return rows.map((r) => ({ name: String(r.name), count: num(r.count), visitors: num(r.visitors), sessions: num(r.sessions) }));
}

async function pixelConversions(q: AnalyticsQuery) {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT c."type" AS "type", COUNT(*) AS "count", COALESCE(SUM(c."value"), 0) AS "value"
    FROM "analytics_conversions" c
    WHERE c."occurredAt" >= ${q.period.from} AND c."occurredAt" < ${q.period.to}
    GROUP BY 1
    ORDER BY 1 ASC`);
  return rows.map((r) => ({ type: String(r.type), count: num(r.count), value: num(r.value) }));
}

function daysBetween(fromIso: string | null, toIso: string): number | null {
  if (!fromIso) return null;
  const diff = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, Math.floor(diff / DAY_MS));
}

type Agg = { signups: number; purchasers: number; revenue: number };

function addTo<K>(map: Map<K, Agg>, key: K, row: AttributionRow) {
  const cur = map.get(key) ?? { signups: 0, purchasers: 0, revenue: 0 };
  cur.signups += 1;
  if (row.hasPaid) cur.purchasers += 1;
  cur.revenue += row.revenue;
  map.set(key, cur);
}

function byAggDesc(a: Agg, b: Agg): number {
  return b.signups - a.signups || b.revenue - a.revenue || b.purchasers - a.purchasers;
}

export async function getConversionsReport(q: AnalyticsQuery, model: AttributionModel): Promise<ConversionsReport> {
  const [academies, firstRows, lastRows, visitors, events, pixels] = await Promise.all([
    academiesInPeriod(q),
    firstTouchRows(q),
    lastTouchRows(q),
    funnelVisitors(q),
    customEvents(q),
    pixelConversions(q),
  ]);

  const firstBy = new Map(firstRows.map((r) => [r.attr.academyId, r]));
  const lastBy = new Map(lastRows.map((r) => [r.attr.academyId, r]));
  const selected: AttributionRow[] = (model === "first" ? firstRows : lastRows).map((r) => r.attr);
  const selectedBy = new Map(selected.map((r) => [r.academyId, r]));
  const passing = selected.filter((r) => r.passes);

  // 채널·소스 집계(선택 모델의 귀속 세션 기준, 필터 통과분)
  const channelAgg = new Map<string, Agg>();
  const sourceAgg = new Map<string, Agg & { source: string; channel: string }>();
  for (const r of passing) {
    addTo(channelAgg, r.channel, r);
    const source = r.source ?? "(none)";
    const key = `${source}\u0000${r.channel}`;
    const cur = sourceAgg.get(key) ?? { source, channel: r.channel, signups: 0, purchasers: 0, revenue: 0 };
    cur.signups += 1;
    if (r.hasPaid) cur.purchasers += 1;
    cur.revenue += r.revenue;
    sourceAgg.set(key, cur);
  }

  // 가입 학원 목록 — 필터가 걸리면 「추적 + 선택 모델 귀속 세션이 필터 통과」만
  const filtersActive = Object.keys(q.filters).length > 0;
  const listCandidates = academies.filter((a) => !filtersActive || selectedBy.get(a.id)?.passes === true);
  const listed = listCandidates.slice(0, SIGNUP_LIST_LIMIT);
  const details = await academyDetails(listed.map((a) => a.id));

  const signupList: ConversionsSignupRow[] = listed.map((a) => {
    const f = firstBy.get(a.id);
    const l = lastBy.get(a.id);
    const d = details.get(a.id);
    const tracked = !!f || !!l;
    return {
      academyId: a.id,
      academyName: a.name,
      createdAt: a.createdAt,
      directorStaffId: str(d?.directorStaffId),
      directorName: str(d?.directorName),
      tracked,
      first: f?.first ?? null,
      last: l?.last ?? null,
      touchCount: f?.attr.touchCount ?? l?.attr.touchCount ?? 0,
      daysToSignup: daysBetween(f?.first.firstSeenAt ?? null, a.createdAt),
      firstPaidAt: iso(d?.firstPaidAt),
      firstPaidAmount: d?.firstPaidAmount === null || d?.firstPaidAmount === undefined ? null : num(d.firstPaidAmount),
      lifetimeRevenue: num(d?.lifetimeRevenue),
    };
  });

  const academyIds = new Set(academies.map((a) => a.id));
  let trackedCount = 0;
  for (const id of academyIds) if (firstBy.has(id) || lastBy.has(id)) trackedCount += 1;

  return {
    model,
    funnel: {
      visitors: visitors.visitors,
      authVisitors: visitors.authVisitors,
      signups: academies.length,
      signupsTracked: passing.length,
      purchasers: passing.filter((r) => r.hasPaid).length,
    },
    byChannel: [...channelAgg.entries()].map(([channel, v]) => ({ channel, ...v })).sort(byAggDesc),
    bySource: [...sourceAgg.values()].sort(byAggDesc),
    signupList,
    signupListTotal: listCandidates.length,
    signupListLimit: SIGNUP_LIST_LIMIT,
    events,
    pixelConversions: pixels,
    coverage: { signups: academies.length, tracked: trackedCount, pct: pct(trackedCount, academies.length) },
  };
}
