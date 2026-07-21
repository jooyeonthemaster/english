// ============================================================================
// GET /api/exam-report/analyses?view=summary
//   허브·라이브러리 목록/폴링 전용. 스칼라 + 학생 수만 내려보내고, 무거운
//   structure/analysis JSON 은 절대 포함하지 않는다(egress 관례, ai-jobs summary).
//   ANALYZING 행은 reconcileExamAnalysis 로 자기치유된 status 를 반영한다.
// ============================================================================

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
// P2022(신규 컬럼 미ALTER DB) 우아한 강등 게이트 — deployment-summary.ts 와 동일 소스.
import { isMissingColumnError } from "@/actions/workbench/_collection-where";
// reconcile.ts 는 병렬 구축 중 — 계약 시그니처(reconcileExamAnalysis)를 믿고 사용.
import { reconcileExamAnalysis } from "@/lib/exam-report/reconcile";
import { parseExamAiMeta } from "@/lib/exam-report/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  // sourceExamId 는 surgical ALTER(20260709_exam_deployment_omr.sql)로만 존재하는
  // 신규 컬럼 — 코드 선배포/ALTER 지연(또는 dev 서버 미재시작) 창에서 SELECT 하면
  // Prisma P2022 로 터진다. 그때는 딥링크(sourceExamId)만 생략하고 목록(기존 외부
  // 분석 카드 포함)은 그대로 내려보내 500 회귀를 막는다(deployment-summary.ts 미러).
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
        // 진행률/미분석 수 추출용 — raw 는 응답에 싣지 않는다(structure/analysis 는
        // egress 관례상 select 자체 금지 유지).
        aiMeta: true,
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

  // 리포트 생성 완료(GENERATED) 학생 수 — 라이브러리 '리포트' 컬럼용 배치 집계.
  const reportCounts = await prisma.examReportStudent.groupBy({
    by: ["examAnalysisId"],
    where: {
      examAnalysisId: { in: rows.map((r) => r.id) },
      deletedAt: null,
      reportStatus: "GENERATED",
    },
    _count: { _all: true },
  });
  const reportCountById = new Map(
    reportCounts.map((r) => [r.examAnalysisId, r._count._all]),
  );

  const analyses = await Promise.all(
    // sourceFiles 는 응답에 싣지 않고 존재 여부(+썸네일용 1쪽 경로 1개)만 내려
    // 보낸다(egress 절약 + 고아 DRAFT 판별용). reconcile 입력은 기존과 동일.
    rows.map(async ({ _count, sourceFiles, aiMeta, ...rest }) => {
      // aiMeta 는 파서 경유로 progress/failedCount 만 추출해 내려보낸다(raw 미포함).
      const meta = parseExamAiMeta(aiMeta);
      const status =
        rest.status === "ANALYZING"
          ? // aiMeta 를 함께 넘겨 리컨실의 지연 재조회(findUnique)를 생략한다.
            await reconcileExamAnalysis({ ...rest, aiMeta })
          : rest.status;
      return {
        ...rest,
        status,
        studentCount: _count.students,
        reportCount: reportCountById.get(rest.id) ?? 0,
        hasSourceFiles: Array.isArray(sourceFiles) && sourceFiles.length > 0,
        // 카드 좌측 썸네일용 1쪽 경로 1개만(경로 문자열 ~60B). 서명은 카드가
        // source-urls 라우트로 지연 요청한다(전체 sourceFiles 는 여전히 미노출).
        thumbnailPath: firstSourcePath(sourceFiles),
        // 실제 진행률 스냅샷(배치 커밋마다 갱신) — null = 첫 체크포인트 전(문항 인식 중).
        progress: meta.progress ?? null,
        // 미분석(FAILED) 문항 수 — 목록 카드 "미분석 N" 칩 근거.
        failedCount: meta.failedNumbers?.length ?? 0,
      };
    }),
  );

  return NextResponse.json({ analyses });
}
