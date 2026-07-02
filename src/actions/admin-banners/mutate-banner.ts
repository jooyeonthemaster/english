"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { fail, type ActionResult } from "./_shared";

async function requireSuper() {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) return null;
  return session;
}

export async function toggleBannerActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const session = await requireSuper();
  if (!session) return fail("권한이 없습니다.");
  try {
    await prisma.siteBanner.update({ where: { id }, data: { isActive } });
    revalidatePath("/admin/banners");
    return { success: true };
  } catch {
    return fail("상태 변경에 실패했습니다.");
  }
}

export async function deleteBanner(id: string): Promise<ActionResult> {
  const session = await requireSuper();
  if (!session) return fail("권한이 없습니다.");
  try {
    await prisma.siteBanner.delete({ where: { id } });
    revalidatePath("/admin/banners");
    return { success: true };
  } catch {
    return fail("삭제에 실패했습니다.");
  }
}

/**
 * Persist a new priority ordering. `orderedIds` is the full list in the desired
 * order; each banner's priority is set to its index (lower = shown first).
 */
export async function reorderBanners(orderedIds: string[]): Promise<ActionResult> {
  const session = await requireSuper();
  if (!session) return fail("권한이 없습니다.");
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return fail("정렬할 배너가 없습니다.");
  }
  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.siteBanner.update({ where: { id }, data: { priority: index } }),
      ),
    );
    revalidatePath("/admin/banners");
    return { success: true };
  } catch {
    return fail("순서 저장에 실패했습니다.");
  }
}
