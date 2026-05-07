import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const webtoon = await prisma.webtoon.findFirst({
    where: {
      id,
      academyId: staff.academyId,
      status: "COMPLETED",
      imageUrl: { not: null },
    },
    select: {
      imageUrl: true,
      storagePath: true,
      passage: { select: { title: true } },
    },
  });

  if (!webtoon?.imageUrl) {
    return NextResponse.json({ error: "다운로드할 웹툰을 찾을 수 없습니다." }, { status: 404 });
  }

  const upstream = await fetch(webtoon.imageUrl, { cache: "no-store" });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `이미지 다운로드에 실패했습니다. (${upstream.status})` },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("Content-Type") ?? "image/jpeg";
  const filename = buildFilename(webtoon.passage.title, webtoon.storagePath, contentType);
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", contentDisposition(filename));
  headers.set("Cache-Control", "private, no-store");

  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) headers.set("Content-Length", contentLength);

  if (upstream.body) {
    return new NextResponse(upstream.body, { headers });
  }

  return new NextResponse(await upstream.arrayBuffer(), { headers });
}

function buildFilename(title: string, storagePath: string | null, contentType: string) {
  const base = sanitizeFilename(title || "webtoon");
  const extFromPath = storagePath?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const ext = extFromPath ?? extensionFromContentType(contentType);
  return `${base}.${ext}`;
}

function extensionFromContentType(contentType: string) {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  return "jpg";
}

function sanitizeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "webtoon";
}

function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
