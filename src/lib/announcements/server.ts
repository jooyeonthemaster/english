/**
 * 스모트 소식(플랫폼 공지) 서버 전용 조회 헬퍼 — 원장/강사/학생/학부모 각
 * 리더 액션이 공유한다. prisma 를 쓰므로 서버에서만 import 한다("use server"
 * 지시자는 붙이지 않는다 — 액션이 아니라 순수 헬퍼).
 */

import { prisma } from "@/lib/prisma";
import { announcementMatchesRole, type AnnouncementRole } from "./shared";

export interface AnnouncementListItem {
  id: string;
  title: string;
  content: string;
  category: string;
  publishedAt: string; // ISO
  isPinned: boolean;
  /** 마지막 확인 시각 이후 발행된 글이면 true(신규 강조용). */
  isNew: boolean;
}

/**
 * 특정 역할 뷰어에게 노출되는 발행 공지 목록.
 * audiences 는 콤마 조인 문자열이라 SQL 로 정확히 필터하기 어려워, 발행 글을
 * 넉넉히 가져와(최대 100건) 메모리에서 역할 매칭한다. 실서비스 공지 수는 소수라
 * 문제되지 않는다.
 */
export async function listPublishedAnnouncements(
  role: AnnouncementRole,
  lastReadAt: Date | null,
): Promise<AnnouncementListItem[]> {
  const rows = await prisma.platformAnnouncement.findMany({
    where: { status: "PUBLISHED", publishedAt: { lte: new Date() } },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    take: 100,
  });

  return rows
    .filter((r) => announcementMatchesRole(r.audiences, role))
    .map((r) => {
      const pub = r.publishedAt ?? r.createdAt;
      return {
        id: r.id,
        title: r.title,
        content: r.content,
        category: r.category,
        publishedAt: pub.toISOString(),
        isPinned: r.isPinned,
        isNew: !lastReadAt || pub > lastReadAt,
      };
    });
}

/** 마지막 확인 시각 이후 노출 대상 신규 발행 글이 있는지(점 배지용). */
export async function hasUnreadAnnouncements(
  role: AnnouncementRole,
  lastReadAt: Date | null,
): Promise<boolean> {
  const rows = await prisma.platformAnnouncement.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: lastReadAt
        ? { lte: new Date(), gt: lastReadAt }
        : { lte: new Date() },
    },
    select: { audiences: true },
    take: 100,
  });
  return rows.some((r) => announcementMatchesRole(r.audiences, role));
}
