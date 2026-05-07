import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import {
  enqueueLocalWebtoonGenerations,
  shouldUseLocalWebtoonWorker,
} from "@/lib/webtoon-local-worker";

export const runtime = "nodejs";

/**
 * GET /api/webtoons/list?status=&page=&limit=&passageId=&since=
 *
 * - `status`: filter by status (or "active" to mean PENDING|GENERATING)
 * - `page` / `limit`: pagination (default page 1, limit 50)
 * - `passageId`: scope to a specific passage
 * - `since`: ISO timestamp — only newer or unfinished. Used by client polling
 *            so we can ask "anything updated since {lastFetch}?" without
 *            re-fetching the whole library.
 */
export async function GET(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const statusFilter = searchParams.get("status");
  const passageId = searchParams.get("passageId");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const since = searchParams.get("since");

  const where: Record<string, unknown> = { academyId: staff.academyId };
  if (statusFilter === "active") {
    where.status = { in: ["PENDING", "GENERATING"] };
  } else if (statusFilter && ["PENDING", "GENERATING", "COMPLETED", "FAILED"].includes(statusFilter)) {
    where.status = statusFilter;
  }
  if (passageId) {
    where.passageId = passageId;
  }
  if (since) {
    const sinceDate = new Date(since);
    if (!Number.isNaN(sinceDate.getTime())) {
      // Either updated since OR still in flight (so polling sees status flips)
      where.OR = [
        { updatedAt: { gte: sinceDate } },
        { status: { in: ["PENDING", "GENERATING"] } },
      ];
    }
  }

  const [items, total] = await Promise.all([
    prisma.webtoon.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
      select: {
        id: true,
        passageId: true,
        style: true,
        customPrompt: true,
        status: true,
        imageUrl: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
        passage: { select: { id: true, title: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.webtoon.count({ where }),
  ]);

  if (shouldUseLocalWebtoonWorker()) {
    const activeIds = items
      .filter((item) => item.status === "PENDING" || item.status === "GENERATING")
      .map((item) => item.id);
    enqueueLocalWebtoonGenerations(activeIds);
  }

  return NextResponse.json({
    ok: true,
    items,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  });
}
