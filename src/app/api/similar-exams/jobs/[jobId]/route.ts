import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { jobId } = await ctx.params;
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const job = await prisma.similarExamGenerationJob.findFirst({
    where: {
      id: jobId,
      academyId: staff.academyId,
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      stage: true,
      title: true,
      sourceType: true,
      originalFileName: true,
      totalPages: true,
      blueprint: true,
      result: true,
      generatedExamId: true,
      errorMessage: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { jobId } = await ctx.params;
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  await prisma.similarExamGenerationJob.updateMany({
    where: {
      id: jobId,
      academyId: staff.academyId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
      status: "CANCELLED",
      stage: "FAILED",
      completedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
