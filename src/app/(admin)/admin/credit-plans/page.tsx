import { requireAdminAuth } from "@/lib/auth-admin";
import {
  getAdminCreditTopUps,
  getAdminCreditTopUpStats,
  getAdminCreditTopUpTotalCount,
} from "@/lib/admin-credit-topups";
import { getPlans } from "@/actions/admin";
import { prisma } from "@/lib/prisma";
import { autoReconcileStalePendingTopUps } from "@/lib/stale-topup-reconcile";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  CreditPlansAdminClient,
  type CreditPlansTabKey,
} from "@/components/admin/credit-plans-admin-client";

type PageProps = {
  searchParams: Promise<{ tab?: string; status?: string; view?: string }>;
};

const TAB_KEYS: readonly CreditPlansTabKey[] = ["credits", "deposits", "plans"];

// kit 의 resolveTab 과 같은 규칙. 그 함수는 "use client" 모듈에 있어 서버 페이지에서 호출할 수 없다.
function resolveInitialTab(raw: string | undefined, keys: readonly CreditPlansTabKey[]) {
  return raw && (keys as readonly string[]).includes(raw) ? (raw as CreditPlansTabKey) : "credits";
}

export default async function AdminCreditPlansPage({ searchParams }: PageProps) {
  await requireAdminAuth();

  // Subscription billing is disabled — skip the plan catalog fetch entirely.
  const showPlans = FEATURE_FLAGS.SHOW_SUBSCRIPTION_BILLING;

  // 방치된 결제 대기를 포트원 조회로 먼저 정리한 뒤 목록을 읽는다(1분 1회·최대 20건).
  await autoReconcileStalePendingTopUps();

  // 결제 관리 = 충전 내역·통계만. 상품/프로모션은 상품 관리(/admin/products)로 분리됨.
  const [topUps, stats, topUpsTotal, plans, depositActionCount] = await Promise.all([
    getAdminCreditTopUps(50),
    getAdminCreditTopUpStats(),
    getAdminCreditTopUpTotalCount(),
    showPlans ? getPlans({ includeInactive: true }) : Promise.resolve([]),
    // 입금 확인 탭 배지 — /api/admin/credits/bank-deposits 의 "ACTION" 필터와 같은 기준.
    prisma.bankDepositNotification.count({
      where: { status: { in: ["UNMATCHED", "AMBIGUOUS", "FAILED"] } },
    }),
  ]);

  const serializedPlans = plans.map((plan) => ({
    ...plan,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  }));

  const { tab, status, view } = await searchParams;
  const initialTab = resolveInitialTab(
    tab,
    TAB_KEYS.filter((key) => showPlans || key !== "plans"),
  );

  return (
    <CreditPlansAdminClient
      creditData={{
        initialTopUps: topUps,
        initialStats: stats,
        initialTopUpsTotal: topUpsTotal,
      }}
      plansData={{ initialPlans: serializedPlans }}
      depositsData={{
        initialStatus: status,
        focusPending: view === "pending",
        initialActionCount: depositActionCount,
      }}
      initialTab={initialTab}
    />
  );
}
