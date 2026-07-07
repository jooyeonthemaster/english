// ============================================================================
// GET /api/exam-report/analyses?view=summary
//   허브·라이브러리 목록/폴링 전용. 스칼라 + 학생 수만 내려보내고, 무거운
//   structure/analysis JSON 은 절대 포함하지 않는다(egress 관례, ai-jobs summary).
//   ANALYZING 행은 reconcileExamAnalysis 로 자기치유된 status 를 반영한다.
// ============================================================================

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
// reconcile.ts 는 병렬 구축 중 — 계약 시그니처(reconcileExamAnalysis)를 믿고 사용.
import { reconcileExamAnalysis } from "@/lib/exam-report/reconcile";
import { parseExamAiMeta } from "@/lib/exam-report/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const rows = await prisma.examAnalysis.findMany({
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
      // 진행률/미분석 수 추출용 — raw 는 응답에 싣지 않는다(structure/analysis 는
      // egress 관례상 select 자체 금지 유지).
      aiMeta: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { students: { where: { deletedAt: null } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
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
    // sourceFiles 는 응답에 싣지 않고 존재 여부만 boolean 으로 내려보낸다(egress
    // 절약 + 고아 DRAFT 판별용). reconcile 입력은 기존과 동일하게 유지.
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
        // 실제 진행률 스냅샷(배치 커밋마다 갱신) — null = 첫 체크포인트 전(문항 인식 중).
        progress: meta.progress ?? null,
        // 미분석(FAILED) 문항 수 — 목록 카드 "미분석 N" 칩 근거.
        failedCount: meta.failedNumbers?.length ?? 0,
      };
    }),
  );

  return NextResponse.json({ analyses });
}
