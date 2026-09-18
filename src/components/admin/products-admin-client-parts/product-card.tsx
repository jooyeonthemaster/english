"use client";

import Link from "next/link";
import { ChevronDown, Coins, Loader2, Save, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/admin/kit";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { AdminField } from "@/components/admin/credit-promotion-editor";
import { activeFlag } from "@/lib/admin-labels";
import type { AdminCreditProductView, AdminPromotionView } from "@/lib/credit-top-up-products";
import { cn } from "@/lib/utils";
import { productCardDetail } from "./product-hover-detail";

// 충전 상품 카드 — 헤더(호버 상세 · 클릭으로 펼침) + 펼친 본문(기본 설정 폼 / 프로모션 요약).

// 상품 기본 정보 폼(프로모션은 /admin/promotions 프로모션 관리에서 CRUD).
export type ProductFormState = {
  name: string;
  basePrice: string;
  expiryDays: string;
  description: string;
  isActive: boolean;
  sortOrder: string;
};

export function productToForm(product: AdminCreditProductView): ProductFormState {
  return {
    name: product.name,
    basePrice: String(product.basePrice),
    expiryDays: product.expiryDays != null ? String(product.expiryDays) : "",
    description: product.description ?? "",
    isActive: product.isActive,
    sortOrder: String(product.sortOrder),
  };
}

export function ProductCard({
  product,
  form,
  expanded,
  saving,
  onToggle,
  onFieldChange,
  onSave,
}: {
  product: AdminCreditProductView;
  form: ProductFormState;
  expanded: boolean;
  saving: boolean;
  onToggle: () => void;
  onFieldChange: <K extends keyof ProductFormState>(field: K, value: ProductFormState[K]) => void;
  onSave: () => void;
}) {
  return (
    <div
      className={cn(
        "self-start rounded-xl border bg-gray-50 transition-colors",
        expanded ? "border-blue-200" : "border-gray-200",
      )}
    >
      {/* 헤더 — 어디를 눌러도 펼침/접힘. 버튼 모양이 아닌 공개 컨트롤이라 ui Button 을 쓰지 않는다. */}
      <div className="flex items-start justify-between gap-3 p-4">
        <AdminHoverDetail title={product.name} detail={productCardDetail(product)} click="none">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="flex flex-1 items-start gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
          >
            <ChevronDown
              className={cn(
                "mt-1 size-4 shrink-0 text-gray-400 transition-transform",
                expanded && "rotate-180",
              )}
              strokeWidth={2}
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold text-gray-900">{product.name}</span>
                <span className="text-[12px] font-medium tabular-nums text-gray-400">
                  {product.creditAmount.toLocaleString("ko-KR")}C
                </span>
                <StatusBadge status={activeFlag(product.isActive, ["노출 중", "비활성"])} />
                {product.isPromotionActive && product.discountRate > 0 && (
                  <StatusBadge status={{ label: `${product.discountRate}% 할인 중`, tone: "blue" }} />
                )}
                {product.isPromotionActive && product.bonusRate > 0 && (
                  <StatusBadge
                    status={{ label: `크레딧 +${product.bonusRate}% 중`, tone: "emerald" }}
                  />
                )}
              </div>
              <p className="mt-1 text-[12px] tabular-nums text-gray-500">
                현재 결제금액 {product.price.toLocaleString("ko-KR")}원 ·{" "}
                {product.bonusCredits > 0 ? (
                  <>
                    지급{" "}
                    <span className="font-semibold text-emerald-600">
                      {product.grantedCreditAmount.toLocaleString("ko-KR")}C
                    </span>{" "}
                    (+{product.bonusCredits.toLocaleString("ko-KR")}C) ·{" "}
                  </>
                ) : null}
                자동출제 약 {product.estimatedAutoQuestionCount.toLocaleString("ko-KR")}문항 · 문항당{" "}
                {product.perAutoQuestion.toLocaleString("ko-KR")}원
              </p>
            </div>
          </button>
        </AdminHoverDetail>

        {expanded && (
          <div className="flex shrink-0 items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500">
              노출
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => onFieldChange("isActive", v)}
                aria-label="결제 화면 노출"
              />
            </label>
            <Button type="button" size="sm" onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" strokeWidth={2} />
              )}
              저장
            </Button>
          </div>
        )}
      </div>

      {/* 펼친 본문 — 좌: 기본 설정 / 우: 프로모션 (넓은 화면 2단) */}
      {expanded && (
        <div className="grid gap-5 border-t border-gray-200/70 px-4 pb-4 pt-4 lg:grid-cols-2 lg:items-start">
          <section className="space-y-3">
            <ProductSectionLabel icon={Coins} title="기본 설정" />
            <div className="grid gap-3 md:grid-cols-2">
              <AdminField label="상품명">
                <Input
                  value={form.name}
                  onChange={(event) => onFieldChange("name", event.target.value)}
                  className="bg-white text-[13px]"
                />
              </AdminField>
              <AdminField label="정가">
                <Input
                  type="number"
                  min={100}
                  step={1000}
                  value={form.basePrice}
                  onChange={(event) => onFieldChange("basePrice", event.target.value)}
                  className="bg-white text-[13px] tabular-nums"
                />
              </AdminField>
              <AdminField label="크레딧 소멸기한 (일)">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0 = 무기한"
                  value={form.expiryDays}
                  onChange={(event) => onFieldChange("expiryDays", event.target.value)}
                  className="bg-white text-[13px] tabular-nums"
                />
                <p className="mt-1 text-[11px] leading-4 text-gray-400">
                  결제일 기준 유효일수. 구매 시 잔여 소멸기한에 더해 갱신됩니다. 비우거나 0이면
                  무기한.
                </p>
              </AdminField>
              <AdminField label="정렬">
                <Input
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(event) => onFieldChange("sortOrder", event.target.value)}
                  className="bg-white text-[13px] tabular-nums"
                />
              </AdminField>
            </div>
            <AdminField label="상품 설명">
              <Textarea
                value={form.description}
                onChange={(event) => onFieldChange("description", event.target.value)}
                className="bg-white text-[13px]"
              />
            </AdminField>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ProductSectionLabel icon={Tag} title="프로모션" />
              {product.promotions.length > 0 && (
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-gray-500">
                  {product.promotions.length}
                </span>
              )}
            </div>
            <ProductPromotionSummary promotions={product.promotions} />
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * 상품 블록 내 프로모션 요약 — CRUD는 /admin/promotions(프로모션 관리)로 이동했고,
 * 여기서는 적용 중 개수와 관리 탭으로 가는 링크만 노출한다.
 */
function ProductPromotionSummary({ promotions }: { promotions: AdminPromotionView[] }) {
  const running = promotions.filter((p) => p.isInWindow).length;
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-[13px] font-semibold text-gray-800">
        적용 중 프로모션 {running.toLocaleString("ko-KR")}개
        <span className="ml-1.5 text-[11px] font-medium text-gray-400">
          · 등록 {promotions.length.toLocaleString("ko-KR")}개
        </span>
      </p>
      <p className="text-[11px] leading-4 text-gray-400">
        프로모션의 생성·편집·링크 발급은 프로모션 관리에서 합니다.
      </p>
      <Button asChild variant="outline" size="sm" className="text-blue-700 hover:text-blue-800">
        <Link href="/admin/promotions">
          <Tag className="size-4" strokeWidth={2} />
          프로모션 관리에서 편집
        </Link>
      </Button>
    </div>
  );
}

function ProductSectionLabel({ icon: Icon, title }: { icon: typeof Coins; title: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3.5 text-gray-400" strokeWidth={2} />
      <span className="text-[12px] font-bold uppercase tracking-wide text-gray-500">{title}</span>
    </div>
  );
}
