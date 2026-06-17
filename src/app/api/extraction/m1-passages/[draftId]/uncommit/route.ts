import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireStaff } from "@/lib/extraction/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ draftId: string }>;
}

// 검수완료(COMMITTED)만 해제해 REVIEWED 상태로 되돌린다. 파괴적인 unpromote 와
// 달리 저장된 Passage 를 삭제하지 않으므로(savedPassageId 유지), 지문은
// 문제생성 목록에 그대로 남고 검수 점만 초록→빨강으로 바뀐다.
export async function POST(_req: Request, ctx: RouteContext) {
  const { draftId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const draft = await prisma.extractionM1PassageDraft.findFirst({
    where: {
      id: draftId,
      deletedAt: null,
      job: { academyId: staff.academyId, deletedAt: null },
    },
    select: { id: true, savedPassageId: true, reviewStatus: true },
  });
  if (!draft) {
    return errorResponse("NOT_FOUND", "지문 추출 결과를 찾을 수 없습니다.", 404);
  }

  await prisma.extractionM1PassageDraft.update({
    where: { id: draft.id },
    data: { reviewStatus: "REVIEWED", confirmedAt: null },
  });

  return NextResponse.json({ draftId: draft.id, uncommitted: true });
}
