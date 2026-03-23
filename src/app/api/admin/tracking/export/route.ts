import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const schoolSlug = searchParams.get("school") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const studentSearch = searchParams.get("student") || "";

  // Build same filter as tracking page
  const where: Record<string, unknown> = {};

  if (schoolSlug) {
    const school = await prisma.school.findFirst({
      where: { slug: schoolSlug },
      select: { id: true },
    });
    if (school) {
      where.student = { schoolId: school.id };
    }
  }

  if (studentSearch) {
    const matchingStudents = await prisma.student.findMany({
      where: {
        OR: [
          { name: { contains: studentSearch } },
          { studentCode: { contains: studentSearch } },
        ],
      },
      select: { id: true },
    });
    const studentIds = matchingStudents.map((s) => s.id);
    if (where.student) {
      (where.student as Record<string, unknown>).id = { in: studentIds };
    } else {
      where.studentId = { in: studentIds };
    }
  }

  if (from || to) {
    const takenAt: Record<string, Date> = {};
    if (from) takenAt.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      takenAt.lte = toDate;
    }
    where.takenAt = takenAt;
  }

  const results = await prisma.vocabTestResult.findMany({
    where,
    include: {
      student: {
        include: {
          school: { select: { name: true } },
        },
      },
      list: { select: { title: true } },
    },
    orderBy: { takenAt: "desc" },
    take: 10000, // Max export limit
  });

  const testTypeMap: Record<string, string> = {
    EN_TO_KR: "\uc601\u2192\ud55c",
    KR_TO_EN: "\ud55c\u2192\uc601",
    SPELLING: "\uc2a4\ud3a0\ub9c1",
  };

  // Build CSV
  const header = "\ud559\uc0dd\uba85,\ud559\uc0dd\ucf54\ub4dc,\ud559\uad50,\ub0a0\uc9dc,\ub2e8\uc5b4\uc7a5,\uc720\ud615,\uc810\uc218,\ucd1d\uc810,\ud37c\uc13c\ud2b8,\uc18c\uc694\uc2dc\uac04(\ucd08)";
  const rows = results.map((r) => {
    const date = new Date(r.takenAt).toLocaleDateString("ko-KR");
    return [
      r.student.name,
      r.student.studentCode,
      r.student.school?.name ?? "",
      date,
      `"${r.list.title}"`,
      testTypeMap[r.testType] || r.testType,
      r.score,
      r.total,
      Math.round(r.percent),
      r.duration || "",
    ].join(",");
  });

  const csv = "\uFEFF" + [header, ...rows].join("\n"); // BOM for Korean Excel

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tracking-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
