import { requireAdminAuth } from "@/lib/auth-admin";
import {
  getAdminCreditTopUps,
  getAdminCreditTopUpStats,
} from "@/lib/admin-credit-topups";
import { getCreditTopUpProducts } from "@/lib/credit-top-up-products";
import { CreditTopUpsAdminClient } from "@/components/admin/credit-topups-admin-client";

export default async function AdminCreditsPage() {
  await requireAdminAuth();
  const [topUps, stats, products] = await Promise.all([
    getAdminCreditTopUps(50),
    getAdminCreditTopUpStats(),
    getCreditTopUpProducts({ includeInactive: true }),
  ]);

  return (
    <CreditTopUpsAdminClient
      initialTopUps={topUps}
      initialStats={stats}
      initialProducts={products}
    />
  );
}
