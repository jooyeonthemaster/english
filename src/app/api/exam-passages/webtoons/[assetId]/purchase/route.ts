import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deductCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import {
  EXAM_PASSAGE_WEBTOON_APPROVED_STATUS,
  EXAM_PASSAGE_WEBTOON_DOWNLOAD_CREDITS,
  EXAM_PASSAGE_WEBTOON_STYLES,
  isExamPassageWebtoonStyle,
  type ExamPassageWebtoonAssetSummary,
  type ExamPassageWebtoonStatus,
} from "@/lib/exam-passages/webtoon-assets";
import { isWebtoonLanguageId } from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
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
      status: true,
      imageUrl: true,
      reviewedAt: true,
      style: true,
    },
  });

  if (
    !asset?.imageUrl ||
    !isExamPassageWebtoonStyle(asset.style) ||
    !isWebtoonLanguageId(asset.language)
  ) {
    return NextResponse.json(
      { error: "구매 가능한 기출 웹툰을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const existing = await prisma.examPassageWebtoonPurchase.findUnique({
    where: {
      academyId_examPassageId_language_style: {
        academyId: staff.academyId,
        examPassageId: asset.examPassageId,
        language: asset.language,
        style: asset.style,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ ok: true, asset: toSummary(asset) });
  }

  let txId: string;
  try {
    const credit = await deductCredits(
      staff.academyId,
      "WEBTOON_EXAM_DOWNLOAD",
      staff.id,
      {
        assetId: asset.id,
        examPassageId: asset.examPassageId,
        language: asset.language,
        style: asset.style,
      },
      EXAM_PASSAGE_WEBTOON_DOWNLOAD_CREDITS,
    );
    txId = credit.transactionId;
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "크레딧이 부족합니다.",
          balance: err.currentBalance,
          required: err.requiredCredits,
        },
        { status: 402 },
      );
    }
    throw err;
  }

  try {
    await prisma.examPassageWebtoonPurchase.create({
      data: {
        academyId: staff.academyId,
        createdById: staff.id,
        examPassageId: asset.examPassageId,
        assetId: asset.id,
        language: asset.language,
        style: asset.style,
        creditTransactionId: txId,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      await refundCredits(
        staff.academyId,
        "WEBTOON_EXAM_DOWNLOAD",
        txId,
        "Duplicate exam webtoon unlock",
        EXAM_PASSAGE_WEBTOON_DOWNLOAD_CREDITS,
      );
      return NextResponse.json({ ok: true, asset: toSummary(asset) });
    }
    await refundCredits(
      staff.academyId,
      "WEBTOON_EXAM_DOWNLOAD",
      txId,
      "Exam webtoon unlock failed",
      EXAM_PASSAGE_WEBTOON_DOWNLOAD_CREDITS,
    );
    throw err;
  }

  return NextResponse.json({ ok: true, asset: toSummary(asset) });
}

function toSummary(asset: {
  id: string;
  examPassageId: string;
  style: string;
  language: string;
  status: string;
  imageUrl: string | null;
  reviewedAt: Date | null;
}): ExamPassageWebtoonAssetSummary {
  // style·language 는 Prisma 스칼라(string)로 들어오지만, 이 함수의 모든 호출부는
  // 앞서 isExamPassageWebtoonStyle·isWebtoonLanguageId 가드를 통과한 asset 만 넘긴다
  // (미통과 시 404 early-return). 따라서 유니온 캐스팅은 런타임 안전하다.
  // (TS는 asset.style 속성 좁힘을 객체 전체 전달 시 유지하지 못한다 — status 캐스팅과 동일 패턴)
  return {
    id: asset.id,
    examPassageId: asset.examPassageId,
    style: asset.style as ExamPassageWebtoonAssetSummary["style"],
    language: asset.language as ExamPassageWebtoonAssetSummary["language"],
    status: asset.status as ExamPassageWebtoonStatus,
    imageUrl: asset.imageUrl,
    previewBlurred: false,
    purchased: true,
    credits: EXAM_PASSAGE_WEBTOON_DOWNLOAD_CREDITS,
    reviewedAt: asset.reviewedAt?.toISOString() ?? null,
  };
}
