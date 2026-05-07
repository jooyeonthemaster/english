import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { refundCredits } from "@/lib/credits";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }

  let body: { transactionId?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const transactionId = typeof body.transactionId === "string" ? body.transactionId : null;
  if (!transactionId) {
    return NextResponse.json({ error: "transactionId 필요" }, { status: 400 });
  }

  try {
    await refundCredits(
      staff.academyId,
      "WEBTOON_IMAGE",
      transactionId,
      typeof body.reason === "string" ? body.reason : "Webtoon image generation failed",
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "환불 실패";
    console.warn("[/api/ai/webtoon/refund]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
