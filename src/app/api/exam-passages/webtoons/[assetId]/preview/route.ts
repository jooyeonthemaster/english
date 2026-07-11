import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  EXAM_PASSAGE_WEBTOON_APPROVED_STATUS,
  EXAM_PASSAGE_WEBTOON_STYLE,
} from "@/lib/exam-passages/webtoon-assets";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  const asset = await prisma.examPassageWebtoonAsset.findFirst({
    where: {
      id: assetId,
      style: EXAM_PASSAGE_WEBTOON_STYLE,
      status: EXAM_PASSAGE_WEBTOON_APPROVED_STATUS,
      imageUrl: { not: null },
    },
    select: { imageUrl: true },
  });

  if (!asset?.imageUrl) {
    return NextResponse.json({ error: "미리보기 이미지를 찾을 수 없습니다." }, { status: 404 });
  }

  const upstream = await fetch(asset.imageUrl, { cache: "no-store" });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `이미지 미리보기 생성에 실패했습니다. (${upstream.status})` },
      { status: 502 },
    );
  }

  const blurred = await sharp(Buffer.from(await upstream.arrayBuffer()), { failOn: "none" })
    .resize({ width: 640, withoutEnlargement: true })
    .blur(18)
    .jpeg({ quality: 72 })
    .toBuffer();
  const body = blurred.buffer.slice(
    blurred.byteOffset,
    blurred.byteOffset + blurred.byteLength,
  ) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
