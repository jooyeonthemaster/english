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

/** app_events 멤버 — eventType 으로 카테고리를 가른다. */
function appEventsMember(from: Date | null): Prisma.Sql {
  const where = from ? Prisma.sql`WHERE "createdAt" >= ${from}` : Prisma.empty;
  // 타임라인(_sources.ts)과 동일한 분기 순서: PAGE_VIEW→PAGE_VIEW, LOGIN→AUTH, 그 외→EXPORT.
  return Prisma.sql`SELECT "academyId" AS academy_id, "createdAt" AS created_at, CASE WHEN "eventType" = 'PAGE_VIEW' THEN 'PAGE_VIEW' WHEN "eventType" = 'LOGIN' THEN 'AUTH' ELSE 'EXPORT' END AS category FROM "app_events" ${where}`;
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
