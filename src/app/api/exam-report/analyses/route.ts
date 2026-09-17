// ============================================================================
// GET /api/exam-report/analyses?view=summary[&include=candidates]
//   허브·라이브러리·스튜디오 목록/폴링 전용. 스칼라 + 학생 수 + (v4) 퍼널 스칼라
//   묶음만 내려보내고, 무거운 structure/analysis/reviewState/aiMeta raw JSON 은 절대
//   포함하지 않는다(egress 관례, ai-jobs summary). ANALYZING 행은
//   reconcileExamAnalysis 로 자기치유된 status 를 반영한다.
//
// v4(26-09-02, docs/exam-analysis-v4-spec.md §2.1·§3 U2):
//   - funnel: 모든 행에 채운다(허브는 무시). structure·reviewState 는 **select 만**
//     하고 계산(문항 번호·게이트)에 쓴 뒤 버린다. hasExamLevel 은 analysis 전체를
//     읽지 않고 raw SQL 로 `analysis->'examLevel'` 존재만 판정(egress 규칙).
//     학생 집계는 findMany 스칼라 6개 1회 → summarizeFunnelStudents(서버·클라 공용).
//     boost 는 aiMeta.boost 원시 판독(RUNNING 좀비는 FAILED 강등 — funnel.ts).
//   - ?include=candidates: INTERNAL 분석 행이 아직 없는 자체 시험지(분석 전 후보).
//     옵션 미전달(허브)이면 응답 형태 무변화.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
// P2022(신규 컬럼 미ALTER DB) 우아한 강등 게이트 — deployment-summary.ts 와 동일 소스.
import { isMissingColumnError } from "@/actions/workbench/_collection-where";
// reconcile.ts 는 병렬 구축 중 — 계약 시그니처(reconcileExamAnalysis)를 믿고 사용.
import { reconcileExamAnalysis } from "@/lib/exam-report/reconcile";
import {
  parseExamAiMeta,
  parseExamMap,
  parseExamReviewState,
} from "@/lib/exam-report/schemas";
import type { StudentReportStatus } from "@/lib/exam-report/types";
import { computeFunnel, type FunnelStudentInput } from "@/lib/exam-report/funnel";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import type { ExamCandidateRow } from "@/hooks/use-exam-report-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 후보(미분석 자체 시험지) 최대 수 — 스펙 §2.1(updatedAt desc take 30). */
const CANDIDATE_TAKE = 30;

// sourceExamId 를 못 읽는 두 창을 모두 우아하게 강등한다:
//  1) P2022 — schema 엔 있으나 DB 에 컬럼 미ALTER (isMissingColumnError).
//  2) PrismaClientValidationError — 생성된 Prisma 클라이언트가 아직 이 필드를
//     모름. dev 서버를 재시작하지 않아 구 클라이언트가 메모리에 남은 창에서 발생
//     (P2022 아님 → 기존 게이트가 못 잡고 500 회귀). 딥링크만 포기하고 목록은 유지.
function isSourceExamIdUnavailable(error: unknown): boolean {
  if (isMissingColumnError(error)) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "PrismaClientValidationError" &&
    typeof (error as { message?: unknown }).message === "string" &&
    (error as { message: string }).message.includes("sourceExamId")
  );
}

/**
 * sourceFiles([{path, page}])에서 첫 쪽(page 오름차순) 경로 하나만 뽑는다.
 * page 는 1-based, 스토리지 키 인덱스는 0-based 라 정렬 기준은 page 를 쓴다.
 * 카드 썸네일 전용 — 나머지 경로는 여전히 목록 응답에 싣지 않는다.
 */
function firstSourcePath(sourceFiles: unknown): string | null {
  if (!Array.isArray(sourceFiles) || sourceFiles.length === 0) return null;
  const entries = sourceFiles.filter(
    (f): f is { path: string; page?: number } =>
      !!f &&
      typeof f === "object" &&
      typeof (f as { path?: unknown }).path === "string",
  );
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => (a.page ?? 0) - (b.page ?? 0))[0].path;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** `?include=a,b` 콤마 목록에 토큰이 있는지(공백 관대). */
function hasInclude(req: NextRequest, token: string): boolean {
  const raw = req.nextUrl.searchParams.get("include");
  if (!raw) return false;
  return raw
    .split(",")
    .map((s) => s.trim())
    .includes(token);
}

/**
 * analysis->'examLevel' 존재 판정 — analysis 전체 select 금지(egress·폴링 비용).
 * jsonb 서브패스는 Prisma 가 못 고르므로 raw SQL 1회. `'null'::jsonb` 는 INTERNAL
 * 합성이 정직하게 쓰는 null 리터럴(internal-analysis.ts) — 존재로 세지 않는다.
 * overview 비어 있음도 부재로 본다 — 클라 파서(schemas.ts examLevel overview min(1))
 * 가 그런 행을 examLevel null 로 떨어뜨리므로, 카드(depth DEEP)와 레일(총평 없음)이
 * 갈리지 않도록 같은 경계를 쓴다. `->>` 는 키 부재 시 NULL → `<> ''` 가 NULL(거짓).
 * 실패(스키마 이변 등)하면 전부 false — 목록이 죽는 것보다 깊이 강등이 낫다.
 */
async function loadExamLevelIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM exam_analyses WHERE id IN (${Prisma.join(ids)}) AND analysis->'examLevel' IS NOT NULL AND analysis->'examLevel' <> 'null'::jsonb AND analysis->'examLevel'->>'overview' <> ''`,
    );
    return new Set(rows.map((r) => r.id));
  } catch (error) {
    console.error("[exam-report/analyses] examLevel probe failed", error);
    return new Set();
  }
}

/**
 * 학생 스칼라 6개 1회 조회 → analysisId 별 배열(summarizeFunnelStudents 입력).
 * Date → ISO 문자열로 맞춰 클라 ExamAnalysisStudentRow 와 같은 형태를 넘긴다.
 */
async function loadFunnelStudents(
  ids: string[],
): Promise<Map<string, FunnelStudentInput[]>> {
  const byId = new Map<string, FunnelStudentInput[]>();
  if (ids.length === 0) return byId;
  const rows = await prisma.examReportStudent.findMany({
    where: { examAnalysisId: { in: ids }, deletedAt: null },
    select: {
      examAnalysisId: true,
      gradingConfirmed: true,
      reportStatus: true,
      shareEnabled: true,
      answerToken: true,
      answerEnabled: true,
      answerSubmittedAt: true,
      examSubmissionId: true,
    },
  });
  for (const row of rows) {
    const list = byId.get(row.examAnalysisId) ?? [];
    list.push({
      gradingConfirmed: row.gradingConfirmed,
      reportStatus: row.reportStatus as StudentReportStatus,
      shareEnabled: row.shareEnabled,
      answerToken: row.answerToken,
      answerEnabled: row.answerEnabled,
      answerSubmittedAt: row.answerSubmittedAt ? row.answerSubmittedAt.toISOString() : null,
      examSubmissionId: row.examSubmissionId,
    });
    byId.set(row.examAnalysisId, list);
  }
  return byId;
}

/**
 * ?include=candidates — INTERNAL 분석 행이 아직 없는 자체 시험지(스펙 §2.1).
 * - subject: null 은 ENGLISH(구 시험지 전부)다. Prisma `{not:"KOREAN"}` 만 쓰면 SQL
 *   `<>` 의미로 null 행이 **통째로 빠지므로** OR 로 null 을 명시 포함한다.
 * - Exam 모델엔 deletedAt 이 없다(prisma/schema.prisma) — 조건 생략. 대신 status
 *   ARCHIVED(보관함)는 제외 — 보강 라우트도 같은 시험지를 EXAM_ARCHIVED 로 거부하므로
 *   「분석 전」 카드에 유료 CTA 를 달아 놓고 400 을 받는 모순을 막는다.
 * - 살아있는 문항(question.deletedAt null)이 1개 이상인 것만. questionCount 도 같은 조건.
 * - INTERNAL 행 조회가 sourceExamId 미가용 창(P2022/구 클라이언트)이면 후보는 []
 *   (딥링크 없는 상태에서 후보를 내면 중복 카드가 생긴다 — 강등이 안전).
 * - ENABLE_EXAM_DEPLOYMENT 가 꺼져 있으면 [] — 보강 라우트가 403 을 내고 클라는 그
 *   403 을 삼키므로, 후보를 내면 「누르면 아무 일도 안 나는 유료 버튼」이 된다.
 */
async function loadCandidates(academyId: string): Promise<ExamCandidateRow[]> {
  if (!FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT) return [];
  let internalExamIds: string[];
  try {
    const internalRows = await prisma.examAnalysis.findMany({
      where: {
        academyId,
        sourceType: "INTERNAL",
        deletedAt: null,
        sourceExamId: { not: null },
      },
      select: { sourceExamId: true },
    });
    internalExamIds = internalRows
      .map((r) => r.sourceExamId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch (error) {
    if (!isSourceExamIdUnavailable(error)) throw error;
    return [];
  }

  const exams = await prisma.exam.findMany({
    where: {
      academyId,
      status: { not: "ARCHIVED" },
      OR: [{ subject: null }, { subject: { not: "KOREAN" } }],
      questions: { some: { question: { deletedAt: null } } },
      ...(internalExamIds.length > 0 ? { id: { notIn: internalExamIds } } : {}),
    },
    select: {
      id: true,
      title: true,
      classId: true,
      examType: true,
      updatedAt: true,
      _count: { select: { questions: { where: { question: { deletedAt: null } } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: CANDIDATE_TAKE,
  });
  return exams.map((e) => ({
    examId: e.id,
    title: e.title,
    questionCount: e._count.questions,
    classId: e.classId,
    examType: e.examType,
    updatedAt: e.updatedAt.toISOString(),
  }));
}

export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const includeCandidates = hasInclude(req, "candidates");

  // sourceExamId 는 surgical ALTER(20260709_exam_deployment_omr.sql)로만 존재하는
  // 신규 컬럼 — 코드 선배포/ALTER 지연(또는 dev 서버 미재시작) 창에서 SELECT 하면
  // Prisma P2022 로 터진다. 그때는 딥링크(sourceExamId)만 생략하고 목록(기존 외부
  // 분석 카드 포함)은 그대로 내려보내 500 회귀를 막는다(deployment-summary.ts 미러).
  // structure/reviewState 는 v4 퍼널 계산 전용 select — 두 경로 모두 응답엔 싣지 않는다.
  const rows = await prisma.examAnalysis
    .findMany({
      where: { academyId: auth.academyId, deletedAt: null },
      select: {
        id: true,
        title: true,
        schoolName: true,
        grade: true,
        examType: true,
        examYear: true,
        semester: true,
        status: true,
        sourceType: true,
        // INTERNAL(자체 시험지 합성 분석) 카드의 "시험지 열기" 딥링크용(V7) — 스칼라 1개.
        sourceExamId: true,
        sourceFiles: true,
        // 진행률/미분석 수/boost 스냅샷 추출용 — raw 는 응답에 싣지 않는다.
        aiMeta: true,
        // v4 퍼널(문항 번호·게이트) 계산 전용 — 응답 금지(analysis 는 select 도 금지).
        structure: true,
        reviewState: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { students: { where: { deletedAt: null } } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    })
    .catch(async (error) => {
      if (!isSourceExamIdUnavailable(error)) throw error;
      // 신규 컬럼 없이 재조회 후 sourceExamId 를 null 로 채워 응답 형태를 통일.
      const fallback = await prisma.examAnalysis.findMany({
        where: { academyId: auth.academyId, deletedAt: null },
        select: {
          id: true,
          title: true,
          schoolName: true,
          grade: true,
          examType: true,
          examYear: true,
          semester: true,
          status: true,
          sourceType: true,
          sourceFiles: true,
          aiMeta: true,
          structure: true,
          reviewState: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { students: { where: { deletedAt: null } } } },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      return fallback.map((row) => ({
        ...row,
        sourceExamId: null as string | null,
      }));
    });

  const ids = rows.map((r) => r.id);
  // 퍼널 재료 2종은 서로 독립 — 병렬 조회. 후보는 옵션일 때만.
  const [examLevelIds, studentsById, candidates] = await Promise.all([
    loadExamLevelIds(ids),
    loadFunnelStudents(ids),
    includeCandidates ? loadCandidates(auth.academyId) : Promise.resolve(null),
  ]);
  const now = Date.now();

  const analyses = await Promise.all(
    // sourceFiles 는 응답에 싣지 않고 존재 여부(+썸네일용 1쪽 경로 1개)만 내려
    // 보낸다(egress 절약 + 고아 DRAFT 판별용). reconcile 입력은 기존과 동일.
    rows.map(async ({ _count, sourceFiles, aiMeta, structure, reviewState, ...rest }) => {
      // aiMeta 는 파서 경유로 progress/failedCount 만 추출해 내려보낸다(raw 미포함).
      const meta = parseExamAiMeta(aiMeta);
      const status =
        rest.status === "ANALYZING"
          ? // aiMeta 를 함께 넘겨 리컨실의 지연 재조회(findUnique)를 생략한다.
            await reconcileExamAnalysis({ ...rest, aiMeta })
          : rest.status;
      const students = studentsById.get(rest.id) ?? [];
      const funnel = computeFunnel({
        status,
        sourceType: rest.sourceType,
        questionNumbers: parseExamMap(structure)?.questions.map((q) => q.number) ?? [],
        reviewState: parseExamReviewState(reviewState),
        hasExamLevel: examLevelIds.has(rest.id),
        boostRaw: asRecord(aiMeta).boost,
        students,
        now,
      });
      return {
        ...rest,
        status,
        studentCount: _count.students,
        // 리포트 생성 완료(GENERATED) 학생 수 — 라이브러리 '리포트' 컬럼용. 퍼널
        // 학생 집계(같은 where: deletedAt null)에서 도출 — 종전 groupBy 1회 절약.
        reportCount: funnel.students.reportGenerated,
        hasSourceFiles: Array.isArray(sourceFiles) && sourceFiles.length > 0,
        // 카드 좌측 썸네일용 1쪽 경로 1개만(경로 문자열 ~60B). 서명은 카드가
        // source-urls 라우트로 지연 요청한다(전체 sourceFiles 는 여전히 미노출).
        thumbnailPath: firstSourcePath(sourceFiles),
        // 실제 진행률 스냅샷(배치 커밋마다 갱신) — null = 첫 체크포인트 전(문항 인식 중).
        progress: meta.progress ?? null,
        // 미분석(FAILED) 문항 수 — 목록 카드 "미분석 N" 칩 근거.
        failedCount: meta.failedNumbers?.length ?? 0,
        // v4 퍼널 스칼라 묶음 — 카드 힌트·레일 다음 단계의 서버 단일 소스.
        funnel,
      };
    }),
  );

  return NextResponse.json(
    candidates ? { analyses, candidates } : { analyses },
  );
}
