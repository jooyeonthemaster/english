"use server";

import { prisma } from "@/lib/prisma";
import { requireParentAuth } from "@/lib/auth-parent";
import type { ParentNotice } from "./types";

export async function getParentNotices(): Promise<ParentNotice[]> {
  const session = await requireParentAuth();

  const now = new Date();
  const notices = await prisma.notice.findMany({
    where: {
      academyId: session.academyId,
      targetType: { in: ["ALL", "PARENTS"] },
      publishAt: { lte: now },
    },
    include: {
      reads: {
        where: { readerId: session.parentId, readerType: "PARENT" },
      },
    },
    orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }],
    take: 50,
  });

  return notices.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    publishAt: n.publishAt.toISOString(),
    isRead: n.reads.length > 0,
  }));
}

export async function markNoticeAsRead(noticeId: string) {
  const session = await requireParentAuth();

  await prisma.noticeRead.upsert({
    where: {
      noticeId_readerId_readerType: {
        noticeId,
        readerId: session.parentId,
        readerType: "PARENT",
      },
    },
    update: {},
    create: {
      noticeId,
      readerId: session.parentId,
      readerType: "PARENT",
    },
  });
}
