import { NextResponse } from "next/server";
import { requireStaffAuth } from "@/lib/auth";
import { getCreditTopUpProducts } from "@/lib/credit-top-up-products";
import { isCardTopUpAllowed } from "@/lib/card-topup-access";

export async function GET() {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const products = await getCreditTopUpProducts();
    const cardEnabled = isCardTopUpAllowed({
      academyId: staff.academyId,
      email: staff.email,
    });
    return NextResponse.json({ products, cardEnabled });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json(
        { error: "크레딧 상품 조회 권한이 없습니다." },
        { status: 403 },
      );
    }

    console.error("[credits/top-up-products] Error:", err);
    return NextResponse.json(
      { error: "크레딧 상품 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
