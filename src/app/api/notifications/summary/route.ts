import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { getNotificationSummary } from "@/lib/growth/notifications";

// Lightweight polling endpoint — unseen badge count + latest timestamp only.
// Keep it cheap (egress lesson: never poll full payloads).
export async function GET() {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const summary = await getNotificationSummary(staff.id);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[notifications/summary] Error:", error);
    return NextResponse.json({ error: "Failed to fetch notification summary" }, { status: 500 });
  }
}
