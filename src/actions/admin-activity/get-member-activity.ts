"use server";

// ============================================================================
// 회원(=학원) 활동 타임라인 — 관리자 회원 상세 페이지용.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import {
  fetchActivityUnion,
  type ActivityCategory,
  type ActivityItem,
} from "./_sources";

export interface MemberActivityFilters {
  category?: ActivityCategory | "all";
  /** ISO timestamp — 이 시각 이전 항목을 요청 */
  before?: string | null;
  limit?: number;
}

export type MemberActivityResult =
  | { kind: "ok"; items: ActivityItem[]; nextBefore: string | null }
  | { kind: "not_found" };

export async function getMemberActivity(
  memberId: string,
  filters: MemberActivityFilters = {},
): Promise<MemberActivityResult> {
  const session = await requireAdminAuth();
  const elevated = isSuperAdmin(session);

  const staff = await prisma.staff.findUnique({
    where: { id: memberId },
    select: { academyId: true },
  });
  if (!staff) return { kind: "not_found" };

  const limit = Math.min(Math.max(filters.limit ?? 40, 1), 100);
  const before = filters.before ? new Date(filters.before) : undefined;

  const { items, nextBefore } = await fetchActivityUnion({
    academyId: staff.academyId,
    before:
      before && !Number.isNaN(before.getTime()) ? before : undefined,
    limit,
    category: filters.category ?? "all",
  });

  return {
    kind: "ok",
    // SUPPORT 등급은 운영 메타데이터(파일명·잡 설정 등) 비공개
    items: elevated ? items : items.map((i) => ({ ...i, metadata: null })),
    nextBefore,
  };
}
