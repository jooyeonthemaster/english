import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { markNotificationRead } from "@/lib/growth/notifications";

// Mark a single notification read (ownership-checked inside the lib).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const updated = await markNotificationRead(staff.id, id);
    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    console.error("[notifications/[id]/read] Error:", error);
    return NextResponse.json({ error: "Failed to mark read" }, { status: 500 });
  }
}
