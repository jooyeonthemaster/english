"use server";

import { prisma } from "@/lib/prisma";
import { requireStudent } from "./_helpers";

// ---------------------------------------------------------------------------
// 15. getStudentNotices — 학생 대상 공지사항
// ---------------------------------------------------------------------------
export async function getStudentNotices() {
  const session = await requireStudent();
  const studentId = session.studentId;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      academyId: true,
      classEnrollments: {
        where: { status: "ENROLLED" },
        select: { classId: true },
      },
    },
  });

  if (!student) return [];

  const classIds = student.classEnrollments.map((e) => e.classId);

  const notices = await prisma.notice.findMany({
    where: {
      academyId: student.academyId,
      OR: [
        { targetType: "ALL" },
        { targetType: "CLASS", targetId: { in: classIds } },
        { targetType: "INDIVIDUAL", targetId: studentId },
      ],
      publishAt: { lte: new Date() },
    },
    orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }],
    take: 50,
  });

  // Fetch read status for these notices
  const readNoticeIds = new Set(
    (await prisma.noticeRead.findMany({
      where: {
        noticeId: { in: notices.map((n) => n.id) },
        readerId: studentId,
        readerType: "STUDENT",
      },
      select: { noticeId: true },
    })).map((r) => r.noticeId),
  );

  return notices.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    isPinned: n.isPinned,
    publishedAt: n.publishAt?.toISOString() ?? n.createdAt.toISOString(),
    isRead: readNoticeIds.has(n.id),
    targetType: n.targetType,
  }));
}

// ---------------------------------------------------------------------------
// 16. markNoticeAsRead — 공지 읽음 처리
// ---------------------------------------------------------------------------
export async function markNoticeAsRead(noticeId: string) {
  const session = await requireStudent();

  await prisma.noticeRead.upsert({
    where: {
      noticeId_readerId_readerType: {
        noticeId,
        readerId: session.studentId,
        readerType: "STUDENT",
      },
    },
    update: {},
    create: {
      noticeId,
      readerId: session.studentId,
      readerType: "STUDENT",
    },
  });
}
