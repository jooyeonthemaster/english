"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { deleteOfflineMarketingPdf } from "@/lib/offline-marketing/storage";
import { campaignInputSchema, fail, type ActionResult } from "./_shared";
import { trackOfflineMarketingCategory } from "./categories";

const PATH = "/admin/offline-marketing";

/** 홍보(캠페인) 생성 — 파일은 이후 개별 업로드로 추가. */
export async function createOfflineMarketingCampaign(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");

  const parsed = campaignInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const v = parsed.data;

  try {
    const top = await prisma.offlineMarketingCampaign.findFirst({
      orderBy: { sortOrder: "asc" },
      select: { sortOrder: true },
    });
    const created = await prisma.offlineMarketingCampaign.create({
      data: {
        title: v.title,
        description: v.description ?? null,
        category: v.category,
        sortOrder: (top?.sortOrder ?? 0) - 1,
        isActive: v.isActive,
        createdByAdminId: session.adminId,
      },
      select: { id: true },
    });
    await trackOfflineMarketingCategory(v.category);
    revalidatePath(PATH);
    return { success: true, id: created.id };
  } catch {
    return fail("홍보 생성에 실패했습니다.");
  }
}

/** 홍보 메타(이름·분류·설명·활성) 수정. */
export async function updateOfflineMarketingCampaign(
  id: string,
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");
  if (!id) return fail("홍보를 찾을 수 없습니다.");

  const parsed = campaignInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const v = parsed.data;

  try {
    await prisma.offlineMarketingCampaign.update({
      where: { id },
      data: {
        title: v.title,
        description: v.description ?? null,
        category: v.category,
        isActive: v.isActive,
      },
    });
    await trackOfflineMarketingCategory(v.category);
    revalidatePath(PATH);
    return { success: true, id };
  } catch {
    return fail("홍보 수정에 실패했습니다.");
  }
}

/** 활성/비활성 토글. */
export async function toggleOfflineMarketingCampaignActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");
  try {
    await prisma.offlineMarketingCampaign.update({ where: { id }, data: { isActive } });
    revalidatePath(PATH);
    return { success: true };
  } catch {
    return fail("상태 변경에 실패했습니다.");
  }
}

/** 홍보 삭제 — 소속 파일과 저장물까지 함께 제거. */
export async function deleteOfflineMarketingCampaign(id: string): Promise<ActionResult> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");
  try {
    const assets = await prisma.offlineMarketingAsset.findMany({
      where: { campaignId: id },
      select: { storagePath: true },
    });
    // FK onDelete: Cascade 로 파일 레코드는 자동 삭제되지만, 스토리지 파일은 수동 제거.
    await prisma.offlineMarketingCampaign.delete({ where: { id } });
    await Promise.all(assets.map((a) => deleteOfflineMarketingPdf(a.storagePath)));
    revalidatePath(PATH);
    return { success: true };
  } catch {
    return fail("삭제에 실패했습니다.");
  }
}

/** 드래그 정렬 — 전달된 id 순서대로 sortOrder 재부여. */
export async function reorderOfflineMarketingCampaigns(
  orderedIds: string[],
): Promise<ActionResult> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");
  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.offlineMarketingCampaign.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    revalidatePath(PATH);
    return { success: true };
  } catch {
    return fail("정렬 저장에 실패했습니다.");
  }
}
