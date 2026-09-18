import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/auth-admin";
import { getAdminCreditTopUpDetail } from "@/lib/admin-credit-topups";
import {
  manualCompleteTopUp,
  ManualCompleteError,
} from "@/lib/manual-topup-complete";

interface RouteContext {
  params: Promise<{ topUpId: string }>;
}

const bodySchema = z.object({
  /** 실제 입금 시각(ISO). 매출이 집계될 날짜를 결정한다. */
  paidAt: z.string().datetime().optional(),
  note: z.string().trim().max(300).optional(),
  creditTransactionId: z.string().trim().min(1).optional(),
  linkNotificationId: z.string().trim().min(1).optional(),
  confirmDuplicate: z.boolean().optional(),
});

const STATUS_BY_CODE: Record<ManualCompleteError["code"], number> = {
  NOT_FOUND: 404,
  INVALID_STATUS: 409,
  ALREADY_CREDITED: 409,
  DUPLICATE_RISK: 409,
  INVALID_TRANSACTION: 400,
  INVALID_NOTIFICATION: 400,
};

export async function POST(request: NextRequest, ctx: RouteContext) {
  let admin: Awaited<ReturnType<typeof requireAdminAuth>>;
  try {
    admin = await requireAdminAuth("SUPER_ADMIN");
  } catch {
    return NextResponse.json(
      { error: "수동 충전 완료 처리는 슈퍼관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }

  const { topUpId } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력값을 확인해주세요." },
      { status: 400 },
    );
  }

  try {
    const result = await manualCompleteTopUp({
      topUpId,
      adminId: admin.adminId,
      ...parsed.data,
    });
    const topUp = await getAdminCreditTopUpDetail(topUpId);
    return NextResponse.json({ result, topUp });
  } catch (err) {
    if (err instanceof ManualCompleteError) {
      return NextResponse.json(
        { error: err.message, code: err.code, detail: err.detail ?? null },
        { status: STATUS_BY_CODE[err.code] },
      );
    }
    console.error("[admin/credits/top-ups/manual-complete] failed", err);
    return NextResponse.json(
      { error: "수동 완료 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
