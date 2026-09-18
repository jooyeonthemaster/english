import type { FeatureMarginAnalysis } from "@/actions/admin/feature-margin";
import type { FreeCreditBep } from "@/actions/admin/free-credit-bep";
import { FeatureMarginView } from "@/components/admin/feature-margin-view";
import { FreeCreditBepCard } from "@/components/admin/free-credit-bep-card";

/** 기능별 마진 — 무료 크레딧 BEP 카드 + 기능별 원가·판매가·마진 표 */
export function MarginView({
  margin,
  bep,
}: {
  margin: FeatureMarginAnalysis;
  bep: FreeCreditBep;
}) {
  return (
    <>
      <FreeCreditBepCard data={bep} />
      <FeatureMarginView data={margin} />
    </>
  );
}
