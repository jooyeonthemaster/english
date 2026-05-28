import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffAuth } from "@/lib/auth";
import { PortOneTopUpError } from "@/lib/portone-credit-topups";
import {
  PortOneSubscriptionError,
  registerSubscriptionBillingKey,
} from "@/lib/portone-subscriptions";

const registerSchema = z.object({
  billingKey: z.string().min(10),
  issueId: z.string().min(4).optional(),
  chargeNow: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const body = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "빌링키 발급 결과가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const result = await registerSubscriptionBillingKey({
      academyId: staff.academyId,
      staffId: staff.id,
      billingKey: parsed.data.billingKey,
      issueId: parsed.data.issueId,
      chargeNow: parsed.data.chargeNow ?? true,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PortOneSubscriptionError) {
      return NextResponse.json(
        { error: getSubscriptionErrorMessage(err), code: err.code },
        { status: getSubscriptionErrorStatus(err) },
      );
    }
    if (err instanceof PortOneTopUpError && err.code === "CONFIG_MISSING") {
      return NextResponse.json(
        {
          error:
            "포트원 정기결제 설정이 아직 연결되지 않았습니다. V2 API Secret, Store ID, Channel Key를 설정해주세요.",
          code: err.code,
        },
        { status: 503 },
      );
    }
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json(
        { error: "정기결제 설정 권한이 없습니다." },
        { status: 403 },
      );
    }

    console.error("[subscriptions/portone/register] failed", err);
    return NextResponse.json(
      { error: "정기결제 등록 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

function getSubscriptionErrorStatus(err: PortOneSubscriptionError) {
  if (err.code === "SUBSCRIPTION_NOT_FOUND") return 404;
  if (err.code === "PLAN_NOT_PAYABLE") return 409;
  if (err.code === "BILLING_KEY_MISMATCH") return 403;
  if (err.code === "PORTONE_REQUEST_FAILED") return 502;
  if (err.code === "CONFIG_MISSING") return 503;
  return 400;
}

function getSubscriptionErrorMessage(err: PortOneSubscriptionError) {
  if (err.code === "SUBSCRIPTION_NOT_FOUND") {
    return "활성 구독이 없습니다. 관리자에게 요금제 설정을 요청해주세요.";
  }
  if (err.code === "PLAN_NOT_PAYABLE") {
    return "이 요금제는 카드 정기결제를 사용할 수 없습니다.";
  }
  if (err.code === "BILLING_KEY_MISMATCH") {
    return "포트원 빌링키 정보가 현재 학원 구독과 일치하지 않습니다.";
  }
  if (err.code === "PORTONE_REQUEST_FAILED") {
    return `포트원 정기결제 요청이 실패했습니다. ${err.message}`;
  }
  return err.message;
}
