import { NextResponse } from "next/server";
import { requireStaffAuth } from "@/lib/auth";
import { PortOneTopUpError } from "@/lib/portone-credit-topups";
import {
  cancelSubscriptionAutoRenew,
  PortOneSubscriptionError,
} from "@/lib/portone-subscriptions";

export async function POST() {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const result = await cancelSubscriptionAutoRenew({
      academyId: staff.academyId,
      staffId: staff.id,
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

    console.error("[subscriptions/portone/cancel] failed", err);
    return NextResponse.json(
      { error: "정기결제 해지 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

function getSubscriptionErrorStatus(err: PortOneSubscriptionError) {
  if (err.code === "SUBSCRIPTION_NOT_FOUND") return 404;
  if (err.code === "PORTONE_REQUEST_FAILED") return 502;
  if (err.code === "CONFIG_MISSING") return 503;
  return 400;
}

function getSubscriptionErrorMessage(err: PortOneSubscriptionError) {
  if (err.code === "SUBSCRIPTION_NOT_FOUND") {
    return "자동갱신 중인 구독이 없습니다.";
  }
  return err.message;
}
