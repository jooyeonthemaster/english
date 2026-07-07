import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { listHeldCoupons } from "@/lib/printable-coupon-discount";

export const runtime = "nodejs";

// 원장의 보유(CLAIMED) 할인 쿠폰 목록 — 충전 패널의 쿠폰 선택 UI가 조회.
export async function GET() {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (staff.role !== "DIRECTOR") {
    return NextResponse.json({ coupons: [] });
  }
  const coupons = await listHeldCoupons(staff.academyId);
  return NextResponse.json({ coupons });
}
