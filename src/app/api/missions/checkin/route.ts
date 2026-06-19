import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { recordDailyCheckin } from "@/lib/growth/missions";

export const runtime = "nodejs";

export async function POST() {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Returns ClaimResult. When already claimed today the lib returns
    // { ok: false, reason: "already_claimed" } — surface it as a 200 so the
    // client can show "오늘은 이미 출석했어요" instead of treating it as an error.
    const result = await recordDailyCheckin(staff.academyId, staff.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[missions/checkin] Error:", error);
    return NextResponse.json(
      { error: "Failed to record daily check-in" },
      { status: 500 },
    );
  }
}
