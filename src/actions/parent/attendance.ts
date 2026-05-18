"use server";

import { prisma } from "@/lib/prisma";
import { requireParentAuth } from "@/lib/auth-parent";

export async function getChildAttendance(studentId: string) {
  const session = await requireParentAuth();
  if (!session.studentIds.includes(studentId)) {
    throw new Error("접근 권한이 없습니다.");
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const attendances = await prisma.attendance.findMany({
    where: {
      studentId,
      date: { gte: startOfMonth },
    },
    orderBy: { date: "desc" },
  });

  const present = attendances.filter((a) => a.status === "PRESENT").length;
  const late = attendances.filter((a) => a.status === "LATE").length;
  const absent = attendances.filter((a) => a.status === "ABSENT").length;
  const total = attendances.length;
  const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

  return {
    present,
    late,
    absent,
    total,
    rate,
    records: attendances.map((a) => ({
      date: a.date.toISOString(),
      status: a.status,
      checkInTime: a.checkInTime?.toISOString() || null,
      checkOutTime: a.checkOutTime?.toISOString() || null,
      note: a.note,
    })),
  };
}
