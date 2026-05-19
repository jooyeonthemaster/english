import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeDomain(raw: string | null): string | undefined {
  if (!raw || raw === "all") return undefined;
  if (raw === "passage-analysis") return "PASSAGE_ANALYSIS";
  if (raw === "question-generation") return "QUESTION_GENERATION";
  return raw;
}

export async function GET(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const domain = normalizeDomain(req.nextUrl.searchParams.get("domain"));
  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.floor(limitParam), 1), 100)
    : 50;

  const jobs = await prisma.workbenchAiJob.findMany({
    where: {
      academyId: staff.academyId,
      deletedAt: null,
      ...(domain ? { domain } : {}),
    },
    include: {
      passage: {
        include: {
          school: { select: { id: true, name: true, type: true } },
          analysis: { select: { id: true, analysisData: true, contentHash: true, updatedAt: true } },
          notes: { orderBy: { order: "asc" } },
          questions: {
            include: { explanation: true, _count: { select: { examLinks: true } } },
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ jobs });
}
