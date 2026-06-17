import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { detectWebtoonText } from "@/lib/webtoon-text/detect";
import type { WebtoonTextDoc } from "@/lib/webtoon-text/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/webtoons/[id]/detect-text
// Detect baked-in text regions once and persist as `textDoc`. Idempotent: returns the
// existing doc unless `?force=1`. This is the one-time cost before opening the editor.
export async function POST(req: NextRequest, ctx: RouteContext) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await ctx.params;
  const force = req.nextUrl.searchParams.get("force") === "1";

  const webtoon = await prisma.webtoon.findFirst({
    where: { id, academyId: staff.academyId },
    select: { id: true, status: true, imageUrl: true, textDoc: true },
  });
  if (!webtoon) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }
  if (webtoon.status !== "COMPLETED" || !webtoon.imageUrl) {
    return NextResponse.json(
      { error: "완료된 웹툰만 편집할 수 있습니다" },
      { status: 409 },
    );
  }

  if (!force && webtoon.textDoc) {
    return NextResponse.json({ ok: true, textDoc: webtoon.textDoc, cached: true });
  }

  let imageBuffer: Buffer;
  try {
    const res = await fetch(webtoon.imageUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`download ${res.status}`);
    imageBuffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: `웹툰 이미지를 불러오지 못했습니다: ${message}` },
      { status: 502 },
    );
  }

  let textDoc: WebtoonTextDoc;
  try {
    textDoc = await detectWebtoonText({ imageBuffer, originalUrl: webtoon.imageUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[webtoon detect-text] failed", { id, message });
    return NextResponse.json(
      { error: `텍스트 인식에 실패했습니다: ${message}` },
      { status: 500 },
    );
  }

  await prisma.webtoon.update({
    where: { id: webtoon.id },
    data: { textDoc: textDoc as unknown as object },
  });

  return NextResponse.json({ ok: true, textDoc, cached: false });
}
