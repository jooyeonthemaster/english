"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Coins } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AdminEmptyState, PageHeader, SectionCard } from "@/components/admin/kit";
import {
  updateCreditTopUpProduct,
  type CreditProductUpdateData,
} from "@/actions/admin/credit-products";
import type { AdminCreditProductView } from "@/lib/credit-top-up-products";
import { cn } from "@/lib/utils";
import {
  ProductCard,
  productToForm,
  type ProductFormState,
} from "./products-admin-client-parts/product-card";

// 상품 관리(/admin/products) — 충전 상품 설정만. 프로모션 CRUD 는 프로모션 관리.
// 결제 관리(credit-topups-admin-client)에서 mode="products" 로 같이 살던 UI 를 분리한 것.

export function ProductsAdminClient({ initialProducts }: { initialProducts: AdminCreditProductView[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [productForms, setProductForms] = useState<Record<string, ProductFormState>>(() =>
    Object.fromEntries(initialProducts.map((product) => [product.id, productToForm(product)])),
  );
  // Product cards are collapsed by default; admins expand the ones they edit.
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(() => new Set());
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggleProduct = (id: string) =>
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allExpanded = products.length > 0 && products.every((p) => expandedProducts.has(p.id));
  const toggleAllProducts = () =>
    setExpandedProducts(allExpanded ? new Set() : new Set(products.map((p) => p.id)));

  function updateProductField<K extends keyof ProductFormState>(
    productId: string,
    field: K,
    value: ProductFormState[K],
  ) {
    setProductForms((current) => ({
      ...current,
      [productId]: { ...current[productId], [field]: value },
    }));
  }

  function saveProduct(product: AdminCreditProductView) {
    const form = productForms[product.id];
    if (!form) return;

    const payload: CreditProductUpdateData = {
      name: form.name,
      basePrice: Number(form.basePrice || 0),
      expiryDays: Number(form.expiryDays || 0),
      description: form.description,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder || 0),
    };

    setSavingProductId(product.id);
    startTransition(async () => {
      const result = await updateCreditTopUpProduct(product.id, payload);

      if (!result.success || !result.product) {
        toast.error(result.error ?? "크레딧 상품을 저장하지 못했습니다.");
        setSavingProductId(null);
        return;
      }

      const saved = result.product;
      setProducts((current) =>
        current
          .map((item) => (item.id === product.id ? saved : item))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      );
      setProductForms((current) => ({ ...current, [product.id]: productToForm(saved) }));
      toast.success("크레딧 상품 설정을 저장했습니다. 결제 화면과 상품 정보에 즉시 반영됩니다.");
      setSavingProductId(null);
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="상품 관리"
        description="충전 상품을 설정합니다. 정가·크레딧 지급은 고객 결제 화면과 상품 정보에 즉시 반영되며, 프로모션은 프로모션 관리에서 편집합니다."
        actions={
          products.length > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={toggleAllProducts}>
              <ChevronDown
                className={cn("size-4 transition-transform", allExpanded && "rotate-180")}
                strokeWidth={2}
              />
              {allExpanded ? "모두 접기" : "모두 펼치기"}
            </Button>
          ) : undefined
        }
      />

      <SectionCard
        title="충전 상품 설정"
        icon={Coins}
        description="정가와 프로모션 할인율은 고객 결제 화면, 상품 정보, 포트원 결제 사전등록 금액에 같은 값으로 반영됩니다."
      >
        {products.length === 0 ? (
          <AdminEmptyState icon={Coins} title="등록된 충전 상품이 없습니다" />
        ) : (
          <div className="grid gap-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                form={productForms[product.id] ?? productToForm(product)}
                expanded={expandedProducts.has(product.id)}
                saving={savingProductId === product.id}
                onToggle={() => toggleProduct(product.id)}
                onFieldChange={(field, value) => updateProductField(product.id, field, value)}
                onSave={() => saveProduct(product)}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
