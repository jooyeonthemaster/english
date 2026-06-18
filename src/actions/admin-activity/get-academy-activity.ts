"use server";

// ============================================================================
// 학원(=Academy) 활동 타임라인 — 관리자 학원 상세 페이지용.
// 회원 상세(getMemberActivity)와 동일하나 academyId로 직접 조회한다.
// 생성한 시험지·지문·추출(업로드 PDF/캡처)·AI 생성 등이 한 화면에 모이고,
// 각 행의 '자료 보기'에서 원문/이미지/시험지 다운로드까지 가능하다.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import {
  fetchActivityUnion,
  type ActivityFilter,
  type ActivityItem,
} from "./_sources";

export interface AcademyActivityFilters {
  category?: ActivityFilter;
  /** ISO timestamp — 이 시각 이전 항목을 요청 */
  before?: string | null;
  limit?: number;
}

export type AcademyActivityResult =
  | { kind: "ok"; items: ActivityItem[]; nextBefore: string | null }
  | { kind: "not_found" };

export async function getAcademyActivity(
  academyId: string,
  filters: AcademyActivityFilters = {},
): Promise<AcademyActivityResult> {
  const session = await requireAdminAuth();
  const elevated = isSuperAdmin(session);

  const id = academyId?.trim();
  if (!id) return { kind: "not_found" };

  const academy = await prisma.academy.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!academy) return { kind: "not_found" };

  const limit = Math.min(Math.max(filters.limit ?? 40, 1), 100);
  const before = filters.before ? new Date(filters.before) : undefined;

  const { items, nextBefore } = await fetchActivityUnion({
    academyId: academy.id,
    before: before && !Number.isNaN(before.getTime()) ? before : undefined,
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
