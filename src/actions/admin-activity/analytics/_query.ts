// ============================================================================
// 활동 분석 — 쿼리 레이어 (내부 모듈, "use server" 아님).
//
// 타임라인과 동일한 9-소스 유니온을 일별/학원별로 집계한다. 원시 행을 전부
// JS로 끌어오지 않고 Postgres에서 GROUP BY로 줄여 받는다(학원 ~80곳이라
// 결과는 작다). 일자 버킷은 KST(Asia/Seoul) 기준.
//
// 주의: 9개 소스 테이블의 컬럼은 모두 camelCase("academyId","createdAt")라
// 원시 SQL에서 반드시 쌍따옴표로 인용한다(Postgres는 무인용 식별자를
// 소문자로 접음). createdAt 은 모두 timestamp(UTC 보관)이므로
// (t AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date 로 KST 일자를 얻는다.
// ============================================================================

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PlanTier } from "@/lib/admin-analytics-types";
import type { ActivityCategory } from "@/lib/admin-activity-types";

// ─── 소스 유니온 ─────────────────────────────────────────────────────────────

/** 도메인 잡/콘텐츠 테이블 1개의 유니온 멤버 (academy_id, created_at, 고정 카테고리). */
function jobMember(
  table: string,
  category: string,
  from: Date | null,
): Prisma.Sql {
  const where = from ? Prisma.sql`WHERE "createdAt" >= ${from}` : Prisma.empty;
  return Prisma.sql`SELECT "academyId" AS academy_id, "createdAt" AS created_at, ${category}::text AS category FROM ${Prisma.raw(
    `"${table}"`,
  )} ${where}`;
}

// ─── app_events 분류 (관리자 활동 피드와 같은 규칙) ─────────────────────────────
//
// 종전 CASE 는 PAGE_VIEW·LOGIN 이 아니면 전부 EXPORT 로 셌다. 그래서 지문 삭제(PASSAGE_DELETE)와
// 준비 실패로 print() 를 부르지도 못한 인쇄(EXAM_EXPORT format 'print', outcome 'blocked' 등)가 내보내기
// 통계에 섞였다(26-09-30). 이제 피드(_app-event-activity.ts describeAppEvent)의 분류를 따른다:
//   · PAGE_VIEW → PAGE_VIEW, LOGIN → AUTH, PASSAGE_DELETE → CONTENT, *_EXPORT → EXPORT, 그 밖 → CONTENT
//   · 인쇄는 outcome 이 'printed'(또는 원격 측정 이전 행처럼 없음)일 때만 내보내기다. 그 밖의 outcome 은
//     피드에서 FAILED(「시험지 인쇄 실패/미완료」)이고, 분석 유니온에서는 뺀다(만든 것이 없는 원격 측정).
// 규칙은 표 하나(APP_EVENT_CATEGORY_RULES)에서 SQL(CASE)과 JS 판정(appEventAnalyticsCategory)을 함께 만든다
// — 단위 테스트가 JS 판정을 피드 분류와 대조하고, SQL 은 같은 표에서 나왔음을 문자열로 확인한다.

type AppEventRule =
  | { eventType: string; category: ActivityCategory }
  | { eventTypeSuffix: string; category: ActivityCategory };

/** 위에서부터 첫 일치. 어디에도 안 맞으면 APP_EVENT_FALLBACK_CATEGORY. */
export const APP_EVENT_CATEGORY_RULES: readonly AppEventRule[] = [
  { eventType: "PAGE_VIEW", category: "PAGE_VIEW" },
  { eventType: "LOGIN", category: "AUTH" },
  { eventType: "PASSAGE_DELETE", category: "CONTENT" },
  { eventTypeSuffix: "_EXPORT", category: "EXPORT" },
];
export const APP_EVENT_FALLBACK_CATEGORY: ActivityCategory = "CONTENT";

/** SQL 문자열 상수(규칙 표의 값 — 모두 대문자 · 밑줄뿐이라 인용만 하면 된다). */
function sqlLiteral(value: string): string {
  if (!/^[A-Z_]+$/.test(value)) throw new Error(`app_events rule literal must be [A-Z_]+: ${value}`);
  return `'${value}'`;
}

function ruleCondition(rule: AppEventRule): string {
  return "eventType" in rule
    ? `"eventType" = ${sqlLiteral(rule.eventType)}`
    : `right("eventType", ${rule.eventTypeSuffix.length}) = ${sqlLiteral(rule.eventTypeSuffix)}`;
}

/** app_events 행 → 값 CASE 식(분류 → 표시값 매핑을 받는다 — 기능 유니온이 같은 규칙으로 기능명을 만든다). */
export function appEventCaseSql(label: (category: ActivityCategory) => string): Prisma.Sql {
  const whens = APP_EVENT_CATEGORY_RULES.map(
    (rule) => `WHEN ${ruleCondition(rule)} THEN ${sqlLiteral(label(rule.category))}`,
  );
  return Prisma.raw(`CASE ${whens.join(" ")} ELSE ${sqlLiteral(label(APP_EVENT_FALLBACK_CATEGORY))} END`);
}

/**
 * 끝나지 않은 인쇄(print() 에 이르지 못함) — 분석에서 뺀다. 피드(describePrint)처럼 outcome 이 빈 문자열이
 * 아닌 **문자열**이고 'printed' 가 아닐 때만이다(없음 · null · 숫자는 원격 측정 이전 행으로 보고 내보내기).
 * NULL 안전: 식이 NULL 이 되면 `NOT (…)` 가 행을 조용히 떨어뜨리므로 IS NOT DISTINCT FROM · COALESCE 로 감싼다.
 */
export const APP_EVENT_UNFINISHED_PRINT_SQL = Prisma.raw(
  `("eventType" = 'EXAM_EXPORT' AND ("metadata"->>'format') IS NOT DISTINCT FROM 'print' AND COALESCE(jsonb_typeof("metadata"->'outcome') = 'string' AND ("metadata"->>'outcome') NOT IN ('printed', ''), false))`,
);

/** JS 판정(같은 규칙 표) — 분석 유니온에 들어가면 그 분류, 빠지면(끝나지 않은 인쇄) null. */
export function appEventAnalyticsCategory(eventType: string, metadata: unknown): ActivityCategory | null {
  const meta =
    typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const outcome = typeof meta.outcome === "string" && meta.outcome.length > 0 ? meta.outcome : "printed";
  if (eventType === "EXAM_EXPORT" && meta.format === "print" && outcome !== "printed") return null;
  for (const rule of APP_EVENT_CATEGORY_RULES) {
    if ("eventType" in rule ? eventType === rule.eventType : eventType.endsWith(rule.eventTypeSuffix)) {
      return rule.category;
    }
  }
  return APP_EVENT_FALLBACK_CATEGORY;
}

/** app_events 멤버 — 피드와 같은 분류(APP_EVENT_CATEGORY_RULES), 끝나지 않은 인쇄는 제외. */
function appEventsMember(from: Date | null): Prisma.Sql {
  const conds = [Prisma.sql`NOT ${APP_EVENT_UNFINISHED_PRINT_SQL}`];
  if (from) conds.unshift(Prisma.sql`"createdAt" >= ${from}`);
  return Prisma.sql`SELECT "academyId" AS academy_id, "createdAt" AS created_at, ${appEventCaseSql((c) => c)} AS category FROM "app_events" WHERE ${Prisma.join(conds, " AND ")}`;
}

/** 9-소스 유니온 (타임라인 _sources.ts 와 동일 집합). */
function buildUnion(from: Date | null): Prisma.Sql {
  const members = [
    appEventsMember(from),
    jobMember("extraction_jobs", "EXTRACTION", from),
    jobMember("workbench_ai_jobs", "AI_GENERATION", from),
    jobMember("similar_exam_generation_jobs", "AI_GENERATION", from),
    jobMember("similar_question_generation_jobs", "AI_GENERATION", from),
    jobMember("custom_question_generation_jobs", "AI_GENERATION", from),
    jobMember("passages", "CONTENT", from),
    jobMember("exams", "CONTENT", from),
    jobMember("passage_reports", "CONTENT", from),
  ];
  return Prisma.join(members, " UNION ALL ");
}

/** KST 일자 텍스트 식 ('YYYY-MM-DD'). 인자는 timestamp 컬럼식. */
const KST_DAY = (col: string) =>
  Prisma.raw(
    `to_char(((${col}) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD')`,
  );

// ─── 결과 타입 ───────────────────────────────────────────────────────────────

export interface MatrixRow {
  academyId: string;
  /** 'YYYY-MM-DD' (KST) */
  day: string;
  category: string;
  cnt: number;
}

export interface BoundsRow {
  academyId: string;
  firstAt: Date;
  lastAt: Date;
  total: number;
}

export interface DirectoryRow {
  academyId: string;
  name: string | null;
  status: string;
  signupAt: Date;
  planTier: PlanTier;
  planStatus: string | null;
}

// ─── 쿼리 ────────────────────────────────────────────────────────────────────

/** 오늘 KST 일자 'YYYY-MM-DD'. */
export async function fetchTodayKst(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ today: string }>>(
    Prisma.sql`SELECT to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS today`,
  );
  // 폴백도 KST 기준으로 (now() 쿼리는 항상 1행이라 사실상 도달 불가지만 일관성 유지).
  return (
    rows[0]?.today ??
    new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
  );
}

/**
 * 윈도우 일별 매트릭스: (학원, KST일자, 카테고리)별 활동 건수.
 * from(포함) 이후 활동만. 결과 크기 ≈ 학원수 × 일수 × 카테고리.
 */
export async function fetchDailyMatrix(from: Date): Promise<MatrixRow[]> {
  const union = buildUnion(from);
  const rows = await prisma.$queryRaw<
    Array<{ academy_id: string; day: string; category: string; cnt: number }>
  >(Prisma.sql`
    WITH evt AS (${union})
    SELECT academy_id, ${KST_DAY("created_at")} AS day, category, COUNT(*)::int AS cnt
    FROM evt
    GROUP BY 1, 2, 3
  `);
  return rows.map((r) => ({
    academyId: r.academy_id,
    day: r.day,
    category: r.category,
    cnt: Number(r.cnt),
  }));
}

/**
 * 학원별 전체 기간 경계: 최초 활동 / 최근 활동 / 누적 건수.
 * 활성화·리텐션 코호트는 윈도우가 아니라 전체 기간이 필요하므로 별도 조회.
 */
export async function fetchAcademyBounds(): Promise<BoundsRow[]> {
  const union = buildUnion(null);
  const rows = await prisma.$queryRaw<
    Array<{
      academy_id: string;
      first_at: Date;
      last_at: Date;
      total: number;
    }>
  >(Prisma.sql`
    WITH evt AS (${union})
    SELECT academy_id, MIN(created_at) AS first_at, MAX(created_at) AS last_at, COUNT(*)::int AS total
    FROM evt
    GROUP BY 1
  `);
  return rows.map((r) => ({
    academyId: r.academy_id,
    firstAt: r.first_at,
    lastAt: r.last_at,
    total: Number(r.total),
  }));
}

/** 전체 학원 디렉터리: 가입일·상태·플랜(최신 구독). */
export async function fetchAcademyDirectory(): Promise<DirectoryRow[]> {
  const academies = await prisma.academy.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      subscriptions: {
        select: { status: true, plan: { select: { tier: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });
  return academies.map((a) => {
    // 표시 플랜은 "유효한" 구독 우선(최신 CANCELLED가 과거 ACTIVE를 가리지 않도록).
    const subs = a.subscriptions;
    const effective =
      subs.find((s) =>
        ["ACTIVE", "TRIAL", "PAST_DUE"].includes(s.status),
      ) ?? subs[0];
    const sub = effective;
    const tier = (sub?.plan?.tier ?? "NONE") as PlanTier;
    return {
      academyId: a.id,
      name: a.name,
      status: a.status,
      signupAt: a.createdAt,
      planTier: tier,
      planStatus: sub?.status ?? null,
    };
  });
}
