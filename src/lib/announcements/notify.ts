/**
 * 스모트 소식(플랫폼 공지) 발행 시 대상 staff(원장/강사)의 벨 알림으로 팬아웃한다.
 * 학생/학부모는 각 앱의 점 배지로 처리하므로 staff 벨엔 넣지 않는다.
 *
 * 최초 발행 1회만 호출되도록 호출부(save/mutate/release)가 가드한다(중복 알림 방지).
 * 발행 트랜잭션을 막지 않도록 항상 best-effort로 호출한다(실패해도 발행은 성공).
 * 서버 전용 헬퍼("use server" 아님).
 */

import { prisma } from "@/lib/prisma";
import { parseAnnouncementAudiences, categoryLabel } from "./shared";

export interface PublishedAnnouncementForNotify {
  id: string;
  title: string;
  category: string;
  audiences: string | null;
}

/** 발행된 소식을 대상 staff 벨로 팬아웃. 생성된 알림 수를 반환. */
export async function notifyStaffOfPublishedAnnouncement(
  a: PublishedAnnouncementForNotify,
): Promise<number> {
  const roles = parseAnnouncementAudiences(a.audiences);
  const wantDirector = roles.includes("DIRECTOR");
  const wantTeacher = roles.includes("TEACHER");
  // 학생/학부모 전용 공지면 staff 벨 대상 아님.
  if (!wantDirector && !wantTeacher) return 0;

  // staffRoleToAnnouncementRole: DIRECTOR→DIRECTOR, 그 외 staff→TEACHER.
  const roleWhere =
    wantDirector && wantTeacher
      ? {}
      : wantDirector
        ? { role: "DIRECTOR" }
        : { role: { not: "DIRECTOR" } };

  const staff = await prisma.staff.findMany({
    where: { isActive: true, ...roleWhere },
    select: { id: true, academyId: true, role: true },
  });
  if (staff.length === 0) return 0;

  const body = `새 스모트 소식 · ${categoryLabel(a.category)}`;
  const res = await prisma.notification.createMany({
    data: staff.map((s) => ({
      academyId: s.academyId,
      recipientStaffId: s.id,
      category: "SYSTEM",
      type: "ANNOUNCEMENT_PUBLISHED",
      title: a.title,
      body,
      iconKey: "megaphone",
      // 벨에서 클릭 시 각 역할의 소식 리더로 이동.
      actionUrl: s.role === "DIRECTOR" ? "/director/notices" : "/teacher/notices",
      data: { announcementId: a.id },
      groupKey: `announcement:${a.id}`,
    })),
  });
  return res.count;
}
