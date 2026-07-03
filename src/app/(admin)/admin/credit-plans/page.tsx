import { requireAdminAuth } from "@/lib/auth-admin";
import {
  getAdminCreditTopUps,
  getAdminCreditTopUpStats,
  getAdminCreditTopUpTotalCount,
} from "@/lib/admin-credit-topups";
import { getCreditTopUpProducts } from "@/lib/credit-top-up-products";
import { getPlans } from "@/actions/admin";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { CreditPlansAdminClient } from "@/components/admin/credit-plans-admin-client";

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function AdminCreditPlansPage({ searchParams }: PageProps) {
  await requireAdminAuth();

  // Subscription billing is disabled — skip the plan catalog fetch entirely.
  const showPlans = FEATURE_FLAGS.SHOW_SUBSCRIPTION_BILLING;

  const [topUps, stats, topUpsTotal, products, plans] = await Promise.all([
    getAdminCreditTopUps(50),
    getAdminCreditTopUpStats(),
    getAdminCreditTopUpTotalCount(),
    getCreditTopUpProducts({ includeInactive: true }),
    showPlans ? getPlans({ includeInactive: true }) : Promise.resolve([]),
  ]);

  const serializedPlans = plans.map((plan) => ({
    ...plan,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  }));

  const { tab } = await searchParams;
  const initialTab = showPlans && tab === "plans" ? "plans" : "credits";

  return (
    <CreditPlansAdminClient
      creditData={{
        initialTopUps: topUps,
        initialStats: stats,
        initialProducts: products,
        initialTopUpsTotal: topUpsTotal,
      }}
      plansData={{ initialPlans: serializedPlans }}
      initialTab={initialTab}
    />
  );
}
