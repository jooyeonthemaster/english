import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import {
  editedWebtoonPublicUrl,
  editedWebtoonStoragePath,
} from "@/lib/webtoon-storage";
import { isPlausibleWebtoonTextDoc } from "@/lib/webtoon-text/types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/webtoons/[id]/export
// Finalize an export AFTER the browser has uploaded the rendered image to the signed URL
// from /export-target. Body: { storagePath, textDoc }. We verify the path belongs to this
// webtoon, set editedImageUrl, and persist the (validated) layered doc.
export async function POST(req: NextRequest, ctx: RouteContext) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await ctx.params;
  let payload: { storagePath?: string; textDoc?: unknown } | null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

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

  // The path must be exactly the one we hand out — never trust a client-supplied path.
  const expectedPath = editedWebtoonStoragePath(webtoon.academyId, webtoon.id);
  if (payload?.storagePath !== expectedPath) {
    return NextResponse.json({ error: "저장 경로가 올바르지 않습니다" }, { status: 400 });
  }

  // textDoc is optional but, if present, must pass the same validation as the PUT route.
  if (payload.textDoc !== undefined && !isPlausibleWebtoonTextDoc(payload.textDoc)) {
    return NextResponse.json({ error: "textDoc 형식이 올바르지 않습니다" }, { status: 400 });
  }

  let editedImageUrl: string;
  try {
    editedImageUrl = editedWebtoonPublicUrl(expectedPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await prisma.webtoon.update({
    where: { id: webtoon.id },
    data: {
      editedImageUrl,
      editedStoragePath: expectedPath,
      ...(payload.textDoc ? { textDoc: payload.textDoc as object } : {}),
    },
  });

  return NextResponse.json({ ok: true, editedImageUrl });
}
