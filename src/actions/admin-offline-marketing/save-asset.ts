"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import {
  createOfflineMarketingUploadTarget,
  deleteOfflineMarketingPdf,
  offlineMarketingPublicUrl,
} from "@/lib/offline-marketing/storage";
import {
  assetEditSchema,
  assetInputSchema,
  fail,
  type ActionResult,
} from "./_shared";

const PATH = "/admin/offline-marketing";

function slugifyFileName(name: string): string {
  const base = name.replace(/\.pdf$/i, "").slice(0, 40);
  const safe = base
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return safe || "file";
}

/** 브라우저 직접 업로드용 서명 URL 발급. */
export async function createOfflineMarketingUpload(
  fileName: string,
): Promise<ActionResult<{ uploadUrl: string; token: string; storagePath: string }>> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");

  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${stamp}-${rand}-${slugifyFileName(fileName)}.pdf`;

  try {
    const target = await createOfflineMarketingUploadTarget(path);
    return { success: true, ...target };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "업로드 준비에 실패했습니다.");
  }
}

/** 업로드 완료 후 파일 메타데이터를 홍보에 등록. */
export async function createOfflineMarketingAsset(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");

  const parsed = assetInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const v = parsed.data;

  // 대상 홍보 존재 확인.
  const campaign = await prisma.offlineMarketingCampaign.findUnique({
    where: { id: v.campaignId },
    select: { id: true },
  });
  if (!campaign) {
    await deleteOfflineMarketingPdf(v.storagePath);
    return fail("홍보를 찾을 수 없습니다.");
  }

  try {
    // 파일은 홍보 내 맨 뒤로.
    const last = await prisma.offlineMarketingAsset.findFirst({
      where: { campaignId: v.campaignId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const created = await prisma.offlineMarketingAsset.create({
      data: {
        campaignId: v.campaignId,
        title: v.title,
        description: v.description ?? null,
        fileUrl: offlineMarketingPublicUrl(v.storagePath),
        storagePath: v.storagePath,
        fileName: v.fileName,
        fileSize: v.fileSize,
        pageCount: v.pageCount ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        createdByAdminId: session.adminId,
      },
      select: { id: true },
    });
    revalidatePath(PATH);
    return { success: true, id: created.id };
  } catch {
    await deleteOfflineMarketingPdf(v.storagePath);
    return fail("파일 저장에 실패했습니다.");
  }
}

/** 파일 메타(이름·설명)만 수정. */
export async function updateOfflineMarketingAsset(
  id: string,
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return fail("권한이 없습니다.");
  if (!id) return fail("파일을 찾을 수 없습니다.");

  const parsed = assetEditSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const v = parsed.data;

  try {
    await prisma.offlineMarketingAsset.update({
      where: { id },
      data: { title: v.title, description: v.description ?? null },
    });
    revalidatePath(PATH);
    return { success: true, id };
  } catch {
    return fail("파일 수정에 실패했습니다.");
  }
}
