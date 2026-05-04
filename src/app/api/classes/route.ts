// ============================================================================
// GET /api/classes — lightweight list of the caller's academy classes.
//
// Used by the passages/import done-step "반 과제 배포" dialog to render a
// selector. Delegates to the existing `getClasses(academyId)` server action
// so we don't duplicate the Prisma query or the ScheduleEntry parsing logic.
//
// Auth: any staff member of the academy (both DIRECTOR and TEACHER can view
// the class roster — the subsequent /director/assignments/new page enforces
// its own role guard).
// ============================================================================

import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { getClasses } from "@/actions/classes";

export async function GET() {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const classes = await getClasses(staff.academyId);
    // Keep the payload tight — the dialog only needs id + name + active flag
    // to render a selectable list.
    return NextResponse.json({
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        isActive: c.isActive,
        enrolledCount: c.enrolledCount,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "반 목록을 불러오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
