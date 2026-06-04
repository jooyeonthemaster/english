import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createUploadTarget,
  similarExamPageImageKey,
} from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pageSchema = z.object({
  pageIndex: z.number().int().min(0).max(200),
  size: z.number().int().positive(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sourceFileName: z.string().trim().max(255).optional(),
});

const createJobSchema = z.object({
  sourceType: z.enum(["PDF", "IMAGES"]),
  originalFileName: z.string().trim().max(255).optional(),
  totalPages: z.number().int().min(1).max(200),
  pages: z.array(pageSchema).min(1).max(200),
  passageIds: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
});

function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function makeTitle(originalFileName: string | undefined, totalPages: number) {
  if (originalFileName?.trim()) return originalFileName.trim();
  return `패턴 기반 시험지 생성 (${totalPages}p)`;
}

export async function GET(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.floor(limitParam), 1), 100)
    : 50;

  const jobs = await prisma.similarExamGenerationJob.findMany({
    where: { academyId: staff.academyId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      stage: true,
      title: true,
      originalFileName: true,
      totalPages: true,
      generatedExamId: true,
      errorMessage: true,
      result: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
  });

  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = createJobSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { pages, sourceType, originalFileName, totalPages, passageIds } = parsed.data;
  const indices = pages.map((page) => page.pageIndex);
  if (new Set(indices).size !== indices.length || pages.length !== totalPages) {
    return NextResponse.json(
      { error: "Page list is incomplete or duplicated." },
      { status: 400 },
    );
  }
  const ownedPassageCount = await prisma.passage.count({
    where: {
      academyId: staff.academyId,
      id: { in: [...new Set(passageIds)] },
    },
  });
  if (ownedPassageCount !== new Set(passageIds).size) {
    return NextResponse.json(
      { error: "Selected passages are invalid." },
      { status: 400 },
    );
  }

  const job = await prisma.similarExamGenerationJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      status: "PENDING",
      stage: "UPLOADING",
      title: makeTitle(originalFileName, totalPages),
      sourceType,
      originalFileName: originalFileName ?? null,
      totalPages,
      pageImageUrls: pages.map((page) =>
        similarExamPageImageKey(
          staff.academyId,
          "pending",
          page.pageIndex,
          extensionForMime(page.mimeType),
        ),
      ),
      config: {
        mode: "PATTERN_PROFILE_DRIVEN",
        passageIds: [...new Set(passageIds)],
        preserveQuestionOrder: true,
        preserveStimulusGroups: true,
      },
    },
    select: { id: true },
  });

  const pageImageUrlByIndex = new Map(
    pages.map((page) => [
      page.pageIndex,
      similarExamPageImageKey(
        staff.academyId,
        job.id,
        page.pageIndex,
        extensionForMime(page.mimeType),
      ),
    ] as const),
  );
  const pageImageUrls = pages
    .map((page) => page.pageIndex)
    .sort((a, b) => a - b)
    .map((pageIndex) => pageImageUrlByIndex.get(pageIndex) as string);

  await prisma.similarExamGenerationJob.update({
    where: { id: job.id },
    data: { pageImageUrls },
  });

  const uploadTargets = await Promise.all(
    pages.map(async (page) => {
      const uploadPath = pageImageUrlByIndex.get(page.pageIndex);
      if (!uploadPath) throw new Error(`Missing upload path for page ${page.pageIndex}`);
      const target = await createUploadTarget(uploadPath);
      return { pageIndex: page.pageIndex, ...target };
    }),
  );

  return NextResponse.json({
    jobId: job.id,
    uploadTargets,
  });
}
