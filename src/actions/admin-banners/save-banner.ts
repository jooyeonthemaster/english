"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { serializeAudiences } from "@/lib/site-banners/templates";
import {
  bannerInputSchema,
  fail,
  toNullableDate,
  type ActionResult,
} from "./_shared";

function normalize(raw: unknown) {
  const parsed = bannerInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." };
  }
  const v = parsed.data;
  const data = {
    title: v.title,
    type: v.type,
    templateKey: v.type === "TEMPLATE" ? (v.templateKey ?? null) : null,
    content: v.type === "TEMPLATE" ? v.content : {},
    imageUrl: v.type === "IMAGE" ? (v.imageUrl ?? null) : null,
    imageAlt: v.type === "IMAGE" ? (v.imageAlt ?? null) : null,
    linkUrl: v.linkUrl ? v.linkUrl : null,
    audiences: serializeAudiences(v.audiences),
    priority: v.priority,
    isActive: v.isActive,
    dismissMode: v.dismissMode,
    showDismissButton: v.showDismissButton,
    startsAt: toNullableDate(v.startsAt),
    endsAt: toNullableDate(v.endsAt),
    autoOpenOnLowCredit: v.autoOpenOnLowCredit,
  };
  return { ok: true as const, data };
}

export async function createBanner(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");

  const normalized = normalize(raw);
  if (!normalized.ok) return fail(normalized.error);

  try {
    const created = await prisma.siteBanner.create({
      data: { ...normalized.data, createdByAdminId: session.adminId },
      select: { id: true },
    });
    revalidatePath("/admin/banners");
    return { success: true, id: created.id };
  } catch {
    return fail("배너 저장에 실패했습니다.");
  }
}

export async function updateBanner(
  id: string,
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");
  if (!id) return fail("배너를 찾을 수 없습니다.");

  const normalized = normalize(raw);
  if (!normalized.ok) return fail(normalized.error);

  try {
    await prisma.siteBanner.update({ where: { id }, data: normalized.data });
    revalidatePath("/admin/banners");
    return { success: true, id };
  } catch {
    return fail("배너 수정에 실패했습니다.");
  }
}
