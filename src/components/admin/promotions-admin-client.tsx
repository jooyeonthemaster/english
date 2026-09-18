"use client";

// ============================================================================
// 프로모션 관리(/admin/promotions) — 전 상품의 프로모션을 한 리스트로 관리하고,
// 여러 프로모션을 한 링크·한 랜딩으로 묶는 "번들"을 관리한다.
//   · 프로모션 편집 팝업은 credit-promotion-editor 재사용, CRUD 액션도 기존 것 — 로직 무변경.
//   · 탭(프로모션/번들/모니터링)은 ?tab= 에 보존(useUrlTab), 서버 페이지가 초기값을 넘긴다.
//   · 표·번들·편집 팝업은 promotions-admin-client-parts/ 로 분리.
// ============================================================================

import { useEffect, useMemo, useState, useTransition } from "react";
import { BarChart3, Boxes, Plus, Tag } from "lucide-react";
import { getBundles, type AdminBundleView } from "@/actions/admin/credit-promotion-bundles";
import type { AdminCreditProductView } from "@/lib/credit-top-up-products";
import {
  AdminField,
  PromotionEditorDialog,
  type PromoAcademy,
} from "@/components/admin/credit-promotion-editor";
import { AdminTabs, PageHeader, useUrlTab, type AdminTab } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PromoMonitoringPanel } from "@/components/admin/promo-monitoring-panel";
import type { PromoMonitoringPayload } from "@/actions/admin/credit-promotion-monitoring";
import { BundleEditorDialog } from "./promotions-admin-client-parts/bundle-editor-dialog";
import { BundlesSection } from "./promotions-admin-client-parts/bundles-section";
import {
  PromotionsTable,
  type PromotionRow,
} from "./promotions-admin-client-parts/promotions-table";
import {
  DEFAULT_PROMOTION_TAB,
  type PromotionTabKey,
} from "./promotions-admin-client-parts/tabs";

interface Props {
  initialProducts: AdminCreditProductView[];
  academies: PromoAcademy[];
  initialBundles: AdminBundleView[];
  initialMonitoring: PromoMonitoringPayload;
  /** 서버 페이지가 ?tab= 을 해석해 넘긴 초기 탭 */
  initialTab?: PromotionTabKey;
}

export function PromotionsAdminClient({
  initialProducts,
  academies,
  initialBundles,
  initialMonitoring,
  initialTab = DEFAULT_PROMOTION_TAB,
}: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [bundles, setBundles] = useState(initialBundles);
  const [tab, setTab] = useUrlTab<PromotionTabKey>("tab", initialTab, {
    defaultKey: DEFAULT_PROMOTION_TAB,
  });
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // 프로모션 편집(기존) / 추가(신규, 상품 선택 포함) 팝업.
  const [editing, setEditing] = useState<PromotionRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [createProductId, setCreateProductId] = useState(
    initialProducts[0]?.id ?? "",
  );

  // 번들 편집 팝업: undefined=닫힘, null=신규, AdminBundleView=기존 편집.
  const [editingBundle, setEditingBundle] = useState<
    AdminBundleView | null | undefined
  >(undefined);

  const [, startBundlesRefresh] = useTransition();

  // 호버 상세에서 지정 학원 ID → 이름 표시용.
  const academyNameById = useMemo(
    () => new Map(academies.map((a) => [a.academyId, a.name])),
    [academies],
  );

  const rows = useMemo<PromotionRow[]>(
    () =>
      products.flatMap((product) =>
        product.promotions.map((promo) => ({ product, promo })),
      ),
    [products],
  );

  // 프로모션 변경 후 서버가 돌려준 최신 상품으로 교체 + 번들 요약도 갱신
  // (번들 카드가 프로모션 이름/혜택을 비정규화해 보여주므로).
  function replaceProduct(updated: AdminCreditProductView) {
    setProducts((current) =>
      current
        .map((item) => (item.id === updated.id ? updated : item))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    );
    startBundlesRefresh(async () => {
      try {
        setBundles(await getBundles());
      } catch {
        /* 요약 갱신 실패는 치명적이지 않음 — 새로고침 시 복구 */
      }
    });
  }

  const createProduct =
    products.find((p) => p.id === createProductId) ?? products[0] ?? null;

  const tabs: AdminTab<PromotionTabKey>[] = [
    { key: "promotions", label: "프로모션", icon: Tag, count: rows.length },
    { key: "bundles", label: "번들", icon: Boxes, count: bundles.length },
    { key: "monitoring", label: "모니터링", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="프로모션 관리"
        description="충전 상품에 걸리는 프로모션(할인·크레딧 보너스·링크)과 여러 프로모션을 한 링크로 묶는 번들을 관리합니다. 변경은 고객 결제 화면에 즉시 반영됩니다."
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setEditingBundle(null)}>
              <Boxes className="size-4" strokeWidth={2} />
              번들 만들기
            </Button>
            <Button type="button" onClick={() => setCreating(true)} disabled={!createProduct}>
              <Plus className="size-4" strokeWidth={2} />
              프로모션 추가
            </Button>
          </>
        }
      />

      <AdminTabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="프로모션 관리 탭" />

      {tab === "promotions" && (
        <PromotionsTable
          rows={rows}
          origin={origin}
          academyNameById={academyNameById}
          onEdit={setEditing}
          onCreate={() => setCreating(true)}
          onProductChange={replaceProduct}
        />
      )}

      {tab === "bundles" && (
        <BundlesSection
          bundles={bundles}
          origin={origin}
          onOpenEditor={(bundle) => setEditingBundle(bundle)}
          onBundlesChange={setBundles}
        />
      )}

      {tab === "monitoring" && <PromoMonitoringPanel initial={initialMonitoring} />}

      {/* 프로모션 편집 팝업(기존 편집기 재사용) */}
      {editing && (
        <PromotionEditorDialog
          key={editing.promo.id}
          title="프로모션 편집"
          description={editing.product.name}
          productId={editing.product.id}
          creditAmount={editing.product.creditAmount}
          basePrice={editing.product.basePrice}
          promotion={editing.promo}
          academies={academies}
          onProductChange={(u) => {
            replaceProduct(u);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {/* 프로모션 추가 팝업 — 어느 상품에 붙일지 선택 후 같은 편집기 사용 */}
      {creating && createProduct && (
        <PromotionEditorDialog
          title="프로모션 추가"
          description="적용할 충전 상품을 고르고 혜택·기간을 입력합니다."
          productPicker={
            <AdminField label="적용 상품">
              <Select value={createProduct.id} onValueChange={setCreateProductId}>
                <SelectTrigger className="w-full text-[13px]" aria-label="적용 상품">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[13px]">
                      {p.name} · {p.creditAmount.toLocaleString("ko-KR")}C ·{" "}
                      {p.basePrice.toLocaleString("ko-KR")}원
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminField>
          }
          productId={createProduct.id}
          creditAmount={createProduct.creditAmount}
          basePrice={createProduct.basePrice}
          promotion={null}
          academies={academies}
          onProductChange={(u) => {
            replaceProduct(u);
            setCreating(false);
          }}
          onClose={() => setCreating(false)}
        />
      )}

      {/* 번들 생성/편집 팝업 */}
      {editingBundle !== undefined && (
        <BundleEditorDialog
          key={editingBundle?.id ?? "new"}
          bundle={editingBundle}
          products={products}
          origin={origin}
          onSaved={(next) => {
            setBundles(next);
            setEditingBundle(undefined);
          }}
          onClose={() => setEditingBundle(undefined)}
        />
      )}
    </div>
  );
}
