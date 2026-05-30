import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TUTOR_PROGRAM_GENERATION_DOMAIN } from "@/lib/tutor/program-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.floor(limitParam), 1), 100)
    : 30;

  const jobs = await prisma.workbenchAiJob.findMany({
    where: {
      academyId: staff.academyId,
      domain: TUTOR_PROGRAM_GENERATION_DOMAIN,
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      title: true,
      requestedCount: true,
      successCount: true,
      failedCount: true,
      resultCount: true,
      config: true,
      result: true,
      errorMessage: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ jobs });
}

