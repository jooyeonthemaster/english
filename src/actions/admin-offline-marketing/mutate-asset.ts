"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { deleteOfflineMarketingPdf } from "@/lib/offline-marketing/storage";
import { fail, type ActionResult } from "./_shared";

const PATH = "/admin/offline-marketing";

/** 파일 삭제 — 레코드 + 저장물. */
export async function deleteOfflineMarketingAsset(id: string): Promise<ActionResult> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");
  try {
    const row = await prisma.offlineMarketingAsset.findUnique({
      where: { id },
      select: { storagePath: true },
    });
    await prisma.offlineMarketingAsset.delete({ where: { id } });
    if (row?.storagePath) await deleteOfflineMarketingPdf(row.storagePath);
    revalidatePath(PATH);
    return { success: true };
  } catch {
    return fail("삭제에 실패했습니다.");
  }
}

/** 홍보 내 파일 순서 재정렬. */
export async function reorderOfflineMarketingAssets(
  campaignId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");
  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.offlineMarketingAsset.update({
          where: { id, campaignId },
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
