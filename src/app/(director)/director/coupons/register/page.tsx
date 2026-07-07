// ============================================================================
// /director/coupons/register — 원장 쿠폰 등록 화면.
// QR(?t=) 또는 8자리 코드 입력으로 등록. CREDIT_GRANT는 즉시 지급, DISCOUNT는 보유.
// (director) 레이아웃이 DIRECTOR 세션을 이미 보장한다.
// ============================================================================

import { CouponRegisterClient } from "./_components/coupon-register-client";

export const dynamic = "force-dynamic";

export default async function DirectorCouponRegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6">
        <h1 className="text-[20px] font-bold text-slate-900">쿠폰 등록</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          받으신 실물 쿠폰의 QR을 스캔했거나 8자리 코드를 입력해 등록하세요. 크레딧
          지급형은 즉시 적립되고, 할인형은 다음 크레딧 충전 때 자동으로 적용됩니다.
        </p>
      </div>
      <CouponRegisterClient initialToken={token} />
    </div>
  );
}
