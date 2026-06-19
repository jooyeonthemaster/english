import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { markNotificationsSeen } from "@/lib/growth/notifications";

// Mark inbox as seen → clears the bell badge. Called when the popover opens.
export async function POST() {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await markNotificationsSeen(staff.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[notifications/seen] Error:", error);
    return NextResponse.json({ error: "Failed to mark seen" }, { status: 500 });
  }
}
