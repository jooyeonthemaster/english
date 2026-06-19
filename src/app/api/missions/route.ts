import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { getMissionsForAcademy } from "@/lib/growth/missions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const missions = await getMissionsForAcademy(staff.academyId);
    return NextResponse.json({ missions });
  } catch (error) {
    console.error("[missions] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch missions" },
      { status: 500 },
    );
  }
}
