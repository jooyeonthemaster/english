// ============================================================================
// GET /api/exam-report/analyses/[id]/questions
//   정오표 상세보기·필터·취약점 대시보드용 문항 원본(전문/선지/지문/해설/메타)을
//   AI 0콜로 내려보낸다. INTERNAL(서비스 생성 시험지)만 원본 재사용 가능하며,
//   그 외(사진 업로드 등)는 detailAvailable:false 로 강등한다. 타테넌트는 404 통일.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/extraction/api-utils";
import { loadExamReviewQuestions } from "@/lib/exam-report/review-questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const payload = await loadExamReviewQuestions({
    analysisId: id,
    academyId: auth.academyId,
  });
  if (!payload) {
    return NextResponse.json(
      { error: "시험 분석을 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json(payload);
}
