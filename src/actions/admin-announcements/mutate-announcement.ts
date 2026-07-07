"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { ANNOUNCEMENT_STATUSES } from "@/lib/announcements/shared";
import { notifyStaffOfPublishedAnnouncement } from "@/lib/announcements/notify";
import { fail, type ActionResult } from "./_shared";

async function requireSuper() {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) return null;
  return session;
}

/** 상태 전환(발행/보관/초안). 발행 시 게시일이 없으면 지금으로 채운다. */
export async function setAnnouncementStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  if (!(await requireSuper())) return fail("권한이 없습니다.");
  if (!ANNOUNCEMENT_STATUSES.includes(status as never)) {
    return fail("잘못된 상태입니다.");
  }
  try {
    const existing = await prisma.platformAnnouncement.findUnique({
      where: { id },
      select: {
        publishedAt: true,
        title: true,
        category: true,
        audiences: true,
      },
    });
    if (!existing) return fail("공지를 찾을 수 없습니다.");
    const firstPublish = status === "PUBLISHED" && !existing.publishedAt;
    await prisma.platformAnnouncement.update({
      where: { id },
      data: {
        status,
        publishedAt: firstPublish ? new Date() : undefined,
      },
    });
    // 초안/보관 → 발행 최초 전환 시 대상 staff 벨에 알림(best-effort).
    if (firstPublish) {
      await notifyStaffOfPublishedAnnouncement({
        id,
        title: existing.title,
        category: existing.category,
        audiences: existing.audiences,
      }).catch((e) => console.error("[announcement notify] setStatus", e));
    }
    revalidatePath("/admin/announcements");
    return { success: true };
  } catch {
    return fail("상태 변경에 실패했습니다.");
  }
}

export async function toggleAnnouncementPinned(
  id: string,
  isPinned: boolean,
): Promise<ActionResult> {
  if (!(await requireSuper())) return fail("권한이 없습니다.");
  try {
    await prisma.platformAnnouncement.update({
      where: { id },
      data: { isPinned },
    });
    revalidatePath("/admin/announcements");
    return { success: true };
  } catch {
    return fail("고정 설정에 실패했습니다.");
  }
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  if (!(await requireSuper())) return fail("권한이 없습니다.");
  try {
    await prisma.platformAnnouncement.delete({ where: { id } });
    revalidatePath("/admin/announcements");
    return { success: true };
  } catch {
    return fail("삭제에 실패했습니다.");
  }
}
