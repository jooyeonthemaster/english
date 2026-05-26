import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  getAdminCreditTopUps,
  getAdminCreditTopUpStats,
} from "@/lib/admin-credit-topups";

export async function GET(request: NextRequest) {
  await requireAdminAuth();
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const [topUps, stats] = await Promise.all([
    getAdminCreditTopUps(limit),
    getAdminCreditTopUpStats(),
  ]);
  return NextResponse.json({ topUps, stats });
}
