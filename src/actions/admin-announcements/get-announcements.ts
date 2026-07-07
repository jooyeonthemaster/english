"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { serializeAnnouncement, type AdminAnnouncementDto } from "./dto";

/** 어드민 목록 — 모든 상태(초안/발행/보관)를 최신순으로. 필터·검색은 클라이언트에서. */
export async function getAnnouncements(): Promise<AdminAnnouncementDto[]> {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) return [];

  const rows = await prisma.platformAnnouncement.findMany({
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(serializeAnnouncement);
}
