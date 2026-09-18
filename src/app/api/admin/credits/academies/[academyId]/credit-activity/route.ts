import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  getAcademyCreditActivity,
  ACADEMY_ACTIVITY_PAGE_SIZE,
} from "@/lib/admin-credit-topups";

interface RouteContext {
  params: Promise<{ academyId: string }>;
}

export async function GET(request: NextRequest, ctx: RouteContext) {
  // requireAdminAuth 는 throw 한다 — 감싸지 않으면 무인증 요청이 401 이 아니라 본문 0바이트 500 으로
  // 나간다(실측). 같은 폴더의 top-ups/route.ts:14-17 과 같은 모양으로 맞춘다.
  try {
    await requireAdminAuth();
  } catch {
    return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  }
  const { academyId } = await ctx.params;
  const params = request.nextUrl.searchParams;
  const page = clampInt(Number(params.get("page") ?? 1), 1, Number.MAX_SAFE_INTEGER, 1);
  const pageSize = clampInt(
    Number(params.get("pageSize") ?? ACADEMY_ACTIVITY_PAGE_SIZE),
    1,
    100,
    ACADEMY_ACTIVITY_PAGE_SIZE,
  );

  const result = await getAcademyCreditActivity(academyId, page, pageSize);
  return NextResponse.json(result);
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}
