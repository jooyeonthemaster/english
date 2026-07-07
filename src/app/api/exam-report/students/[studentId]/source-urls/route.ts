// ============================================================================
// POST /api/exam-report/students/[studentId]/source-urls
//   학생 정오표 '원본 보기' 뷰어용 — 해당 학생의 sourceFiles 경로에 한해 서명
//   다운로드 URL 을 배치 발급한다. 요청 경로가 학생 sourceFiles 화이트리스트에
//   없거나 학생 전용 앵커드 형식과 어긋나면 거부(교차 테넌트·트래버설 차단).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
import { createSignedDownloadUrl } from "@/lib/supabase-storage";
import { isExamReportPagePath } from "@/lib/exam-report/schemas";
import { isExamReportStudentPagePath } from "../../../_lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(40),
});

const sourceFilesSchema = z.array(
  z.object({ path: z.string(), page: z.number().optional() }),
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { studentId } = await params;

  const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "잘못된 요청입니다.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  const student = await prisma.examReportStudent.findFirst({
    where: { id: studentId, academyId: auth.academyId, deletedAt: null },
    select: { examAnalysisId: true, sourceFiles: true },
  });
  if (!student) {
    return NextResponse.json(
      { error: "학생 리포트를 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // 심층 방어: sourceFiles 화이트리스트(주 방어) + 앵커드 정규식 이중 검증.
  // '학생 답안지' 흐름은 시험 페이지 키(pages/NNNN)를 학생1 이 그대로 공유하므로,
  // 학생 전용 형식(students/{sid}/NNNN) 과 분석 페이지 형식(pages/NNNN) 둘 다 허용한다.
  // 두 검증 모두 academyId·analysisId 스코프 앵커드 정규식이라 트래버설 방어는 유지된다.
  const sourceFiles = sourceFilesSchema.safeParse(student.sourceFiles);
  const allowed = new Set(
    sourceFiles.success ? sourceFiles.data.map((f) => f.path) : [],
  );
  const invalid = parsedBody.data.paths.filter(
    (p) =>
      !allowed.has(p) ||
      (!isExamReportStudentPagePath(p, auth.academyId, student.examAnalysisId, studentId) &&
        !isExamReportPagePath(p, auth.academyId, student.examAnalysisId)),
  );
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: "허용되지 않은 경로입니다.", code: "FORBIDDEN_PATH" },
      { status: 403 },
    );
  }

  const urls = await Promise.all(
    parsedBody.data.paths.map((p) => createSignedDownloadUrl(p, 60 * 30)),
  );
  return NextResponse.json({ urls });
}
