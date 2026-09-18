// ============================================================================
// 리포트: 추적 링크 — 링크 목록 + 기간 통계(클릭·유입 세션·가입·매출) + 클릭 추이
// 계약: docs/analytics/analytics-spec.md §2.5, §2.6, §10, I9
//
// - totalClicks  = analytics_tracked_links.clicks (누적, 봇 제외)
// - periodClicks = analytics_link_clicks 기간 내 · isBot=false
// - sessions/visitors = analytics_sessions trackedLink=slug · 기간(startedAt) · 공용 필터(내부 제외 기본)
//   ※ 공용 필터 중 `link` 는 표의 각 행이 곧 링크이므로 무시한다(다른 링크 행이 0 이 되는 착시 방지).
// - signups = §6.4 최초 유입(first-touch) 귀속 — acquisitionCte("first") 가 뽑은 학원별 단일 방문자의
//   firstTrackedLink 가 이 링크인 학원 수. 개요 signupsTracked·인기 페이지 가입과 같은 규칙이라
//   한 학원이 두 링크에 중복 계상되지 않고(학원당 방문자 1명), 가입 이후에 처음 온 방문자는 빠진다.
// - revenue = 그 학원들의 기간 내 충전 순매출(academyNetRevenueSql — I9, 학원 귀속은 충전만)
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/seo/config";
import { getAdminSession } from "@/lib/auth-admin";
import { academyCreatedBetween, acquisitionCte } from "../attribution";
import {
  academyNetRevenueSql,
  kstBucketExpr,
  num,
  sessionFilterSql,
  sessionWhere,
  type AnalyticsQuery,
} from "../query";
import { bucketKeys } from "../time";

export interface TrackedLinkRow {
  id: string;
  slug: string;
  label: string;
  destination: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  note: string | null;
  isActive: boolean;
  /** ISO */
  createdAt: string;
  totalClicks: number;
  periodClicks: number;
  sessions: number;
  visitors: number;
  signups: number;
  revenue: number;
  clickSeries: Array<{ key: string; clicks: number }>;
}

export interface LinksReport {
  links: TrackedLinkRow[];
  /** 짧은 주소 기준 URL(SITE.url, 후행 슬래시 없음) */
  shortBase: string;
  /** 링크 만들기·수정·삭제·활성 토글 가능 여부(SUPER_ADMIN 만) — 화면이 컨트롤을 숨기는 근거 */
  canEdit: boolean;
}

type Rows = Array<Record<string, unknown>>;

export async function getLinksReport(q: AnalyticsQuery): Promise<LinksReport> {
  const { from, to } = q.period;
  // 표의 행 자체가 링크 — link 필터는 세션 집계에서 뺀다.
  const sq: AnalyticsQuery = { ...q, filters: { ...q.filters, link: undefined } };

  const [session, links, clickTotals, clickBuckets, sessionRows, signupRows] = await Promise.all([
    getAdminSession(),
    prisma.analyticsTrackedLink.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        slug: true,
        label: true,
        destination: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        utmTerm: true,
        note: true,
        isActive: true,
        createdAt: true,
        clicks: true,
      },
    }),
    prisma.$queryRaw<Rows>(Prisma.sql`
      SELECT c."linkId" AS "linkId", COUNT(*) AS clicks
      FROM "analytics_link_clicks" c
      WHERE c."createdAt" >= ${from} AND c."createdAt" < ${to} AND c."isBot" = false
      GROUP BY 1`),
    prisma.$queryRaw<Rows>(Prisma.sql`
      SELECT c."linkId" AS "linkId", ${kstBucketExpr(q, `c."createdAt"`)} AS key, COUNT(*) AS clicks
      FROM "analytics_link_clicks" c
      WHERE c."createdAt" >= ${from} AND c."createdAt" < ${to} AND c."isBot" = false
      GROUP BY 1, 2`),
    prisma.$queryRaw<Rows>(Prisma.sql`
      SELECT s."trackedLink" AS slug, COUNT(*) AS sessions, COUNT(DISTINCT s."visitorId") AS visitors
      FROM "analytics_sessions" s
      WHERE s."trackedLink" IS NOT NULL AND ${sessionWhere(sq)}
      GROUP BY 1`),
    // §6.4 최초 유입 귀속 — 개요 signupsTracked 와 같은 CTE·같은 필터를 쓴다(D8: 내부 트래픽 토글 무관).
    prisma.$queryRaw<Rows>(Prisma.sql`
      WITH ${acquisitionCte("first", academyCreatedBetween(from, to))}
      SELECT v."firstTrackedLink" AS slug,
             COUNT(*) AS signups,
             COALESCE(SUM(${academyNetRevenueSql(`acq."academyId"`, from, to)}), 0) AS revenue
      FROM acq
      JOIN "analytics_visitors" v ON v."id" = acq."visitorId"
      JOIN "analytics_sessions" s ON s."id" = acq."sessionId"
      WHERE v."firstTrackedLink" IS NOT NULL AND ${sessionFilterSql({ ...sq, includeInternal: true })}
      GROUP BY 1`),
  ]);

  const periodClicks = new Map(clickTotals.map((r) => [String(r.linkId), num(r.clicks)]));
  const sessions = new Map(sessionRows.map((r) => [String(r.slug), r]));
  const signups = new Map(signupRows.map((r) => [String(r.slug), r]));
  const buckets = new Map<string, Map<string, number>>();
  for (const r of clickBuckets) {
    const id = String(r.linkId);
    let m = buckets.get(id);
    if (!m) {
      m = new Map();
      buckets.set(id, m);
    }
    m.set(String(r.key), num(r.clicks));
  }
  const keys = bucketKeys(q.period);

  return {
    shortBase: SITE.url,
    canEdit: session?.role === "SUPER_ADMIN",
    links: links.map((l) => {
      const s = sessions.get(l.slug);
      const g = signups.get(l.slug);
      const b = buckets.get(l.id);
      return {
        id: l.id,
        slug: l.slug,
        label: l.label,
        destination: l.destination,
        utmSource: l.utmSource,
        utmMedium: l.utmMedium,
        utmCampaign: l.utmCampaign,
        utmContent: l.utmContent,
        utmTerm: l.utmTerm,
        note: l.note,
        isActive: l.isActive,
        createdAt: l.createdAt.toISOString(),
        totalClicks: l.clicks,
        periodClicks: periodClicks.get(l.id) ?? 0,
        sessions: num(s?.sessions),
        visitors: num(s?.visitors),
        signups: num(g?.signups),
        revenue: num(g?.revenue),
        clickSeries: keys.map((key) => ({ key, clicks: b?.get(key) ?? 0 })),
      };
    }),
  };
}
