import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { claimMission } from "@/lib/growth/missions";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key } = await params;

    // Returns ClaimResult. Non-ok outcomes (already_claimed, condition_not_met,
    // mission_not_found, not_claimable, monthly_cap) are surfaced as a 200 with
    // the structured result so the client can render the specific reason.
    const result = await claimMission(staff.academyId, key, staff.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[missions/[key]/claim] Error:", error);
    return NextResponse.json(
      { error: "Failed to claim mission" },
      { status: 500 },
    );
  }
}
