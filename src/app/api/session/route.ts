import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";

export async function GET() {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json(null, { status: 401 });
  }
  return NextResponse.json({
    id: staff.id,
    name: staff.name,
    role: staff.role,
    academyId: staff.academyId,
    academyName: staff.academyName,
  });
}
