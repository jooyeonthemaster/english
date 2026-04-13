import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { getCreditSummary } from "@/lib/credits";

export async function GET() {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await getCreditSummary(staff.academyId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[credits/balance] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit balance" },
      { status: 500 },
    );
  }
}
