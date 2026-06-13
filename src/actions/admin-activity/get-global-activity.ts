"use server";

// ============================================================================
// 전역 활동 피드 — /admin/activity 모니터링 페이지용.
// 전 학원의 활동을 시간 역순으로 합쳐 보여준다. 학원명 검색 + 분류 필터.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  isSuperAdmin,
  MAX_SEARCH_LENGTH,
} from "@/actions/admin-members/_shared";
import {
  fetchActivityUnion,
  type ActivityCategory,
  type ActivityItem,
} from "./_sources";

export interface GlobalActivityFilters {
  category?: ActivityCategory | "all";
  /** 학원명 부분일치 검색 */
  academyQuery?: string;
  /** ISO timestamp — 이 시각 이전 항목을 요청 */
  before?: string | null;
  limit?: number;
}

export type GlobalActivityResult =
  | { kind: "ok"; items: ActivityItem[]; nextBefore: string | null }
  | { kind: "no_match" };

export async function getGlobalActivity(
  filters: GlobalActivityFilters = {},
): Promise<GlobalActivityResult> {
  const session = await requireAdminAuth();
  const elevated = isSuperAdmin(session);

  let academyIds: string[] | undefined;
  const query = filters.academyQuery?.trim().slice(0, MAX_SEARCH_LENGTH);
  if (query) {
    const academies = await prisma.academy.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      select: { id: true },
      take: 50,
    });
    if (academies.length === 0) return { kind: "no_match" };
    academyIds = academies.map((a) => a.id);
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const before = filters.before ? new Date(filters.before) : undefined;

  const { items, nextBefore } = await fetchActivityUnion({
    academyIds,
    before:
      before && !Number.isNaN(before.getTime()) ? before : undefined,
    limit,
    category: filters.category ?? "all",
  });

  return {
    kind: "ok",
    items: elevated ? items : items.map((i) => ({ ...i, metadata: null })),
    nextBefore,
  };
}
