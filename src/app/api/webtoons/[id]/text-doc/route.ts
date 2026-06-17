import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { isPlausibleWebtoonTextDoc } from "@/lib/webtoon-text/types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PUT /api/webtoons/[id]/text-doc — persist the user's edited layered text doc.
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await ctx.params;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const textDoc = (payload as { textDoc?: unknown })?.textDoc;
  if (!isPlausibleWebtoonTextDoc(textDoc)) {
    return NextResponse.json({ error: "textDoc 형식이 올바르지 않습니다" }, { status: 400 });
  }

  const webtoon = await prisma.webtoon.findFirst({
    where: { id, academyId: staff.academyId },
    select: { id: true },
  });
  if (!webtoon) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.webtoon.update({
    where: { id: webtoon.id },
    data: { textDoc: textDoc as unknown as object },
  });

  return NextResponse.json({ ok: true });
}
