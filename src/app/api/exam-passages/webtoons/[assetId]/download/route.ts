import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExamPassagesByIds } from "@/lib/exam-passages/corpus";
import { formatExamTitle } from "@/lib/exam-passages/format";
import {
  EXAM_PASSAGE_WEBTOON_APPROVED_STATUS,
  EXAM_PASSAGE_WEBTOON_STYLES,
  EXAM_PASSAGE_WEBTOON_STYLE_LABELS,
  isExamPassageWebtoonStyle,
} from "@/lib/exam-passages/webtoon-assets";
import {
  isWebtoonLanguageId,
  languageLabel,
} from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  const asset = await prisma.examPassageWebtoonAsset.findFirst({
    where: {
      id: assetId,
      style: { in: [...EXAM_PASSAGE_WEBTOON_STYLES] },
      status: EXAM_PASSAGE_WEBTOON_APPROVED_STATUS,
      imageUrl: { not: null },
    },
    select: {
      id: true,
      examPassageId: true,
      language: true,
      style: true,
      imageUrl: true,
      storagePath: true,
    },
  });

  if (!asset?.imageUrl || !isExamPassageWebtoonStyle(asset.style)) {
    return NextResponse.json({ error: "다운로드할 기출 웹툰을 찾을 수 없습니다." }, { status: 404 });
  }

  const purchase = await prisma.examPassageWebtoonPurchase.findFirst({
    where: { academyId: staff.academyId, assetId: asset.id },
    select: { id: true },
  });
  if (!purchase) {
    return NextResponse.json({ error: "기출 웹툰을 먼저 구매해야 합니다." }, { status: 402 });
  }

  const upstream = await fetch(asset.imageUrl, { cache: "no-store" });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `이미지 다운로드에 실패했습니다. (${upstream.status})` },
      { status: 502 },
    );
  }

  const passage = getExamPassagesByIds([asset.examPassageId])[0];
  const title = passage ? formatExamTitle(passage) : asset.examPassageId;
  const languageText = isWebtoonLanguageId(asset.language)
    ? languageLabel(asset.language)
    : asset.language;
  const filename = buildFilename(
    `${title} ${languageText} ${EXAM_PASSAGE_WEBTOON_STYLE_LABELS[asset.style]}`,
    asset.storagePath,
    upstream.headers.get("Content-Type") ?? "image/jpeg",
  );

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "image/jpeg");
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
  const base = sanitizeFilename(title || "exam-webtoon");
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
  return (
    value
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90) || "exam-webtoon"
  );
}

function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
