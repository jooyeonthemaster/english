// ============================================================================
// /admin/coupons/print — 실물 쿠폰 인쇄 (사이드바 없는 단독 화면).
// 발급 직후 관리자 클라이언트가 localStorage에 실어 넘긴 카드(serial+qrImageUrl)를
// 렌더한다. QR 원본 토큰은 저장하지 않으므로 재조회는 불가(발급 즉시 인쇄).
// ============================================================================

import { notFound } from "next/navigation";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { CouponPrintView } from "@/components/admin/coupon-print-view";

export const dynamic = "force-dynamic";

export default async function CouponPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminAuth().catch(() => null);
  if (!session || !isSuperAdmin(session)) notFound();

  const sp = await searchParams;
  const batchId = typeof sp.batchId === "string" ? sp.batchId : "";
  if (!batchId) notFound();

  return <CouponPrintView batchId={batchId} />;
}
