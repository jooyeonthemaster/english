import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { getNotifications } from "@/lib/growth/notifications";

// Full list — fetched only when the inbox/popover is opened.
export async function GET(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get("limit"));
    const beforeParam = searchParams.get("before");
    const before = beforeParam ? new Date(beforeParam) : undefined;

    const notifications = await getNotifications(staff.id, {
      limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20,
      before: before && !Number.isNaN(before.getTime()) ? before : undefined,
    });

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("[notifications/list] Error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
