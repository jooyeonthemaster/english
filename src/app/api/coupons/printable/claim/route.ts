import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import {
  claimPrintableCoupon,
  claimFailMessage,
  consumeRateLimit,
} from "@/lib/printable-coupon-claim";

export const runtime = "nodejs";

// 코드 추측 방지: IP·학원당 fixed-window rate-limit.
const IP_LIMIT = { windowMs: 60_000, max: 10 }; // 분당 10회/IP
const ACADEMY_LIMIT = { windowMs: 60_000, max: 15 }; // 분당 15회/학원

export async function POST(request: NextRequest) {
  try {
    const staff = await getStaffSession();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // 등록 주체: DIRECTOR (원장) 만 (§15 기본값).
    if (staff.role !== "DIRECTOR") {
      return NextResponse.json(
        { ok: false, error: "쿠폰 등록은 원장 계정만 가능합니다." },
        { status: 403 },
      );
    }

    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || request.headers.get("x-real-ip") || "unknown";

    const [ipLimited, academyLimited] = await Promise.all([
      consumeRateLimit("ip", ip, IP_LIMIT),
      consumeRateLimit("academy", staff.academyId, ACADEMY_LIMIT),
    ]);
    if (ipLimited || academyLimited) {
      return NextResponse.json(
        { ok: false, error: claimFailMessage("rate_limited"), reason: "rate_limited" },
        { status: 429 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { token?: unknown; code?: unknown }
      | null;
    const token = typeof body?.token === "string" ? body.token : null;
    const code = typeof body?.code === "string" ? body.code : null;
    if (!token && !code) {
      return NextResponse.json(
        { ok: false, error: "쿠폰 코드를 입력해주세요.", reason: "not_found" },
        { status: 400 },
      );
    }

    const result = await claimPrintableCoupon({
      token,
      code,
      academyId: staff.academyId,
      staffId: staff.id,
    });

    if (!result.ok) {
      // 사유별 상태코드: 선점/한도/만료 등은 409, 없음은 404.
      const status =
        result.reason === "not_found"
          ? 404
          : result.reason === "already_taken"
            ? 409
            : 400;
      return NextResponse.json(
        { ok: false, error: claimFailMessage(result.reason), reason: result.reason },
        { status },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[coupons/printable/claim] Error:", error);
    return NextResponse.json(
      { ok: false, error: "등록 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
