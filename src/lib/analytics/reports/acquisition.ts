// ============================================================================
// 리포트: 유입 경로 — 채널·소스·referrer·UTM·인앱·AI·클릭ID·추적 링크 + 가입/매출 귀속
// 계약: docs/analytics/analytics-spec.md §4, §5, §6.4, §10 (acquisition), I9
//
// 쿼리 6개를 병렬로 돌린다(세션 차원은 GROUPING SETS 로 한 번에 스캔).
//  - 방문 지표(방문자·방문·이탈률·평균체류): 세션 startedAt 기준 기간 + 필터(내부 트래픽 기본 제외)
//  - 가입·매출: 「기간 내 가입」 학원 → 귀속 세션(model=first|last) → 그 세션의 채널/소스/캠페인/추적 링크.
//    귀속 세션 자체는 기간 밖(가입 전 방문)일 수 있다. 개요(overview.ts)와 같게 내부 여부는 가르지 않는다.
//    매출 = 그 학원의 기간 내 충전 순매출(academyNetRevenueSql, 구독·수동지급은 학원 귀속 불가라 제외).
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  BOUNCE_SQL,
  academyNetRevenueSql,
  kstBucketExpr,
  num,
  pct,
  sessionFilterSql,
  sessionWhere,
  type AnalyticsQuery,
} from "../query";
import { acquisitionCte, academyCreatedBetween, type AttributionModel } from "../attribution";
import { bucketKeys } from "../time";

export interface AcquisitionChannelRow {
  channel: string;
  visitors: number;
  sessions: number;
  pageviews: number;
  bounceRate: number;
  avgEngagedMs: number;
  signups: number;
  revenue: number;
}

export interface AcquisitionSourceRow {
  source: string;
  channel: string;
  visitors: number;
  sessions: number;
  bounceRate: number;
  avgEngagedMs: number;
  signups: number;
  revenue: number;
}

export interface AcquisitionCampaignRow {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  sessions: number;
  visitors: number;
  signups: number;
  revenue: number;
}

/** 채널별 세션 추이 한 버킷 — key 외 나머지 키는 채널 코드 → 세션 수 */
export type ChannelSeriesPoint = { key: string } & Record<string, string | number>;

export interface AcquisitionReport {
  model: AttributionModel;
  channels: AcquisitionChannelRow[];
  sources: AcquisitionSourceRow[];
  referrerHosts: Array<{ host: string; sessions: number; visitors: number; signups: number; revenue: number }>;
  /** 상위 50 — 귀속(가입·매출)은 참조 도메인 표에서 본다 */
  referrers: Array<{ url: string; sessions: number }>;
  campaigns: AcquisitionCampaignRow[];
  contents: Array<{ campaign: string | null; content: string; sessions: number }>;
  terms: Array<{ term: string; sessions: number }>;
  /** inApp null = 일반 브라우저 */
  inApps: Array<{ inApp: string | null; sessions: number; visitors: number; signups: number; revenue: number }>;
  ai: Array<{ source: string; sessions: number; visitors: number; signups: number; revenue: number }>;
  clickIds: Array<{ clickIdType: string; sessions: number }>;
  trackedLinks: Array<{ slug: string; sessions: number; visitors: number; signups: number }>;
  channelSeries: ChannelSeriesPoint[];
  /** signupsTotal = 기간 내 가입 학원 전체(필터·귀속 무관, 추적 커버리지 분모) */
  totals: { sessions: number; visitors: number; signups: number; signupsTotal: number; revenue: number };
}

type Row = Record<string, unknown>;

/** UTM·광고 캠페인 세션 판정 — 매체/캠페인이 분류됐거나 랜딩 쿼리에 utm_source|medium|campaign 이 있다. */
const CAMPAIGN_SESSION_SQL = Prisma.raw(
  `(s."campaign" IS NOT NULL OR s."medium" IS NOT NULL OR COALESCE(s."landingQuery", '') ~ '(^|&)utm_(source|medium|campaign)=')`,
);

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

interface Tally {
  signups: number;
  revenue: number;
}

function bump(map: Map<string, Tally>, key: string, revenue: number) {
  const t = map.get(key) ?? { signups: 0, revenue: 0 };
  t.signups += 1;
  t.revenue += revenue;
  map.set(key, t);
}

/** 인앱 집계 키 — inApp NULL(일반 브라우저) 자리 */
const NO_IN_APP = "(none)";

// 합성 키 구분자 — 리터럴 NUL 문자를 그대로 두면 grep/ripgrep 이 이 파일을 바이너리로 보고 전수 검색에서 건너뛴다.
const SEP = "\u0000";

export async function getAcquisitionReport(q: AnalyticsQuery, model: AttributionModel): Promise<AcquisitionReport> {
  const { from, to } = q.period;
  const where = sessionWhere(q);
  const bucket = kstBucketExpr(q, `s."startedAt"`);

  const [core, dims, referrerRows, campaignRows, seriesRows, attributed, signupsTotalRow] = await Promise.all([
    // 합계 · 채널 · 채널×소스
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT CASE WHEN GROUPING(s."channel") = 1 THEN 'total'
                  WHEN GROUPING(s."source") = 1 THEN 'channel'
                  ELSE 'source' END AS dim,
             s."channel" AS channel,
             s."source" AS source,
             COUNT(*) AS sessions,
             COUNT(DISTINCT s."visitorId") AS visitors,
             COALESCE(SUM(s."pageviews"), 0) AS pageviews,
             COUNT(*) FILTER (WHERE ${BOUNCE_SQL}) AS bounces,
             COALESCE(AVG(s."engagedMs"), 0) AS "avgEngagedMs"
      FROM "analytics_sessions" s
      WHERE ${where}
      GROUP BY GROUPING SETS ((), (s."channel"), (s."channel", s."source"))
      ORDER BY sessions DESC, visitors DESC`),
    // 참조 도메인 · 인앱 · 추적 링크 · 키워드 · 클릭ID · 캠페인×콘텐츠
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT CASE WHEN GROUPING(s."referrerHost") = 0 THEN 'referrerHost'
                  WHEN GROUPING(s."inApp") = 0 THEN 'inApp'
                  WHEN GROUPING(s."trackedLink") = 0 THEN 'trackedLink'
                  WHEN GROUPING(s."term") = 0 THEN 'term'
                  WHEN GROUPING(s."clickIdType") = 0 THEN 'clickIdType'
                  ELSE 'content' END AS dim,
             s."referrerHost" AS "referrerHost",
             s."inApp" AS "inApp",
             s."trackedLink" AS "trackedLink",
             s."term" AS term,
             s."clickIdType" AS "clickIdType",
             s."campaign" AS campaign,
             s."content" AS content,
             COUNT(*) AS sessions,
             COUNT(DISTINCT s."visitorId") AS visitors
      FROM "analytics_sessions" s
      WHERE ${where}
      GROUP BY GROUPING SETS ((s."referrerHost"), (s."inApp"), (s."trackedLink"), (s."term"), (s."clickIdType"), (s."campaign", s."content"))
      ORDER BY sessions DESC, visitors DESC`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT s."referrer" AS url, COUNT(*) AS sessions
      FROM "analytics_sessions" s
      WHERE ${where} AND s."referrer" IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 50`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT s."source" AS source, s."medium" AS medium, s."campaign" AS campaign,
             COUNT(*) AS sessions, COUNT(DISTINCT s."visitorId") AS visitors
      FROM "analytics_sessions" s
      WHERE ${where} AND ${CAMPAIGN_SESSION_SQL}
      GROUP BY 1, 2, 3 ORDER BY 4 DESC, 5 DESC`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT ${bucket} AS key, s."channel" AS channel, COUNT(*) AS sessions
      FROM "analytics_sessions" s
      WHERE ${where}
      GROUP BY 1, 2`),
    // 기간 내 가입 학원 1곳 = 1행(귀속 세션의 유입 속성 + 기간 내 충전 순매출)
    prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH ${acquisitionCte(model, academyCreatedBetween(from, to))}
      SELECT acq."academyId" AS "academyId",
             s."channel" AS channel,
             s."source" AS source,
             s."medium" AS medium,
             s."campaign" AS campaign,
             s."trackedLink" AS "trackedLink",
             s."referrerHost" AS "referrerHost",
             s."inApp" AS "inApp",
             ${CAMPAIGN_SESSION_SQL} AS "isCampaign",
             ${academyNetRevenueSql(`acq."academyId"`, from, to)} AS revenue
      FROM acq JOIN "analytics_sessions" s ON s."id" = acq."sessionId"
      WHERE ${sessionFilterSql({ ...q, includeInternal: true })}`),
    // 기간 내 가입 학원 전체(필터·귀속 무관) — 추적 커버리지 분모
    prisma.$queryRaw<Array<{ n: unknown }>>(Prisma.sql`
      SELECT COUNT(*) AS n FROM "academies" a WHERE ${academyCreatedBetween(from, to)}`),
  ]);

  // ── 귀속 집계 ──────────────────────────────────────────────
  const byChannel = new Map<string, Tally>();
  const bySource = new Map<string, Tally>();
  const byCampaign = new Map<string, Tally>();
  const byLink = new Map<string, Tally>();
  const byReferrerHost = new Map<string, Tally>();
  const byInApp = new Map<string, Tally>();
  let signupTotal = 0;
  let revenueTotal = 0;
  for (const r of attributed) {
    const revenue = num(r.revenue);
    const channel = String(r.channel);
    const source = str(r.source) ?? "(none)";
    signupTotal += 1;
    revenueTotal += revenue;
    bump(byChannel, channel, revenue);
    bump(bySource, `${source}${SEP}${channel}`, revenue);
    if (r.isCampaign === true) bump(byCampaign, [str(r.source), str(r.medium), str(r.campaign)].join(SEP), revenue);
    const link = str(r.trackedLink);
    if (link) bump(byLink, link, revenue);
    const host = str(r.referrerHost);
    if (host) bump(byReferrerHost, host, revenue);
    bump(byInApp, str(r.inApp) ?? NO_IN_APP, revenue);
  }

  // ── 채널·소스(방문 지표 + 귀속 병합) ─────────────────────────
  const totalRow = core.find((r) => r.dim === "total");
  const channels: AcquisitionChannelRow[] = [];
  const sources: AcquisitionSourceRow[] = [];
  const seenChannel = new Set<string>();
  const seenSource = new Set<string>();
  for (const r of core) {
    const sessions = num(r.sessions);
    const base = {
      visitors: num(r.visitors),
      sessions,
      bounceRate: pct(num(r.bounces), sessions),
      avgEngagedMs: Math.round(num(r.avgEngagedMs)),
    };
    const channel = String(r.channel);
    if (r.dim === "channel") {
      const t = byChannel.get(channel);
      seenChannel.add(channel);
      channels.push({ channel, ...base, pageviews: num(r.pageviews), signups: t?.signups ?? 0, revenue: t?.revenue ?? 0 });
    } else if (r.dim === "source") {
      const source = str(r.source) ?? "(none)";
      const key = `${source}${SEP}${channel}`;
      const t = bySource.get(key);
      seenSource.add(key);
      sources.push({ source, channel, ...base, signups: t?.signups ?? 0, revenue: t?.revenue ?? 0 });
    }
  }
  // 기간 내 방문은 없지만 귀속 가입이 있는 채널/소스(가입 전 방문이 기간 밖)
  for (const [channel, t] of byChannel) {
    if (seenChannel.has(channel)) continue;
    channels.push({ channel, visitors: 0, sessions: 0, pageviews: 0, bounceRate: 0, avgEngagedMs: 0, signups: t.signups, revenue: t.revenue });
  }
  for (const [key, t] of bySource) {
    if (seenSource.has(key)) continue;
    const [source, channel] = key.split(SEP);
    sources.push({ source, channel, visitors: 0, sessions: 0, bounceRate: 0, avgEngagedMs: 0, signups: t.signups, revenue: t.revenue });
  }
  const bySessionsThenSignups = (a: { sessions: number; signups: number }, b: { sessions: number; signups: number }) =>
    b.sessions - a.sessions || b.signups - a.signups;
  channels.sort(bySessionsThenSignups);
  sources.sort(bySessionsThenSignups);

  // ── 세부 차원 ──────────────────────────────────────────────
  const referrerHosts: AcquisitionReport["referrerHosts"] = [];
  const inApps: AcquisitionReport["inApps"] = [];
  const terms: AcquisitionReport["terms"] = [];
  const clickIds: AcquisitionReport["clickIds"] = [];
  const contents: AcquisitionReport["contents"] = [];
  const linkRows = new Map<string, { sessions: number; visitors: number }>();
  const seenHost = new Set<string>();
  const seenInApp = new Set<string>();
  for (const r of dims) {
    const sessions = num(r.sessions);
    const visitors = num(r.visitors);
    switch (r.dim) {
      case "referrerHost": {
        const host = str(r.referrerHost);
        if (host) {
          const t = byReferrerHost.get(host);
          seenHost.add(host);
          referrerHosts.push({ host, sessions, visitors, signups: t?.signups ?? 0, revenue: t?.revenue ?? 0 });
        }
        break;
      }
      case "inApp": {
        const inApp = str(r.inApp);
        const t = byInApp.get(inApp ?? NO_IN_APP);
        seenInApp.add(inApp ?? NO_IN_APP);
        inApps.push({ inApp, sessions, visitors, signups: t?.signups ?? 0, revenue: t?.revenue ?? 0 });
        break;
      }
      case "trackedLink": {
        const slug = str(r.trackedLink);
        if (slug) linkRows.set(slug, { sessions, visitors });
        break;
      }
      case "term": {
        const term = str(r.term);
        if (term) terms.push({ term, sessions });
        break;
      }
      case "clickIdType": {
        const clickIdType = str(r.clickIdType);
        if (clickIdType) clickIds.push({ clickIdType, sessions });
        break;
      }
      case "content": {
        const content = str(r.content);
        if (content) contents.push({ campaign: str(r.campaign), content, sessions });
        break;
      }
    }
  }

  // 기간 내 방문은 없지만 귀속 가입이 있는 참조 도메인·인앱(가입 전 방문이 기간 밖)
  for (const [host, t] of byReferrerHost) {
    if (seenHost.has(host)) continue;
    referrerHosts.push({ host, sessions: 0, visitors: 0, signups: t.signups, revenue: t.revenue });
  }
  for (const [key, t] of byInApp) {
    if (seenInApp.has(key)) continue;
    inApps.push({ inApp: key === NO_IN_APP ? null : key, sessions: 0, visitors: 0, signups: t.signups, revenue: t.revenue });
  }
  referrerHosts.sort(bySessionsThenSignups);
  inApps.sort(bySessionsThenSignups);

  const trackedLinks: AcquisitionReport["trackedLinks"] = [...new Set([...linkRows.keys(), ...byLink.keys()])]
    .map((slug) => ({
      slug,
      sessions: linkRows.get(slug)?.sessions ?? 0,
      visitors: linkRows.get(slug)?.visitors ?? 0,
      signups: byLink.get(slug)?.signups ?? 0,
    }))
    .sort(bySessionsThenSignups);

  const campaigns: AcquisitionCampaignRow[] = campaignRows.map((r) => {
    const t = byCampaign.get([str(r.source), str(r.medium), str(r.campaign)].join(SEP));
    return {
      source: str(r.source),
      medium: str(r.medium),
      campaign: str(r.campaign),
      sessions: num(r.sessions),
      visitors: num(r.visitors),
      signups: t?.signups ?? 0,
      revenue: t?.revenue ?? 0,
    };
  });
  const seenCampaign = new Set(campaigns.map((c) => [c.source, c.medium, c.campaign].join(SEP)));
  for (const [key, t] of byCampaign) {
    if (seenCampaign.has(key)) continue;
    const [source, medium, campaign] = key.split(SEP).map((v) => v || null);
    campaigns.push({ source, medium, campaign, sessions: 0, visitors: 0, signups: t.signups, revenue: t.revenue });
  }
  campaigns.sort(bySessionsThenSignups);

  // ── 채널별 세션 추이(빈 버킷 0) ─────────────────────────────
  const seriesChannels = channels.filter((c) => c.sessions > 0).map((c) => c.channel);
  const seriesMap = new Map<string, number>();
  for (const r of seriesRows) seriesMap.set(`${String(r.key)}${SEP}${String(r.channel)}`, num(r.sessions));
  const channelSeries: ChannelSeriesPoint[] = bucketKeys(q.period).map((key) => {
    const point: ChannelSeriesPoint = { key };
    for (const ch of seriesChannels) point[ch] = seriesMap.get(`${key}${SEP}${ch}`) ?? 0;
    return point;
  });

  return {
    model,
    channels,
    sources,
    referrerHosts,
    referrers: referrerRows.map((r) => ({ url: String(r.url), sessions: num(r.sessions) })),
    campaigns,
    contents,
    terms,
    inApps,
    // 귀속 가입만 있고 기간 내 방문이 없는 AI 소스도 남긴다(표의 가입 합 = 채널 표의 ai 가입)
    ai: sources
      .filter((s) => s.channel === "ai" && (s.sessions > 0 || s.signups > 0))
      .map((s) => ({ source: s.source, sessions: s.sessions, visitors: s.visitors, signups: s.signups, revenue: s.revenue })),
    clickIds,
    trackedLinks,
    channelSeries,
    totals: {
      sessions: num(totalRow?.sessions),
      visitors: num(totalRow?.visitors),
      signups: signupTotal,
      signupsTotal: num(signupsTotalRow[0]?.n),
      revenue: revenueTotal,
    },
  };
}
