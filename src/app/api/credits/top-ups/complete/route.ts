import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffAuth } from "@/lib/auth";
import {
  completePortOneCreditTopUp,
  PortOneTopUpError,
} from "@/lib/portone-credit-topups";

const completeSchema = z.object({
  paymentId: z.string().min(10),
});

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaffAuth();
    const body = await request.json().catch(() => null);
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "결제 식별값이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const result = await completePortOneCreditTopUp({
      paymentId: parsed.data.paymentId,
      source: "client",
      expectedAcademyId: staff.academyId,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PortOneTopUpError) {
      const status =
        err.code === "FORBIDDEN"
          ? 403
          : err.code === "TOP_UP_NOT_FOUND"
            ? 404
            : err.code === "PAYMENT_NOT_PAID"
              ? 409
              : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json(
        { error: "크레딧 충전 권한이 없습니다." },
        { status: 403 },
      );
    }

    console.error("[credits/top-ups/complete] failed", err);
    return NextResponse.json(
      { error: "결제 검증 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
