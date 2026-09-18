// 추적 링크 — GET 목록+기간 통계(analyticsGet) · POST 생성(SUPER_ADMIN)
// 계약: docs/analytics/analytics-spec.md §2.5, §10

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { analyticsGet } from "@/lib/analytics/admin-route";
import { getLinksReport } from "@/lib/analytics/reports/links";
import { validateLinkCreate } from "@/lib/analytics/tracked-links";

export const dynamic = "force-dynamic";

export const GET = analyticsGet((q) => getLinksReport(q));

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminAuth>>;
  try {
    admin = await requireAdminAuth("SUPER_ADMIN");
  } catch {
    return NextResponse.json({ error: "최고 관리자 권한이 필요합니다." }, { status: 403, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 본문(JSON)을 읽을 수 없습니다." }, { status: 400, headers: NO_STORE });
  }

  const v = validateLinkCreate(body);
  if (!v.ok) {
    return NextResponse.json({ error: "입력값을 확인하세요.", fieldErrors: v.errors }, { status: 400, headers: NO_STORE });
  }

  try {
    const link = await prisma.analyticsTrackedLink.create({
      data: { ...v.value, createdBy: admin.adminId ?? null },
      select: { id: true, slug: true },
    });
    return NextResponse.json({ link }, { status: 201, headers: NO_STORE });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "이미 쓰고 있는 짧은 주소입니다.", fieldErrors: { slug: "이미 쓰고 있는 짧은 주소입니다" } },
        { status: 409, headers: NO_STORE },
      );
    }
    console.error("[analytics] tracked link create failed", err);
    return NextResponse.json({ error: "추적 링크를 만들지 못했습니다." }, { status: 500, headers: NO_STORE });
  }
}
