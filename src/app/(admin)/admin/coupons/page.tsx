import { requireAdminAuth } from "@/lib/auth-admin";
import { listPrintableCouponBatches } from "@/actions/admin/printable-coupons";
import { PrintableCouponsAdminClient } from "@/components/admin/printable-coupons-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  await requireAdminAuth();

  const initial = await listPrintableCouponBatches({ page: 1, pageSize: 20 });

  // 제목·설명·"쿠폰 발급" 버튼은 클라이언트의 PageHeader 가 그린다(팝업 상태와 함께).
  return <PrintableCouponsAdminClient initial={initial} />;
}
