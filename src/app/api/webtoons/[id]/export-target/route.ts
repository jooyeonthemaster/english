import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { createEditedWebtoonUploadTarget } from "@/lib/webtoon-storage";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/webtoons/[id]/export-target
// Returns a signed upload URL so the browser can PUT the re-typeset export directly to
// Supabase (the image is too large to route through a Vercel serverless body).
export async function POST(_req: NextRequest, ctx: RouteContext) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await ctx.params;
  const webtoon = await prisma.webtoon.findFirst({
    where: { id, academyId: staff.academyId },
    select: { id: true, academyId: true, status: true },
  });
  if (!webtoon) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }
  if (webtoon.status !== "COMPLETED") {
    return NextResponse.json({ error: "완료된 웹툰만 내보낼 수 있습니다" }, { status: 409 });
  }

  try {
    const target = await createEditedWebtoonUploadTarget({
      academyId: webtoon.academyId,
      webtoonId: webtoon.id,
    });
    return NextResponse.json({ ok: true, ...target });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: `업로드 준비 실패: ${message}` }, { status: 500 });
  }
}
