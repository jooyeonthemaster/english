import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    }

    const onlyAnalyzed = request.nextUrl.searchParams.get("onlyAnalyzed") === "true";
    const passageWhere = {
      academyId: staff.academyId,
      ...(onlyAnalyzed ? { analysis: { isNot: null } } : {}),
    };
    const collectionItemCount = onlyAnalyzed
      ? { where: { passage: { is: passageWhere } } }
      : true;

    const [passages, schools, collections] = await Promise.all([
      prisma.passage.findMany({
        where: passageWhere,
        select: {
          id: true,
          title: true,
          content: true,
          grade: true,
          semester: true,
          unit: true,
          publisher: true,
          difficulty: true,
          school: { select: { id: true, name: true } },
          collectionItems: { select: { collectionId: true } },
          analysis: { select: { id: true, analysisData: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.school.findMany({
        where: { academyId: staff.academyId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.passageCollection.findMany({
        where: { academyId: staff.academyId },
        select: {
          id: true,
          name: true,
          _count: { select: { items: collectionItemCount } },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    // Extract unique filter values
    const grades = [...new Set(passages.map((p) => p.grade).filter(Boolean))].sort();
    const semesters = [...new Set(passages.map((p) => p.semester).filter(Boolean))];
    const publishers = [...new Set(passages.map((p) => p.publisher).filter(Boolean))].sort();

    return NextResponse.json({
      passages,
      filters: { schools, grades, semesters, publishers },
      collections,
    });
  } catch {
    return NextResponse.json({ passages: [], filters: { schools: [], grades: [], semesters: [], publishers: [] } });
  }
}
