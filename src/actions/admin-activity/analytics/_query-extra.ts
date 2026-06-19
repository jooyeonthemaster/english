// ============================================================================
// 활동 분석 — 확장 쿼리 레이어 (내부 모듈, "use server" 아님).
//
// 기본 _query.ts 의 6-카테고리보다 잘게 나눈 "세부 기능(feature)" 단위 유니온.
// 동일한 9-소스를 기능 태그 + 정규화 상태(SUCCESS/FAILED/PENDING/INFO)로 묶어
// 기능별 일별 추이·채택률·성공률·시간대 히트맵·개별 학원 분해를 만든다.
// 컬럼은 camelCase라 원시 SQL에서 쌍따옴표 필수. 일자/시각은 KST.
// ============================================================================

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ─── 기능 유니온 ─────────────────────────────────────────────────────────────

/** 잡 status → 정규화. DEAD(영구 실패)도 FAILED. PARTIAL/CANCELLED/PROCESSING 등은 '기타'. */
const JOB_STATUS = Prisma.raw(
  `CASE WHEN "status" = 'COMPLETED' THEN 'SUCCESS' WHEN "status" IN ('FAILED', 'DEAD') THEN 'FAILED' ELSE 'PENDING' END`,
);

function whereFrom(from: Date | null, academyId?: string): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (from) parts.push(Prisma.sql`"createdAt" >= ${from}`);
  if (academyId) parts.push(Prisma.sql`"academyId" = ${academyId}`);
  if (parts.length === 0) return Prisma.empty;
  return Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}`;
}

/** 잡 테이블 멤버 (status_norm = 정규화 상태). */
function jobFeature(
  table: string,
  featureExpr: Prisma.Sql,
  from: Date | null,
  academyId?: string,
): Prisma.Sql {
  return Prisma.sql`SELECT "academyId" AS academy_id, "createdAt" AS created_at, ${featureExpr} AS feature, ${JOB_STATUS} AS status_norm FROM ${Prisma.raw(
    `"${table}"`,
  )} ${whereFrom(from, academyId)}`;
}

/** 콘텐츠/이벤트 멤버 (status_norm = 'INFO'). */
function infoFeature(
  table: string,
  featureExpr: Prisma.Sql,
  from: Date | null,
  academyId?: string,
): Prisma.Sql {
  return Prisma.sql`SELECT "academyId" AS academy_id, "createdAt" AS created_at, ${featureExpr} AS feature, 'INFO'::text AS status_norm FROM ${Prisma.raw(
    `"${table}"`,
  )} ${whereFrom(from, academyId)}`;
}

function buildFeatureUnion(from: Date | null, academyId?: string): Prisma.Sql {
  const members = [
    infoFeature(
      "app_events",
      Prisma.sql`CASE WHEN "eventType" = 'PAGE_VIEW' THEN 'PAGEVIEW' WHEN "eventType" = 'LOGIN' THEN 'LOGIN' ELSE 'EXPORT' END`,
      from,
      academyId,
    ),
    jobFeature("extraction_jobs", Prisma.sql`'EXTRACTION'`, from, academyId),
    jobFeature(
      "workbench_ai_jobs",
      Prisma.sql`CASE WHEN "domain" = 'QUESTION_GENERATION' THEN 'QUESTION_GEN' ELSE 'ANALYSIS' END`,
      from,
      academyId,
    ),
    jobFeature("similar_exam_generation_jobs", Prisma.sql`'SIMILAR_EXAM'`, from, academyId),
    jobFeature("similar_question_generation_jobs", Prisma.sql`'SIMILAR_QUESTION'`, from, academyId),
    jobFeature("custom_question_generation_jobs", Prisma.sql`'CUSTOM_QUESTION'`, from, academyId),
    infoFeature("exams", Prisma.sql`'EXAM'`, from, academyId),
    infoFeature("passages", Prisma.sql`'PASSAGE'`, from, academyId),
    infoFeature("passage_reports", Prisma.sql`'REPORT'`, from, academyId),
  ];
  return Prisma.join(members, " UNION ALL ");
}

const KST = (col: string) =>
  Prisma.raw(`((${col}) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')`);
const KST_DAY = (col: string) =>
  Prisma.raw(
    `to_char(((${col}) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD')`,
  );

// ─── 결과 타입 ───────────────────────────────────────────────────────────────

export interface FeatureDayRow {
  feature: string;
  day: string;
  cnt: number;
}
export interface FeatureAdoptionRow {
  feature: string;
  academies: number;
  total: number;
}
export interface FeatureOutcomeRow {
  feature: string;
  status: string;
  cnt: number;
}
export interface HourWeekdayRow {
  weekday: number;
  hour: number;
  cnt: number;
}
export interface SignupDayRow {
  day: string;
  cnt: number;
}

// ─── 윈도우 집계 ─────────────────────────────────────────────────────────────

/** 기능별 일별 건수 (윈도우). */
export async function fetchFeatureDaily(from: Date): Promise<FeatureDayRow[]> {
  const union = buildFeatureUnion(from);
  const rows = await prisma.$queryRaw<
    Array<{ feature: string; day: string; cnt: number }>
  >(Prisma.sql`
    WITH evt AS (${union})
    SELECT feature, ${KST_DAY("created_at")} AS day, COUNT(*)::int AS cnt
    FROM evt GROUP BY 1, 2
  `);
  return rows.map((r) => ({ feature: r.feature, day: r.day, cnt: Number(r.cnt) }));
}

/** 기능별 채택률 (전체 기간): 고유 학원 수 + 누적 건수. */
export async function fetchFeatureAdoption(): Promise<FeatureAdoptionRow[]> {
  const union = buildFeatureUnion(null);
  const rows = await prisma.$queryRaw<
    Array<{ feature: string; academies: number; total: number }>
  >(Prisma.sql`
    WITH evt AS (${union})
    SELECT feature, COUNT(DISTINCT academy_id)::int AS academies, COUNT(*)::int AS total
    FROM evt GROUP BY 1
  `);
  return rows.map((r) => ({
    feature: r.feature,
    academies: Number(r.academies),
    total: Number(r.total),
  }));
}

/** 기능별 성공/실패 (윈도우, 잡 기반만 — status_norm != 'INFO'). */
export async function fetchFeatureOutcomes(
  from: Date,
): Promise<FeatureOutcomeRow[]> {
  const union = buildFeatureUnion(from);
  const rows = await prisma.$queryRaw<
    Array<{ feature: string; status: string; cnt: number }>
  >(Prisma.sql`
    WITH evt AS (${union})
    SELECT feature, status_norm AS status, COUNT(*)::int AS cnt
    FROM evt WHERE status_norm <> 'INFO' GROUP BY 1, 2
  `);
  return rows.map((r) => ({
    feature: r.feature,
    status: r.status,
    cnt: Number(r.cnt),
  }));
}

/** 시간대(0-23)×요일(0=일) 활동 히트맵 (윈도우, KST). */
export async function fetchHourWeekday(from: Date): Promise<HourWeekdayRow[]> {
  const union = buildFeatureUnion(from);
  const rows = await prisma.$queryRaw<
    Array<{ weekday: number; hour: number; cnt: number }>
  >(Prisma.sql`
    WITH evt AS (${union})
    SELECT extract(dow from ${KST("created_at")})::int AS weekday,
           extract(hour from ${KST("created_at")})::int AS hour,
           COUNT(*)::int AS cnt
    FROM evt GROUP BY 1, 2
  `);
  return rows.map((r) => ({
    weekday: Number(r.weekday),
    hour: Number(r.hour),
    cnt: Number(r.cnt),
  }));
}

// ─── 가입 ────────────────────────────────────────────────────────────────────

/** 일별 신규 가입 (윈도우) + 윈도우 시작 전 누적 학원 수(baseline). */
export async function fetchSignups(
  from: Date,
): Promise<{ daily: SignupDayRow[]; baseline: number }> {
  const [daily, baselineRows] = await Promise.all([
    prisma.$queryRaw<Array<{ day: string; cnt: number }>>(Prisma.sql`
      SELECT ${KST_DAY('"createdAt"')} AS day, COUNT(*)::int AS cnt
      FROM "academies" WHERE "createdAt" >= ${from} GROUP BY 1
    `),
    prisma.$queryRaw<Array<{ cnt: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS cnt FROM "academies" WHERE "createdAt" < ${from}
    `),
  ]);
  return {
    daily: daily.map((r) => ({ day: r.day, cnt: Number(r.cnt) })),
    baseline: Number(baselineRows[0]?.cnt ?? 0),
  };
}

// ─── 개별 학원 상세 ──────────────────────────────────────────────────────────

export interface AcademyDetailQuery {
  featureRows: Array<{ feature: string; status: string; cnt: number }>;
  dailyRows: Array<{ day: string; cnt: number }>;
  staffCount: number;
  firstAt: Date | null;
  lastAt: Date | null;
}

/** 개별 학원: 기능×상태 분해(전체 기간) + 최근 N일 일별 + 직원 수 + 활동 경계. */
export async function fetchAcademyDetail(
  academyId: string,
  dailyFrom: Date,
): Promise<AcademyDetailQuery> {
  const allTimeUnion = buildFeatureUnion(null, academyId);
  const windowUnion = buildFeatureUnion(dailyFrom, academyId);
  const [featureRows, dailyRows, boundsRows, staffCount] = await Promise.all([
    prisma.$queryRaw<Array<{ feature: string; status: string; cnt: number }>>(
      Prisma.sql`
        WITH evt AS (${allTimeUnion})
        SELECT feature, status_norm AS status, COUNT(*)::int AS cnt
        FROM evt GROUP BY 1, 2
      `,
    ),
    prisma.$queryRaw<Array<{ day: string; cnt: number }>>(Prisma.sql`
      WITH evt AS (${windowUnion})
      SELECT ${KST_DAY("created_at")} AS day, COUNT(*)::int AS cnt
      FROM evt GROUP BY 1
    `),
    prisma.$queryRaw<Array<{ first_at: Date | null; last_at: Date | null }>>(
      Prisma.sql`
        WITH evt AS (${allTimeUnion})
        SELECT MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM evt
      `,
    ),
    prisma.staff.count({ where: { academyId } }),
  ]);
  return {
    featureRows: featureRows.map((r) => ({
      feature: r.feature,
      status: r.status,
      cnt: Number(r.cnt),
    })),
    dailyRows: dailyRows.map((r) => ({ day: r.day, cnt: Number(r.cnt) })),
    staffCount: Number(staffCount),
    firstAt: boundsRows[0]?.first_at ?? null,
    lastAt: boundsRows[0]?.last_at ?? null,
  };
}
