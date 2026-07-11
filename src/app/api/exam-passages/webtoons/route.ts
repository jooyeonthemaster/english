import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  EXAM_PASSAGE_WEBTOON_APPROVED_STATUS,
  EXAM_PASSAGE_WEBTOON_DOWNLOAD_CREDITS,
  EXAM_PASSAGE_WEBTOON_STYLE,
  type ExamPassageWebtoonAvailabilityResponse,
  type ExamPassageWebtoonStatus,
} from "@/lib/exam-passages/webtoon-assets";
import { EXAM_MAX_IDS } from "@/lib/exam-passages/types";
import { isWebtoonLanguageId } from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const ids = csv(request.nextUrl.searchParams.get("ids")).slice(0, EXAM_MAX_IDS);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, byPassageId: {} } satisfies ExamPassageWebtoonAvailabilityResponse);
  }

  const assets = await prisma.examPassageWebtoonAsset.findMany({
    where: {
      examPassageId: { in: ids },
      style: EXAM_PASSAGE_WEBTOON_STYLE,
      status: EXAM_PASSAGE_WEBTOON_APPROVED_STATUS,
      imageUrl: { not: null },
    },
    orderBy: [{ examPassageId: "asc" }, { language: "asc" }],
    select: {
      id: true,
      examPassageId: true,
      language: true,
      status: true,
      imageUrl: true,
      reviewedAt: true,
    },
  });

  const purchases = await prisma.examPassageWebtoonPurchase.findMany({
    where: {
      academyId: staff.academyId,
      assetId: { in: assets.map((asset) => asset.id) },
    },
    select: { assetId: true },
  });
  const purchasedAssetIds = new Set(purchases.map((purchase) => purchase.assetId));

  const byPassageId: ExamPassageWebtoonAvailabilityResponse["byPassageId"] = {};
  for (const asset of assets) {
    if (!isWebtoonLanguageId(asset.language)) continue;
    const purchased = purchasedAssetIds.has(asset.id);
    const list = byPassageId[asset.examPassageId] ?? [];
    list.push({
      id: asset.id,
      examPassageId: asset.examPassageId,
      language: asset.language,
      status: asset.status as ExamPassageWebtoonStatus,
      imageUrl: purchased
        ? asset.imageUrl
        : `/api/exam-passages/webtoons/${asset.id}/preview`,
      previewBlurred: !purchased,
      purchased,
      credits: EXAM_PASSAGE_WEBTOON_DOWNLOAD_CREDITS,
      reviewedAt: asset.reviewedAt?.toISOString() ?? null,
    });
    byPassageId[asset.examPassageId] = list;
  }

  return NextResponse.json({ ok: true, byPassageId } satisfies ExamPassageWebtoonAvailabilityResponse);
}

function csv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
