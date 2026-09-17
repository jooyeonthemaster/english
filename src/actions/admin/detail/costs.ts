"use server";

import { requireAdminAuth } from "@/lib/auth-admin";
import type { AdminDetail } from "@/lib/admin-detail-types";
import {
  costsBlockDetail,
  type CostsBlockKey,
  type CostsBlockParams,
} from "@/lib/admin-block-detail/costs";

/** 원가 분석 지표 카드 상세(호버·클릭 시 지연 조회). */
export async function getCostsBlockDetail(
  key: CostsBlockKey,
  params: CostsBlockParams,
): Promise<AdminDetail> {
  await requireAdminAuth();
  return costsBlockDetail(key, params);
}
