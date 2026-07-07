"use server";

/**
 * 스모트 소식(플랫폼 공지) 리더 액션 — 원장/강사·학생·학부모 각 앱에서 발행된
 * 공지를 읽고, "마지막 확인 시각"을 갱신한다. 읽음 추적은 공지별 레코드 없이
 * 각 프로필(Staff/Student/Parent)의 lastAnnouncementReadAt 타임스탬프 1개로 한다.
 */

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { requireParentAuth } from "@/lib/auth-parent";
import { requireStudent } from "@/actions/student-app/_helpers";
import {
  listPublishedAnnouncements,
  hasUnreadAnnouncements,
  type AnnouncementListItem,
} from "@/lib/announcements/server";
import { staffRoleToAnnouncementRole } from "@/lib/announcements/shared";

export type { AnnouncementListItem };

// ── 원장/강사(Staff) ──────────────────────────────────────────────────────────

export async function getStaffAnnouncements(): Promise<AnnouncementListItem[]> {
  const staff = await requireStaffAuth();
  const row = await prisma.staff.findUnique({
    where: { id: staff.id },
    select: { lastAnnouncementReadAt: true },
  });
  return listPublishedAnnouncements(
    staffRoleToAnnouncementRole(staff.role),
    row?.lastAnnouncementReadAt ?? null,
  );
}

export async function markStaffAnnouncementsRead() {
  const staff = await requireStaffAuth();
  await prisma.staff.update({
    where: { id: staff.id },
    data: { lastAnnouncementReadAt: new Date() },
  });
  return { success: true };
}

/** 사이드바 점 배지용 — 신규 소식 존재 여부. 미로그인/오류 시 false. */
export async function getStaffHasNewAnnouncements(): Promise<boolean> {
  const staff = await requireStaffAuth().catch(() => null);
  if (!staff) return false;
  const row = await prisma.staff.findUnique({
    where: { id: staff.id },
    select: { lastAnnouncementReadAt: true },
  });
  return hasUnreadAnnouncements(
    staffRoleToAnnouncementRole(staff.role),
    row?.lastAnnouncementReadAt ?? null,
  );
}

// ── 학생(Student) ─────────────────────────────────────────────────────────────

export async function getStudentAnnouncements(): Promise<AnnouncementListItem[]> {
  const session = await requireStudent();
  const row = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: { lastAnnouncementReadAt: true },
  });
  return listPublishedAnnouncements("STUDENT", row?.lastAnnouncementReadAt ?? null);
}

export async function markStudentAnnouncementsRead() {
  const session = await requireStudent();
  await prisma.student.update({
    where: { id: session.studentId },
    data: { lastAnnouncementReadAt: new Date() },
  });
  return { success: true };
}

export async function getStudentHasNewAnnouncements(): Promise<boolean> {
  const session = await requireStudent().catch(() => null);
  if (!session) return false;
  const row = await prisma.student.findUnique({
    where: { id: session.studentId },
    select: { lastAnnouncementReadAt: true },
  });
  return hasUnreadAnnouncements("STUDENT", row?.lastAnnouncementReadAt ?? null);
}

// ── 학부모(Parent) ────────────────────────────────────────────────────────────

export async function getParentAnnouncements(): Promise<AnnouncementListItem[]> {
  const session = await requireParentAuth();
  const row = await prisma.parent.findUnique({
    where: { id: session.parentId },
    select: { lastAnnouncementReadAt: true },
  });
  return listPublishedAnnouncements("PARENT", row?.lastAnnouncementReadAt ?? null);
}

export async function markParentAnnouncementsRead() {
  const session = await requireParentAuth();
  await prisma.parent.update({
    where: { id: session.parentId },
    data: { lastAnnouncementReadAt: new Date() },
  });
  return { success: true };
}

export async function getParentHasNewAnnouncements(): Promise<boolean> {
  const session = await requireParentAuth().catch(() => null);
  if (!session) return false;
  const row = await prisma.parent.findUnique({
    where: { id: session.parentId },
    select: { lastAnnouncementReadAt: true },
  });
  return hasUnreadAnnouncements("PARENT", row?.lastAnnouncementReadAt ?? null);
}
