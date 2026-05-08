import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/extraction/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISIBLE_M1_DRAFT_STATUSES = ["DRAFT", "REVIEWED"];

export async function GET(req: NextRequest) {
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const limit = Math.min(
    300,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 200)),
  );
  const jobId = req.nextUrl.searchParams.get("jobId");

  const drafts = await prisma.extractionM1PassageDraft.findMany({
    where: {
      ...(jobId ? { jobId } : {}),
      reviewStatus: { in: VISIBLE_M1_DRAFT_STATUSES },
      job: {
        academyId: staff.academyId,
        mode: "PASSAGE_ONLY",
      },
    },
    orderBy: [
      { job: { createdAt: "desc" } },
      { passageOrder: "asc" },
    ],
    take: limit,
    include: {
      job: {
        select: {
          id: true,
          originalFileName: true,
          totalPages: true,
          createdAt: true,
          completedAt: true,
          status: true,
          pages: {
            orderBy: { pageIndex: "asc" },
            select: {
              pageIndex: true,
              sourceFileName: true,
            },
          },
        },
      },
      changes: {
        orderBy: [{ sentenceOrder: "asc" }, { createdAt: "asc" }],
      },
      sourceMatches: {
        orderBy: [{ selected: "desc" }, { confidence: "desc" }],
      },
    },
  });

  return NextResponse.json({ drafts });
}
