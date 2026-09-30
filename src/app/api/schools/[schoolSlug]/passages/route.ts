import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";

// 학원 범위(IDOR 수리 26-09-30): 예전에는 로그인만 하면 slug 로 어느 학원 학교든 찾아 그 지문
// 제목을 나열했다. 이제 스태프 세션의 학원 학교·지문만 본다(저장소 안 호출부 0).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ schoolSlug: string }> }
) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { schoolSlug } = await params;

  const school = await prisma.school.findFirst({
    where: { slug: schoolSlug, academyId: staff.academyId },
  });

  if (!school) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const passages = await prisma.passage.findMany({
    where: { schoolId: school.id, academyId: staff.academyId },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  return NextResponse.json(passages);
}
