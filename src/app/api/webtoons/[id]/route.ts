import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { deleteWebtoonImage } from "@/lib/webtoon-storage";
import {
  enqueueLocalWebtoonGeneration,
  shouldUseLocalWebtoonWorker,
} from "@/lib/webtoon-local-worker";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await ctx.params;
  const webtoon = await prisma.webtoon.findFirst({
    where: { id, academyId: staff.academyId },
    include: {
      passage: { select: { id: true, title: true, content: true, grade: true, semester: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!webtoon) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  if (
    shouldUseLocalWebtoonWorker() &&
    (webtoon.status === "PENDING" || webtoon.status === "GENERATING")
  ) {
    enqueueLocalWebtoonGeneration(webtoon.id);
  }

  return NextResponse.json({ ok: true, webtoon });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await ctx.params;
  const webtoon = await prisma.webtoon.findFirst({
    where: { id, academyId: staff.academyId },
    select: { id: true, storagePath: true, status: true },
  });
  if (!webtoon) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }
  // Refuse to delete in-flight rows — could leak credits / leave dangling tasks
  if (webtoon.status === "PENDING" || webtoon.status === "GENERATING") {
    return NextResponse.json(
      { error: "생성 중인 웹툰은 완료 후 삭제할 수 있습니다" },
      { status: 409 },
    );
  }

  // Best-effort storage cleanup, then DB row delete
  if (webtoon.storagePath) {
    await deleteWebtoonImage(webtoon.storagePath);
  }
  await prisma.webtoon.delete({ where: { id: webtoon.id } });

  return NextResponse.json({ ok: true });
}
