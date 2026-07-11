"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import type { OfflineMarketingCampaignDto } from "./_shared";

/** 홍보(캠페인) 전체 목록 + 각 홍보의 파일들(정렬순). */
export async function getOfflineMarketingCampaigns(): Promise<
  OfflineMarketingCampaignDto[]
> {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) return [];

  const rows = await prisma.offlineMarketingCampaign.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      assets: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return rows.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    assets: c.assets.map((a) => ({
      id: a.id,
      campaignId: a.campaignId,
      title: a.title,
      description: a.description,
      fileUrl: a.fileUrl,
      fileName: a.fileName,
      fileSize: a.fileSize,
      pageCount: a.pageCount,
      sortOrder: a.sortOrder,
      createdAt: a.createdAt.toISOString(),
    })),
  }));
}
