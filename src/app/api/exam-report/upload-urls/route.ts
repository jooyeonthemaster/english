// ============================================================================
// POST /api/exam-report/upload-urls
//   시험지 페이지 이미지 업로드용 서명 URL 발급. 클라가 발급받아 직접 PUT 한다.
//   - studentId 미지정: 시험(분석) 페이지 키(pages/NNNN) 발급.
//   - studentId 지정: 그 학생의 마킹 사진 키(students/{studentId}/NNNN) 발급.
//   sourceFiles 확정 저장은 여기서 하지 않는다 — 액션(attachExamSources/
//   setStudentSources)이 반환된 path 목록을 저장한다.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff, errorResponse } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
import { createUploadTarget } from "@/lib/supabase-storage";
import {
  examReportPageKey,
  examReportStudentPageKey,
} from "@/lib/exam-report/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  analysisId: z.string().trim().min(1).max(80),
  /** 지정 시 이 학생의 마킹 사진 키를 발급한다(학생 소유·소속 검증). */
  studentId: z.string().trim().min(1).max(80).optional(),
  pages: z
    .array(
      z.object({
        index: z.number().int().min(0).max(50),
        contentType: z.string().trim().max(100).optional(),
      }),
    )
    .min(1)
    .max(30),
});

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      "INVALID_BODY",
      "요청 형식이 올바르지 않습니다.",
      400,
      parsed.error.issues,
    );
  }

  const { analysisId, studentId, pages } = parsed.data;

  // 소유·미삭제 검증(테넌트 가드).
  const analysis = await prisma.examAnalysis.findFirst({
    where: { id: analysisId, academyId: auth.academyId, deletedAt: null },
    select: { id: true },
  });
  if (!analysis) {
    return errorResponse("NOT_FOUND", "시험 분석을 찾을 수 없습니다.", 404);
  }

  // 학생 키 발급 시: 학생이 이 분석·학원 소속인지 검증(교차 경로 주입 차단).
  if (studentId) {
    const student = await prisma.examReportStudent.findFirst({
      where: {
        id: studentId,
        examAnalysisId: analysisId,
        academyId: auth.academyId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!student) {
      return errorResponse("NOT_FOUND", "학생 리포트를 찾을 수 없습니다.", 404);
    }
  }

  // index 중복 방지.
  const indices = pages.map((p) => p.index);
  if (new Set(indices).size !== indices.length) {
    return errorResponse("DUPLICATE_INDEX", "페이지 인덱스가 중복되었습니다.", 400);
  }

  try {
    const targets = await Promise.all(
      pages.map(async (page) => {
        const path = studentId
          ? examReportStudentPageKey(auth.academyId, analysisId, studentId, page.index)
          : examReportPageKey(auth.academyId, analysisId, page.index);
        const target = await createUploadTarget(path);
        return { index: page.index, uploadUrl: target.uploadUrl, path };
      }),
    );
    return NextResponse.json({ targets });
  } catch (err) {
    return errorResponse(
      "UPLOAD_URL_FAILED",
      err instanceof Error ? err.message : "업로드 URL 발급에 실패했습니다.",
      500,
    );
  }
}
