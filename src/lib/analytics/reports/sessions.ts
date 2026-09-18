// ============================================================================
// 리포트: 방문 여정 — 세션 탐색기(목록) + 세션 1건 상세(이벤트 타임라인·같은 방문자 세션)
// 계약: docs/analytics/analytics-spec.md §2.1~2.3, §5, §10 (sessions, session)
//
// 연결 학원 판정: 세션 자체의 academyId(로그인 상태 방문)가 우선, 없으면 그 방문자(브라우저)에
// 연결된 academyId — 가입 전 익명 방문도 "나중에 어느 학원이 됐는지" 보이게 한다.
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { num, sessionFilterSql, sessionWhere, type AnalyticsQuery } from "../query";
import type { SessionDetailReport, SessionListParams, SessionListReport } from "./sessions-types";

export const SESSIONS_PAGE_SIZE_DEFAULT = 50;
export const SESSIONS_PAGE_SIZE_MAX = 100;
/** 세션 1건 상세에서 돌려주는 이벤트 상한(병적으로 긴 세션 방어) */
export const SESSION_EVENTS_LIMIT = 2000;
const OTHER_SESSIONS_LIMIT = 20;

export type {
  SessionListRow,
  SessionListReport,
  SessionListParams,
  SessionDetail,
  SessionVisitor,
  SessionEventRow,
  OtherSessionRow,
  SessionDetailReport,
} from "./sessions-types";

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function iso(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function isoOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : iso(v);
}

function intOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : num(v);
}

function positiveInt(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** LIKE 와일드카드(%, _)와 이스케이프 문자를 리터럴로 */
function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const DIGITS_RE = /^\d+$/;
/** 학원 id 형식(cuid 계열). 실DB 308곳 전부 25자 [A-Za-z0-9] — 여유를 두되 길이 상한은 둔다. */
const ACADEMY_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * 목록 전용 파라미터. 페이지 번호는 `pageNo` — `page` 는 공용 필터 키(본 페이지 경로)와 겹치기 때문.
 * 호환: `pageNo` 가 없고 `page` 가 숫자뿐이면 페이지 번호로 본다(경로 필터 값은 항상 "/" 로 시작).
 */
export function parseSessionListParams(sp: URLSearchParams): SessionListParams {
  const legacyPage = sp.get("page");
  const pageRaw = sp.get("pageNo") ?? (legacyPage && DIGITS_RE.test(legacyPage) ? legacyPage : null);
  const page = Math.min(positiveInt(pageRaw, 1), 100_000);
  const pageSize = Math.min(positiveInt(sp.get("pageSize"), SESSIONS_PAGE_SIZE_DEFAULT), SESSIONS_PAGE_SIZE_MAX);
  const academyRaw = sp.get("academyId")?.trim() ?? "";
  const academyInvalid = academyRaw.length > 0 && !ACADEMY_ID_RE.test(academyRaw);
  const academyId = academyInvalid ? null : academyRaw || null;
  const searchRaw = sp.get("q")?.trim() ?? "";
  const search = searchRaw ? searchRaw.slice(0, 100) : null;
  return {
    page,
    pageSize,
    academyId,
    academyInvalid,
    allTime: !!academyId && sp.get("all") === "1",
    search,
  };
}

/** 숫자뿐인 `page` 는 페이지 번호 별칭이므로 공용 필터(본 페이지)에서 뺀다. */
export function withoutPageNumberFilter(q: AnalyticsQuery): AnalyticsQuery {
  if (!q.filters.page || !DIGITS_RE.test(q.filters.page)) return q;
  const filters = { ...q.filters };
  delete filters.page;
  return { ...q, filters };
}

/** 세션 목록 FROM 절 — s(세션) · v(방문자) · ac(연결 학원) */
const LIST_FROM = Prisma.sql`
  FROM "analytics_sessions" s
  LEFT JOIN "analytics_visitors" v ON v."id" = s."visitorId"
  LEFT JOIN "academies" ac ON ac."id" = COALESCE(s."academyId", v."academyId")`;

function listWhere(q: AnalyticsQuery, p: SessionListParams): Prisma.Sql {
  const parts: Prisma.Sql[] = [p.allTime ? sessionFilterSql(q) : sessionWhere(q)];
  // 잘못된 academyId 는 필터를 버리지 않고 빈 결과로(무필터 전체 목록이 학원 기록으로 둔갑하는 것 방지)
  if (p.academyInvalid) parts.push(Prisma.sql`FALSE`);
  if (p.academyId) {
    parts.push(
      Prisma.sql`(s."academyId" = ${p.academyId} OR s."visitorId" IN (SELECT va."id" FROM "analytics_visitors" va WHERE va."academyId" = ${p.academyId}))`,
    );
  }
  if (p.search) parts.push(Prisma.sql`ac."name" ILIKE ${likeContains(p.search)}`);
  return Prisma.join(parts, " AND ");
}

export async function getSessionList(q: AnalyticsQuery, p: SessionListParams): Promise<SessionListReport> {
  const where = listWhere(q, p);
  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw<Array<{ n: unknown }>>(Prisma.sql`SELECT COUNT(*) AS n ${LIST_FROM} WHERE ${where}`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT s."id", s."visitorId", s."startedAt", s."lastSeenAt", s."engagedMs", s."pageviews", s."eventsCount",
             s."entryPath", s."exitPath", s."channel", s."source", s."campaign", s."referrerHost",
             s."deviceType", s."os", s."browser", s."inApp", s."country", s."region", s."city",
             s."isNewVisitor", s."hasConversion",
             COALESCE(s."academyId", v."academyId") AS "academyId", ac."name" AS "academyName"
      ${LIST_FROM}
      WHERE ${where}
      ORDER BY s."startedAt" DESC, s."id" DESC
      LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}`),
  ]);

  return {
    total: num(countRows[0]?.n),
    page: p.page,
    pageSize: p.pageSize,
    rows: rows.map((r) => ({
      id: String(r.id),
      visitorId: String(r.visitorId),
      startedAt: iso(r.startedAt),
      lastSeenAt: iso(r.lastSeenAt),
      engagedMs: num(r.engagedMs),
      pageviews: num(r.pageviews),
      eventsCount: num(r.eventsCount),
      entryPath: String(r.entryPath),
      exitPath: str(r.exitPath),
      channel: String(r.channel),
      source: str(r.source),
      campaign: str(r.campaign),
      referrerHost: str(r.referrerHost),
      deviceType: str(r.deviceType),
      os: str(r.os),
      browser: str(r.browser),
      inApp: str(r.inApp),
      country: str(r.country),
      region: str(r.region),
      city: str(r.city),
      isNewVisitor: r.isNewVisitor === true,
      hasConversion: r.hasConversion === true,
      academyId: str(r.academyId),
      academyName: str(r.academyName),
    })),
  };
}

/** 세션 1건 상세. 없으면 null(라우트가 404). */
export async function getSessionDetail(id: string): Promise<SessionDetailReport | null> {
  const [s] = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT s.*, ac."name" AS "academyName",
           (SELECT st."id" FROM "staff" st
             WHERE st."academyId" = COALESCE(s."academyId", v."academyId") AND st."role" = 'DIRECTOR'
             -- 「회원 상세(원장)」 공용 규칙: 활성 우선 → 최초 생성 → id (감독 확정, 화면 간 동일 계정 보장)
             ORDER BY st."isActive" DESC, st."createdAt" ASC, st."id" ASC LIMIT 1) AS "directorStaffId"
    FROM "analytics_sessions" s
    LEFT JOIN "analytics_visitors" v ON v."id" = s."visitorId"
    LEFT JOIN "academies" ac ON ac."id" = COALESCE(s."academyId", v."academyId")
    WHERE s."id" = ${id}
    LIMIT 1`);
  if (!s) return null;
  const visitorId = String(s.visitorId);

  const [visitorRows, eventRows, otherRows] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT v."id", v."firstSeenAt", v."sessionCount", v."pageviewCount", v."firstSessionId",
             v."firstChannel", v."firstSource", v."firstMedium", v."firstCampaign", v."firstReferrerHost",
             v."firstLandingPath", v."firstTrackedLink", v."academyId", v."linkedAt"
      FROM "analytics_visitors" v WHERE v."id" = ${visitorId} LIMIT 1`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT e."id", e."type", e."name", e."path", e."title", e."prevPath", e."engagedMs", e."scrollPct", e."props", e."createdAt"
      FROM "analytics_events" e
      WHERE e."sessionId" = ${id}
      ORDER BY e."createdAt" ASC, e."id" ASC
      LIMIT ${SESSION_EVENTS_LIMIT}`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT s."id", s."startedAt", s."channel", s."source", s."pageviews", s."engagedMs", s."hasConversion"
      FROM "analytics_sessions" s
      WHERE s."visitorId" = ${visitorId} AND s."id" <> ${id}
      ORDER BY s."startedAt" DESC, s."id" DESC
      LIMIT ${OTHER_SESSIONS_LIMIT}`),
  ]);

  const v = visitorRows[0];
  return {
    session: {
      id: String(s.id),
      visitorId,
      startedAt: iso(s.startedAt),
      lastSeenAt: iso(s.lastSeenAt),
      engagedMs: num(s.engagedMs),
      pageviews: num(s.pageviews),
      eventsCount: num(s.eventsCount),
      isNewVisitor: s.isNewVisitor === true,
      entryPath: String(s.entryPath),
      entryTitle: str(s.entryTitle),
      exitPath: str(s.exitPath),
      hostname: str(s.hostname),
      referrer: str(s.referrer),
      referrerHost: str(s.referrerHost),
      channel: String(s.channel),
      source: str(s.source),
      medium: str(s.medium),
      campaign: str(s.campaign),
      term: str(s.term),
      content: str(s.content),
      clickIdType: str(s.clickIdType),
      trackedLink: str(s.trackedLink),
      landingQuery: str(s.landingQuery),
      deviceType: str(s.deviceType),
      browser: str(s.browser),
      browserVersion: str(s.browserVersion),
      os: str(s.os),
      inApp: str(s.inApp),
      screen: str(s.screen),
      language: str(s.language),
      timezone: str(s.timezone),
      country: str(s.country),
      region: str(s.region),
      city: str(s.city),
      academyId: str(s.academyId),
      staffId: str(s.staffId),
      isInternal: s.isInternal === true,
      hasConversion: s.hasConversion === true,
      academyName: str(s.academyName),
      directorStaffId: str(s.directorStaffId),
    },
    visitor: v
      ? {
          id: String(v.id),
          firstSeenAt: iso(v.firstSeenAt),
          sessionCount: num(v.sessionCount),
          pageviewCount: num(v.pageviewCount),
          firstSessionId: str(v.firstSessionId),
          firstChannel: str(v.firstChannel),
          firstSource: str(v.firstSource),
          firstMedium: str(v.firstMedium),
          firstCampaign: str(v.firstCampaign),
          firstReferrerHost: str(v.firstReferrerHost),
          firstLandingPath: str(v.firstLandingPath),
          firstTrackedLink: str(v.firstTrackedLink),
          academyId: str(v.academyId),
          linkedAt: isoOrNull(v.linkedAt),
        }
      : null,
    events: eventRows.map((e) => ({
      id: String(e.id),
      type: String(e.type),
      name: str(e.name),
      path: String(e.path),
      title: str(e.title),
      prevPath: str(e.prevPath),
      engagedMs: intOrNull(e.engagedMs),
      scrollPct: intOrNull(e.scrollPct),
      props: e.props ?? null,
      createdAt: iso(e.createdAt),
    })),
    otherSessions: otherRows.map((o) => ({
      id: String(o.id),
      startedAt: iso(o.startedAt),
      channel: String(o.channel),
      source: str(o.source),
      pageviews: num(o.pageviews),
      engagedMs: num(o.engagedMs),
      hasConversion: o.hasConversion === true,
    })),
  };
}
