import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { planForModelId } from "@/lib/webtoon-models";
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
 *
 * Every row also carries `plan` ("STANDARD"|"PREMIUM"|null, derived from the
 * stored imageModel — the raw model id itself is not returned) and
 * `hasStoryboard` (v2 콘티 존재 여부). The storyboard JSON itself is never
 * shipped here — GET /api/webtoons/[id] returns it.
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
        imageModel: true,
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
        imageModel: true,
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

  const storyboardIds = await findIdsWithStoryboard(items.map((item) => item.id));
  const rows = items.map(({ imageModel, ...item }) => ({
    ...item,
    plan: planForModelId(imageModel)?.id ?? null,
    hasStoryboard: storyboardIds.has(item.id),
  }));

  return NextResponse.json({
    ok: true,
    items: rows,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  });
}

/**
 * 이 페이지 행 중 v2 콘티가 있는 id 집합. 콘티 JSON 을 행마다 끌어오지 않도록
 * PK 조회 + `IS NOT NULL` 판정만 한다(id 만 SELECT).
 * 실패해도 목록 자체는 살린다 — 콘티 표시만 빠지는 편이 목록 500 보다 낫다.
 */
async function findIdsWithStoryboard(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  try {
    const rows = await prisma.webtoon.findMany({
      where: { id: { in: ids }, NOT: { storyboard: { equals: Prisma.DbNull } } },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  } catch (err) {
    console.warn("[webtoons/list] storyboard presence lookup failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Set();
  }
}
