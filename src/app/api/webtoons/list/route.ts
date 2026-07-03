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
  const summary = searchParams.get("view") === "summary";
  // 과목 스코프 — 지문(passage.subject) 기준 국어/영어 웹툰 분리.
  //  - scope=KOREAN: 국어 지문 웹툰만(국어 표면 전용).
  //  - 미지정(기본=영어): 국어 지문 웹툰 제외. 단 passageId 로 특정 지문에 이미
  //    명시 스코프된 호출(지문 상세 보관함)은 그 지문이 곧 스코프라 과목 필터를
  //    겹치지 않는다(국어 지문 상세의 기존 passageId 호출 무회귀).
  const scope = searchParams.get("scope") === "KOREAN" ? "KOREAN" : null;

  const where: Record<string, unknown> = { academyId: staff.academyId };
  if (scope === "KOREAN") {
    where.passage = { is: { subject: "KOREAN" } };
  } else if (!passageId) {
    // passage.subject 는 nullable(기존 영어 지문 전부 null) — `not` 만 쓰면 SQL
    // `<>` 가 NULL 행을 탈락시켜 영어 웹툰 전체가 사라진다. null 을 OR 로 명시해
    // 영어(=subject 미기록) 지문 웹툰이 절대 빠지지 않게 한다(_passage-where 미러).
    where.passage = {
      is: { OR: [{ subject: null }, { subject: { not: "KOREAN" } }] },
    };
  }
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

  const itemSelect = summary
    ? {
        id: true,
        passageId: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        passage: { select: { id: true, title: true } },
        createdBy: { select: { id: true, name: true } },
      }
    : {
        id: true,
        passageId: true,
        style: true,
        language: true,
        customPrompt: true,
        status: true,
        approved: true,
        imageUrl: true,
        editedImageUrl: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
        passage: { select: { id: true, title: true, content: true } },
        createdBy: { select: { id: true, name: true } },
      };

  const [items, total] = await Promise.all([
    prisma.webtoon.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
      select: itemSelect,
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
