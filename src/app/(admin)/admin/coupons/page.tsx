import { requireAdminAuth } from "@/lib/auth-admin";
import { listPrintableCouponBatches } from "@/actions/admin/printable-coupons";
import { PrintableCouponsAdminClient } from "@/components/admin/printable-coupons-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  await requireAdminAuth();

  const initial = await listPrintableCouponBatches({ page: 1, pageSize: 20 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">실물 쿠폰</h1>
        <p className="mt-1 text-[13px] text-gray-400">
          8자리 코드 + QR이 박힌 실물 쿠폰을 배치로 발급·인쇄합니다. 원장이 QR·코드로
          등록하면 크레딧이 즉시 지급되거나(교환권), 다음 충전 결제 때 할인됩니다.
          QR 원본 토큰은 저장하지 않으므로 발급 직후 인쇄하세요.
        </p>
      </div>

      <PrintableCouponsAdminClient initial={initial} />
    </div>
  );
}
