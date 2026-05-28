import { NextResponse } from "next/server";
import { requireStaffAuth } from "@/lib/auth";
import { getSubscriptionBillingOverview } from "@/lib/portone-subscriptions";

export async function GET() {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const overview = await getSubscriptionBillingOverview(staff.academyId);
    return NextResponse.json(overview);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json(
        { error: "정기결제 설정 권한이 없습니다." },
        { status: 403 },
      );
    }

    console.error("[subscriptions/portone] overview failed", err);
    return NextResponse.json(
      { error: "정기결제 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
