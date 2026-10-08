"use server";

// 무료 적중 예측 신청 파기 — 신청서·올린 파일 전부를 지우는 관리자 동작. 동의문의 「접수 6개월 뒤 모두 지웁니다」는
// 크론(api/cron/free-forecast-purge)이 매일 집행하고, 이것은 크론이 멈췄을 때·신청자가 삭제를 요청했을 때 쓰는 손 버튼이다.

import { revalidatePath } from "next/cache";
import { requireAdminAuth } from "@/lib/auth-admin";
import { purgeFfRequest } from "@/lib/free-forecast/storage";

export async function purgeFfRequestAction(requestId: string): Promise<{ ok: boolean; removed?: number; error?: string }> {
  await requireAdminAuth();
  try {
    const removed = await purgeFfRequest(requestId);
    revalidatePath("/admin/free-forecast");
    return { ok: true, removed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "파기 실패" };
  }
}
