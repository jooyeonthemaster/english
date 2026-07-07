// ============================================================================
// /coupon/register — QR 딥링크 공개 랜딩(shim).
// 콜백 허용목록이 /director·/teacher 뿐이라, 실제 등록 UI(/director/coupons/register)
// 로 t 파라미터를 실어 보낸다. 미로그인이면 로그인 후 그 URL로 복귀시킨다.
// ============================================================================

import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CouponRegisterLanding({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const t = typeof sp.t === "string" ? sp.t : "";
  const target = `/director/coupons/register${t ? `?t=${encodeURIComponent(t)}` : ""}`;

  const staff = await getStaffSession();
  if (!staff) {
    redirect(`/login?callbackUrl=${encodeURIComponent(target)}`);
  }
  redirect(target);
}
