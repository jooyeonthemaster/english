import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  getAdminCreditTopUps,
  getAdminCreditTopUpStats,
  getAdminCreditTopUpTotalCount,
} from "@/lib/admin-credit-topups";

const DEFAULT_PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  await requireAdminAuth();
  const params = request.nextUrl.searchParams;
  const pageSize = clampInt(
    Number(params.get("pageSize") ?? params.get("limit") ?? DEFAULT_PAGE_SIZE),
    1,
    200,
    DEFAULT_PAGE_SIZE,
  );
  const page = clampInt(Number(params.get("page") ?? 1), 1, Number.MAX_SAFE_INTEGER, 1);
  const offset = (page - 1) * pageSize;

  const [topUps, stats, total] = await Promise.all([
    getAdminCreditTopUps(pageSize, offset),
    getAdminCreditTopUpStats(),
    getAdminCreditTopUpTotalCount(),
  ]);
  return NextResponse.json({ topUps, stats, total, page, pageSize });
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}
