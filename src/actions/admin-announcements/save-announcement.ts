"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { serializeAnnouncementAudiences } from "@/lib/announcements/shared";
import { notifyStaffOfPublishedAnnouncement } from "@/lib/announcements/notify";
import {
  announcementInputSchema,
  fail,
  toNullableDate,
  type ActionResult,
} from "./_shared";

function normalize(raw: unknown) {
  const parsed = announcementInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
    };
  }
  const v = parsed.data;
  let publishedAt = toNullableDate(v.publishedAt);
  // 발행 상태인데 게시일이 비어 있으면 지금으로 채운다(소급 입력 시엔 지정값 유지).
  if (v.status === "PUBLISHED" && !publishedAt) publishedAt = new Date();
  return {
    ok: true as const,
    data: {
      title: v.title,
      content: v.content,
      category: v.category,
      status: v.status,
      isPinned: v.isPinned,
      audiences: serializeAnnouncementAudiences(v.audiences),
      publishedAt,
    },
  };
}

export async function createAnnouncement(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");

  const normalized = normalize(raw);
  if (!normalized.ok) return fail(normalized.error);

  try {
    const created = await prisma.platformAnnouncement.create({
      data: { ...normalized.data, sourceType: "MANUAL" },
      select: { id: true },
    });
    // 발행 상태로 새로 만들면 대상 staff 벨에 알림(best-effort).
    if (normalized.data.status === "PUBLISHED") {
      await notifyStaffOfPublishedAnnouncement({
        id: created.id,
        title: normalized.data.title,
        category: normalized.data.category,
        audiences: normalized.data.audiences,
      }).catch((e) => console.error("[announcement notify] create", e));
    }
    revalidatePath("/admin/announcements");
    return { success: true, id: created.id };
  } catch {
    return fail("공지 저장에 실패했습니다.");
  }
}

export async function updateAnnouncement(
  id: string,
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");
  if (!id) return fail("공지를 찾을 수 없습니다.");

  const normalized = normalize(raw);
  if (!normalized.ok) return fail(normalized.error);

  try {
    // 최초 발행 전환 감지용으로 직전 게시일을 읽는다(이미 발행됐던 글 재저장 시 재알림 방지).
    const prior = await prisma.platformAnnouncement.findUnique({
      where: { id },
      select: { publishedAt: true },
    });
    await prisma.platformAnnouncement.update({
      where: { id },
      data: normalized.data,
    });
    // 초안/보관 → 발행으로 처음 넘어갈 때만 벨 알림(best-effort).
    if (normalized.data.status === "PUBLISHED" && !prior?.publishedAt) {
      await notifyStaffOfPublishedAnnouncement({
        id,
        title: normalized.data.title,
        category: normalized.data.category,
        audiences: normalized.data.audiences,
      }).catch((e) => console.error("[announcement notify] update", e));
    }
    revalidatePath("/admin/announcements");
    return { success: true, id };
  } catch {
    return fail("공지 수정에 실패했습니다.");
  }
}
