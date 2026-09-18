// ============================================================================
// 리포트: 페이지 — 인기 페이지·진입/종료 페이지·영역 비중·페이지 흐름.
// 계약: docs/analytics/analytics-spec.md §2.3, §3.4(pathGroup), §3.5, §5, §6.4, §10
//
// 정의:
// - 인기 페이지: 기간(createdAt) 안의 pageview 이벤트를 path 로 묶는다(세션 필터 적용).
//   avgEngagedMs/avgScrollPct = 이벤트 engagedMs/scrollPct 평균(NULL 제외, 값이 하나도 없으면 null).
//   exits = 이 경로를 본 세션 중 exitPath 가 이 경로인 세션 수, exitRate = exits / sessions(이 경로를 본 세션).
//   entries = 이 경로를 본 세션 중 entryPath 가 이 경로인 세션 수.
// - 진입 페이지: 기간(startedAt) 안의 세션을 entryPath 로 묶는다. avgEngagedMs = 세션 engagedMs 평균(§5).
//   signups = §6.4 최초 유입(first-touch) 귀속 — 기간 내 가입 학원 중 acquisitionCte("first") 세션의
//   entryPath 가 이 경로인 학원 수(개요 signupsTracked 와 같은 정의 → 전 행 합 = 개요 「유입 추적 가입」).
// - 종료 페이지: 인기 페이지 집계의 exits/exitRate 를 exits 순으로.
// - group=1: SQL 은 원본 path 로 최대 3000행을 받고 JS 에서 pathGroup() 으로 합산.
//   가산 지표(PV·exits·entries·체류/스크롤 합계)는 합산, 방문자·세션(distinct)은 묶음별 SQL 재집계로 정확히 센다.
// - flow: 선택 경로(묶음이면 구성 원본 경로 전체)의 pageview 에 대해
//   previous = 그 이벤트들의 prevPath Top, next = prevPath 가 선택 경로인 pageview 의 path Top.
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pathGroup } from "../sanitize";
import { acquisitionCte, academyCreatedBetween } from "../attribution";
import { BOUNCE_SQL, eventWhere, num, pct, sessionFilterSql, sessionWhere, type AnalyticsQuery } from "../query";

/** SQL 이 원본 path 로 받는 최대 행 수(그룹핑 재집계 입력) */
const RAW_PATH_LIMIT = 3000;
/** 응답 행 수 상한(표 「전체 보기」 용) */
const PAGES_LIMIT = 200;
const ENTRY_LIMIT = 100;
const EXIT_LIMIT = 100;
const FLOW_RAW_LIMIT = 500;
const FLOW_TOP = 10;

export interface PageRow {
  path: string;
  /** 경로의 최신 title(없으면 null) */
  title: string | null;
  pageviews: number;
  visitors: number;
  sessions: number;
  avgEngagedMs: number | null;
  avgScrollPct: number | null;
  exits: number;
  exitRate: number;
  entries: number;
}

export interface EntryPageRow {
  path: string;
  sessions: number;
  /** 세션 0(가입 귀속만 있는 행)이면 null */
  bounceRate: number | null;
  avgEngagedMs: number | null;
  signups: number;
}

export interface ExitPageRow {
  path: string;
  exits: number;
  exitRate: number;
}

export interface AreaRow {
  area: string;
  pageviews: number;
  visitors: number;
}

export interface FlowStep {
  path: string;
  count: number;
}

export interface PageFlow {
  path: string;
  previous: FlowStep[];
  next: FlowStep[];
  totalViews: number;
}

export interface PagesReport {
  pages: PageRow[];
  entryPages: EntryPageRow[];
  exitPages: ExitPageRow[];
  areas: AreaRow[];
  flow: PageFlow | null;
  grouped: boolean;
}

export interface PagesOptions {
  grouped: boolean;
  flow: string | null;
}

export function parsePagesOptions(sp: URLSearchParams): PagesOptions {
  const raw = sp.get("flow");
  const flow = raw && raw.startsWith("/") && raw.length <= 500 ? raw : null;
  return { grouped: sp.get("group") === "1", flow };
}

type Row = Record<string, unknown>;

interface PathAgg {
  path: string;
  members: string[];
  pageviews: number;
  visitors: number;
  sessions: number;
  engagedSum: number;
  engagedN: number;
  scrollSum: number;
  scrollN: number;
  exits: number;
  entries: number;
  title: string | null;
  titleAt: number;
}

function byCountThenPath<T extends { path: string }>(count: (r: T) => number) {
  return (a: T, b: T) => count(b) - count(a) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

async function rawPathRows(q: AnalyticsQuery): Promise<PathAgg[]> {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT e."path" AS path,
           COUNT(*) AS pageviews,
           COUNT(DISTINCT e."visitorId") AS visitors,
           COUNT(DISTINCT e."sessionId") AS sessions,
           COALESCE(SUM(e."engagedMs"), 0) AS "engagedSum",
           COUNT(e."engagedMs") AS "engagedN",
           COALESCE(SUM(e."scrollPct"), 0) AS "scrollSum",
           COUNT(e."scrollPct") AS "scrollN",
           COUNT(DISTINCT e."sessionId") FILTER (WHERE s."exitPath" = e."path") AS exits,
           COUNT(DISTINCT e."sessionId") FILTER (WHERE s."entryPath" = e."path") AS entries,
           (ARRAY_AGG(e."title" ORDER BY e."createdAt" DESC) FILTER (WHERE e."title" IS NOT NULL AND e."title" <> ''))[1] AS title,
           MAX(e."createdAt") FILTER (WHERE e."title" IS NOT NULL AND e."title" <> '') AS "titleAt"
    FROM "analytics_events" e JOIN "analytics_sessions" s ON s."id" = e."sessionId"
    WHERE e."type" = 'pageview' AND ${eventWhere(q)}
    GROUP BY e."path"
    ORDER BY 2 DESC, 1 ASC
    LIMIT ${RAW_PATH_LIMIT}`);
  return rows.map((r) => {
    const path = String(r.path);
    const titleAt = r.titleAt instanceof Date ? r.titleAt.getTime() : 0;
    return {
      path,
      members: [path],
      pageviews: num(r.pageviews),
      visitors: num(r.visitors),
      sessions: num(r.sessions),
      engagedSum: num(r.engagedSum),
      engagedN: num(r.engagedN),
      scrollSum: num(r.scrollSum),
      scrollN: num(r.scrollN),
      exits: num(r.exits),
      entries: num(r.entries),
      title: typeof r.title === "string" && r.title ? r.title : null,
      titleAt,
    };
  });
}

/** 원본 path 행 → pathGroup 묶음(가산 지표 합산, 최신 title 유지). */
function groupPathRows(rows: PathAgg[]): PathAgg[] {
  const map = new Map<string, PathAgg>();
  for (const r of rows) {
    const key = pathGroup(r.path);
    const g = map.get(key);
    if (!g) {
      map.set(key, { ...r, path: key, members: [r.path] });
      continue;
    }
    g.members.push(r.path);
    g.pageviews += r.pageviews;
    g.visitors += r.visitors;
    g.sessions += r.sessions;
    g.engagedSum += r.engagedSum;
    g.engagedN += r.engagedN;
    g.scrollSum += r.scrollSum;
    g.scrollN += r.scrollN;
    g.exits += r.exits;
    g.entries += r.entries;
    if (r.title && r.titleAt > g.titleAt) {
      g.title = r.title;
      g.titleAt = r.titleAt;
    }
  }
  return [...map.values()];
}

/** 원본 경로 2개 이상이 합쳐진 묶음의 방문자·세션을 distinct 로 다시 센다(합산은 중복 계수). */
async function fixGroupDistincts(q: AnalyticsQuery, groups: PathAgg[]): Promise<void> {
  const paths: string[] = [];
  const keys: string[] = [];
  for (const g of groups) {
    if (g.members.length < 2) continue;
    for (const m of g.members) {
      paths.push(m);
      keys.push(g.path);
    }
  }
  if (paths.length === 0) return;
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT m."grp" AS grp, COUNT(DISTINCT e."visitorId") AS visitors, COUNT(DISTINCT e."sessionId") AS sessions
    FROM unnest(${paths}::text[], ${keys}::text[]) AS m("path", "grp")
    JOIN "analytics_events" e ON e."path" = m."path"
    JOIN "analytics_sessions" s ON s."id" = e."sessionId"
    WHERE e."type" = 'pageview' AND ${eventWhere(q)}
    GROUP BY m."grp"`);
  const byKey = new Map(rows.map((r) => [String(r.grp), r]));
  for (const g of groups) {
    const r = byKey.get(g.path);
    if (g.members.length < 2 || !r) continue;
    g.visitors = num(r.visitors);
    g.sessions = num(r.sessions);
  }
}

function toPageRow(g: PathAgg): PageRow {
  return {
    path: g.path,
    title: g.title,
    pageviews: g.pageviews,
    visitors: g.visitors,
    sessions: g.sessions,
    avgEngagedMs: g.engagedN > 0 ? Math.round(g.engagedSum / g.engagedN) : null,
    avgScrollPct: g.scrollN > 0 ? Math.round(g.scrollSum / g.scrollN) : null,
    exits: g.exits,
    exitRate: pct(g.exits, g.sessions),
    entries: g.entries,
  };
}

interface EntryAgg {
  path: string;
  sessions: number;
  bounces: number;
  engagedSum: number;
  signups: number;
}

async function entryRows(q: AnalyticsQuery, grouped: boolean): Promise<EntryPageRow[]> {
  const [sessions, signups] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT s."entryPath" AS path,
             COUNT(*) AS sessions,
             COUNT(*) FILTER (WHERE ${BOUNCE_SQL}) AS bounces,
             COALESCE(SUM(s."engagedMs"), 0) AS "engagedSum"
      FROM "analytics_sessions" s
      WHERE ${sessionWhere(q)}
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC
      LIMIT ${RAW_PATH_LIMIT}`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH ${acquisitionCte("first", academyCreatedBetween(q.period.from, q.period.to))}
      SELECT s."entryPath" AS path, COUNT(*) AS signups
      FROM acq JOIN "analytics_sessions" s ON s."id" = acq."sessionId"
      WHERE ${sessionFilterSql({ ...q, includeInternal: true })}
      GROUP BY 1`),
  ]);

  const map = new Map<string, EntryAgg>();
  const slot = (raw: unknown): EntryAgg => {
    const path = grouped ? pathGroup(String(raw)) : String(raw);
    let a = map.get(path);
    if (!a) {
      a = { path, sessions: 0, bounces: 0, engagedSum: 0, signups: 0 };
      map.set(path, a);
    }
    return a;
  };
  for (const r of sessions) {
    const a = slot(r.path);
    a.sessions += num(r.sessions);
    a.bounces += num(r.bounces);
    a.engagedSum += num(r.engagedSum);
  }
  for (const r of signups) slot(r.path).signups += num(r.signups);

  return [...map.values()]
    .sort((a, b) => b.sessions - a.sessions || b.signups - a.signups || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, ENTRY_LIMIT)
    .map((a) => ({
      path: a.path,
      sessions: a.sessions,
      bounceRate: a.sessions > 0 ? pct(a.bounces, a.sessions) : null,
      avgEngagedMs: a.sessions > 0 ? Math.round(a.engagedSum / a.sessions) : null,
      signups: a.signups,
    }));
}

async function areaRows(q: AnalyticsQuery): Promise<AreaRow[]> {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT e."area" AS area, COUNT(*) AS pageviews, COUNT(DISTINCT e."visitorId") AS visitors
    FROM "analytics_events" e JOIN "analytics_sessions" s ON s."id" = e."sessionId"
    WHERE e."type" = 'pageview' AND ${eventWhere(q)}
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC`);
  return rows.map((r) => ({ area: String(r.area), pageviews: num(r.pageviews), visitors: num(r.visitors) }));
}

function topSteps(rows: Row[], grouped: boolean): FlowStep[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const path = grouped ? pathGroup(String(r.path)) : String(r.path);
    map.set(path, (map.get(path) ?? 0) + num(r.count));
  }
  return [...map.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort(byCountThenPath<FlowStep>((s) => s.count))
    .slice(0, FLOW_TOP);
}

async function flowReport(q: AnalyticsQuery, flow: string, grouped: boolean, raw: PathAgg[]): Promise<PageFlow> {
  const members = grouped ? raw.filter((r) => pathGroup(r.path) === flow).map((r) => r.path) : [flow];
  if (members.length === 0) members.push(flow);

  const [prevRows, nextRows, total] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT e."prevPath" AS path, COUNT(*) AS count
      FROM "analytics_events" e JOIN "analytics_sessions" s ON s."id" = e."sessionId"
      WHERE e."type" = 'pageview' AND e."path" = ANY(${members}::text[]) AND e."prevPath" IS NOT NULL AND ${eventWhere(q)}
      GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT ${FLOW_RAW_LIMIT}`),
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT e."path" AS path, COUNT(*) AS count
      FROM "analytics_events" e JOIN "analytics_sessions" s ON s."id" = e."sessionId"
      WHERE e."type" = 'pageview' AND e."prevPath" = ANY(${members}::text[]) AND ${eventWhere(q)}
      GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT ${FLOW_RAW_LIMIT}`),
    prisma.$queryRaw<Array<{ n: unknown }>>(Prisma.sql`
      SELECT COUNT(*) AS n
      FROM "analytics_events" e JOIN "analytics_sessions" s ON s."id" = e."sessionId"
      WHERE e."type" = 'pageview' AND e."path" = ANY(${members}::text[]) AND ${eventWhere(q)}`),
  ]);

  return {
    path: flow,
    previous: topSteps(prevRows, grouped),
    next: topSteps(nextRows, grouped),
    totalViews: num(total[0]?.n),
  };
}

export async function getPagesReport(q: AnalyticsQuery, opts: PagesOptions): Promise<PagesReport> {
  const [raw, entryPages, areas] = await Promise.all([rawPathRows(q), entryRows(q, opts.grouped), areaRows(q)]);

  const aggs = opts.grouped ? groupPathRows(raw) : raw;
  const [, flow] = await Promise.all([
    opts.grouped ? fixGroupDistincts(q, aggs) : Promise.resolve(),
    opts.flow ? flowReport(q, opts.flow, opts.grouped, raw) : Promise.resolve(null),
  ]);

  const all = aggs.map(toPageRow);
  const pages = [...all].sort(byCountThenPath<PageRow>((r) => r.pageviews)).slice(0, PAGES_LIMIT);
  const exitPages = all
    .filter((r) => r.exits > 0)
    .sort((a, b) => b.exits - a.exits || b.exitRate - a.exitRate || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, EXIT_LIMIT)
    .map((r) => ({ path: r.path, exits: r.exits, exitRate: r.exitRate }));

  return { pages, entryPages, exitPages, areas, flow, grouped: opts.grouped };
}
