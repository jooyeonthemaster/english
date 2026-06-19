import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { markAllNotificationsRead } from "@/lib/growth/notifications";

// Mark all of the current staff's notifications read.
export async function POST() {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const count = await markAllNotificationsRead(staff.id);
    return NextResponse.json({ ok: true, count });
  } catch (error) {
    console.error("[notifications/read-all] Error:", error);
    return NextResponse.json({ error: "Failed to mark all read" }, { status: 500 });
  }
}
