import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { recordKakaoShare } from "@/lib/growth/missions";

export const runtime = "nodejs";

export async function POST() {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Returns ClaimResult. An already-rewarded share returns
    // { ok: false, reason: "already_claimed" } — still a 200 so the client can
    // decide how to present it.
    const result = await recordKakaoShare(staff.academyId, staff.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[missions/share] Error:", error);
    return NextResponse.json(
      { error: "Failed to record share reward" },
      { status: 500 },
    );
  }
}
