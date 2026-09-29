import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { deleteWebtoonImage } from "@/lib/webtoon-storage";
import { planForModelId } from "@/lib/webtoon-models";
import { isPersistedStoryboard } from "@/lib/webtoon-storyboard/types";
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
    // 응답에서 뺄 내부 필드(스펙 §4): 원 과금 거래 id 는 환불 악용 통로이고, 프롬프트
    // 원문·해시·프로바이더 흔적은 내부 정보다. 조회 단계에서 빼 큰 promptSnapshot 도 읽지 않는다.
    omit: {
      creditTransactionId: true,
      promptSnapshot: true,
      promptHash: true,
      rawAtlasUrl: true,
      atlasPredictionId: true,
    },
    include: {
      passage: { select: { id: true, title: true, content: true, grade: true, semester: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!webtoon) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }
  // JSON 컬럼은 형태를 믿지 않는다 — 가드를 통과한 v2 콘티만 싣고, 레거시·손상 행은 null.
  const storyboard = isPersistedStoryboard(webtoon.storyboard) ? webtoon.storyboard : null;

  if (
    shouldUseLocalWebtoonWorker() &&
    (webtoon.status === "PENDING" || webtoon.status === "GENERATING")
  ) {
    enqueueLocalWebtoonGeneration(webtoon.id);
  }

  // 클라이언트는 이 응답을 목록 행(WebtoonRow)에 그대로 병합하므로 목록과 같은
  // 파생 필드(plan·hasStoryboard)를 함께 싣는다.
  return NextResponse.json({
    ok: true,
    webtoon: {
      ...webtoon,
      storyboard,
      hasStoryboard: storyboard !== null,
      plan: planForModelId(webtoon.imageModel)?.id ?? null,
    },
  });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { approved?: unknown };
  if (typeof body.approved !== "boolean") {
    return NextResponse.json({ error: "approved(boolean) 필요" }, { status: 400 });
  }

  const existing = await prisma.webtoon.findFirst({
    where: { id, academyId: staff.academyId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.webtoon.update({
    where: { id: existing.id },
    data: { approved: body.approved },
  });

  return NextResponse.json({ ok: true, approved: body.approved });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await ctx.params;
  const webtoon = await prisma.webtoon.findFirst({
    where: { id, academyId: staff.academyId },
    select: { id: true, storagePath: true, editedStoragePath: true, status: true },
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

  // Best-effort storage cleanup (original + re-typeset export), then DB row delete
  if (webtoon.storagePath) {
    await deleteWebtoonImage(webtoon.storagePath);
  }
  if (webtoon.editedStoragePath) {
    await deleteWebtoonImage(webtoon.editedStoragePath);
  }
  await prisma.webtoon.delete({ where: { id: webtoon.id } });

  return NextResponse.json({ ok: true });
}
