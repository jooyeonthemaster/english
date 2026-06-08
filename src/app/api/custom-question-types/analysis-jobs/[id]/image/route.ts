import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// '유형 만들기' 분석 잡이 분석에 쓴 원본 크롭 이미지(referenceImage)를 그대로 반환.
// 작업 큐 카드 썸네일용 — 목록 응답에 base64 를 싣지 않고 카드별 lazy 로드 + 브라우저 캐시.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const job = await prisma.customTypeAnalysisJob.findFirst({
    where: { id, academyId: staff.academyId, deletedAt: null },
    select: { referenceImage: true, referenceMediaType: true },
  });
  if (!job?.referenceImage) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bytes = new Uint8Array(Buffer.from(job.referenceImage, "base64"));
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": job.referenceMediaType || "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
