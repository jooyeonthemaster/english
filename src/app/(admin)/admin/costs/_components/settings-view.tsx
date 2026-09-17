import type { OperationsCostDashboard } from "@/actions/admin/operations-cost-types";
import { BillingReconciliationCard } from "./billing-reconciliation-card";
import { PricingSnapshotCard } from "./pricing-snapshot-card";

/** 정산·단가 — 청구 정산 카드 + 단가 스냅샷 카드 */
export function SettingsView({
  dashboard,
  reconciliationPeriodStartValue,
  reconciliationPeriodEndValue,
  pricingEffectiveFromValue,
}: {
  dashboard: OperationsCostDashboard;
  reconciliationPeriodStartValue: string;
  reconciliationPeriodEndValue: string;
  pricingEffectiveFromValue: string;
}) {
  return (
    <>
      <BillingReconciliationCard
        dashboard={dashboard}
        periodStartValue={reconciliationPeriodStartValue}
        periodEndValue={reconciliationPeriodEndValue}
      />
      <PricingSnapshotCard dashboard={dashboard} effectiveFromValue={pricingEffectiveFromValue} />
    </>
  );
}
