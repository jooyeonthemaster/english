"use server";

import { requireAdminAuth } from "@/lib/auth-admin";
import type { AdminDetail } from "@/lib/admin-detail-types";
import { helpPostHoverDetail } from "@/lib/admin-block-detail/help-posts";

/** 헬프센터 게시판 목록 행 호버 상세(본문 미리보기 등 지연 조회). 읽기 전용. */
export async function getHelpPostHoverDetail(postId: string): Promise<AdminDetail> {
  await requireAdminAuth();
  return helpPostHoverDetail(postId);
}
