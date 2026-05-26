import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import { getAdminCreditTopUpDetail } from "@/lib/admin-credit-topups";

interface RouteContext {
  params: Promise<{ topUpId: string }>;
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  await requireAdminAuth();
  const { topUpId } = await ctx.params;
  const topUp = await getAdminCreditTopUpDetail(topUpId);
  if (!topUp) {
    return NextResponse.json(
      { error: "충전 내역을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  return NextResponse.json({ topUp });
}
