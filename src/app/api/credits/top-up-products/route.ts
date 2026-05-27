import { NextResponse } from "next/server";
import { requireStaffAuth } from "@/lib/auth";
import { getCreditTopUpProducts } from "@/lib/credit-top-up-products";

export async function GET() {
  try {
    await requireStaffAuth("DIRECTOR");
    const products = await getCreditTopUpProducts();
    return NextResponse.json({ products });
  } catch (err) {
    console.error("[credits/top-up-products] Error:", err);
    return NextResponse.json(
      { error: "크레딧 상품 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
