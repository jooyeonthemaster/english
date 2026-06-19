import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { getReferralStats } from "@/lib/growth/referral";

export const runtime = "nodejs";

export async function GET() {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getReferralStats(staff.academyId);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[referral] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch referral stats" },
      { status: 500 },
    );
  }
}
