"use client";

// ============================================================================
// 프로모션 편집 팝업 — /admin/promotions(프로모션 관리)에서 신규·기존 프로모션을
// AdminDialog 안에서 편집한다. 저장/삭제/링크 액션은 기존 것 재사용(로직 무변경).
// 상품 관리(credit-topups-admin-client)가 쓰는 폼 유틸(AdminField/ToggleSwitch/
// formatDate 등)은 -parts/form-utils 에 있고 여기서 그대로 re-export 한다.
// ============================================================================

import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { Check, Loader2, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  upsertCreditPromotion,
  deleteCreditPromotion,
} from "@/actions/admin/credit-products";
import type {
  AdminCreditProductView,
  AdminPromotionView,
} from "@/lib/credit-top-up-products";
import { AdminDialog, StatusBadge, useConfirm } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminField,
  ToggleSwitch,
  UnitToggle,
  fromDatetimeLocal,
  nowDatetimeLocal,
  toDatetimeLocal,
  type PromoAcademy,
} from "./credit-promotion-editor-parts/form-utils";
import { PromotionLinkField } from "./credit-promotion-editor-parts/promotion-link-field";
import {
  PromotionAudienceField,
  type PromotionAudience,
} from "./credit-promotion-editor-parts/promotion-audience-field";

export {
  AdminField,
  ToggleSwitch,
  formatDate,
  fromDatetimeLocal,
  toDatetimeLocal,
  type PromoAcademy,
} from "./credit-promotion-editor-parts/form-utils";

/**
 * 개별 프로모션 편집 팝업(신규/기존 공용). 부모가 열릴 때만 마운트한다(폼 상태 초기화).
 * productPicker = 신규 추가 시 본문 맨 위에 두는 "적용 상품" 선택.
 */
export function PromotionEditorDialog({
  title,
  description,
  productPicker,
  productId,
  creditAmount,
  basePrice,
  promotion,
  academies,
  onProductChange,
  onClose,
}: {
  title: ReactNode;
  description?: ReactNode;
  productPicker?: ReactNode;
  productId: string;
  creditAmount: number;
  basePrice: number;
  promotion: AdminPromotionView | null;
  academies: PromoAcademy[];
  onProductChange: (updated: AdminCreditProductView) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(promotion?.name ?? "");
  const [discountType, setDiscountType] = useState<"PERCENT" | "AMOUNT">(
    promotion?.discountType === "AMOUNT" ? "AMOUNT" : "PERCENT",
  );
  const [discountValue, setDiscountValue] = useState(
    String(promotion?.discountValue ?? 0),
  );
  const [bonusType, setBonusType] = useState<"PERCENT" | "AMOUNT">(
    promotion?.bonusType === "AMOUNT" ? "AMOUNT" : "PERCENT",
  );
  const [bonusValue, setBonusValue] = useState(
    String(promotion?.bonusValue ?? 0),
  );
  const [startsAt, setStartsAt] = useState(
    promotion ? toDatetimeLocal(promotion.startsAt) : nowDatetimeLocal(0),
  );
  const [endsAt, setEndsAt] = useState(
    promotion ? toDatetimeLocal(promotion.endsAt) : nowDatetimeLocal(7),
  );
  const [audience, setAudience] = useState<PromotionAudience>(
    promotion?.audience === "TARGETED" ? "TARGETED" : "ALL",
  );
  const [priority, setPriority] = useState(String(promotion?.priority ?? 0));
  const [isActive, setIsActive] = useState(promotion?.isActive ?? true);
  const [targetAcademyIds, setTargetAcademyIds] = useState<string[]>(
    promotion?.targetAcademyIds ?? [],
  );
  const [linkToken, setLinkToken] = useState<string | null>(
    promotion?.linkToken ?? null,
  );

  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const promotionId = promotion?.id ?? null;
  const nameById = useMemo(
    () => new Map(academies.map((a) => [a.academyId, a.name])),
    [academies],
  );
  const dV = Number(discountValue || 0);
  const bV = Number(bonusValue || 0);
  const pricePreview =
    dV <= 0
      ? null
      : discountType === "AMOUNT"
        ? Math.max(0, basePrice - dV)
        : dV >= 100
          ? 0
          : Math.round((basePrice * (100 - dV)) / 100);
  const grantedPreview =
    bV <= 0
      ? creditAmount
      : bonusType === "AMOUNT"
        ? creditAmount + bV
        : Math.round((creditAmount * (100 + bV)) / 100);

  function save() {
    if (pending) return;
    startTransition(async () => {
      const res = await upsertCreditPromotion({
        productId,
        id: promotionId ?? undefined,
        name,
        discountType,
        discountValue: Number(discountValue || 0),
        bonusType,
        bonusValue: Number(bonusValue || 0),
        // 벽시계 → 절대 시각(UTC ISO). 서버 타임존에 의존하지 않도록 클라이언트에서 변환.
        startsAt: fromDatetimeLocal(startsAt),
        endsAt: fromDatetimeLocal(endsAt),
        audience,
        priority: Number(priority || 0),
        isActive,
        targetAcademyIds,
      });
      if (!res.success || !res.product) {
        toast.error(res.error ?? "저장에 실패했습니다.");
        return;
      }
      toast.success("프로모션을 저장했습니다.");
      onProductChange(res.product);
    });
  }
  async function remove() {
    if (!promotionId || pending) return;
    const ok = await confirm({
      title: "프로모션을 삭제할까요?",
      description: "삭제하면 이 프로모션의 링크·혜택이 즉시 사라집니다. 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteCreditPromotion(promotionId);
      if (res.success && res.product) {
        toast.success("프로모션을 삭제했습니다.");
        onProductChange(res.product);
      } else toast.error(res.error ?? "삭제에 실패했습니다.");
    });
  }

  return (
    <AdminDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={description}
      size="lg"
      footer={
        <>
          {promotionId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={pending}
              className="mr-auto text-gray-400 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="size-3.5" strokeWidth={2} />
              삭제
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <Check className="size-3.5" strokeWidth={2.4} />
            )}
            {promotionId ? "저장" : "프로모션 저장"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {productPicker}

        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-700">
            <Tag className="size-3.5 text-gray-400" strokeWidth={2} />
            {name.trim() || (promotion ? "이름 없는 프로모션" : "새 프로모션")}
            {promotion?.isInWindow && (
              <StatusBadge status={{ label: "진행 중", tone: "emerald" }} />
            )}
          </span>
          <ToggleSwitch
            checked={isActive}
            onChange={setIsActive}
            text="활성"
            label="프로모션 활성"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_120px]">
          <AdminField label="프로모션 이름">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 신학기 할인"
              className="text-[13px]"
            />
          </AdminField>
          <AdminField label="우선순위">
            <Input
              type="number"
              min={0}
              max={999}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="text-[13px]"
            />
          </AdminField>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <AdminField
            label={discountType === "AMOUNT" ? "할인 금액 (결제금액 ↓)" : "할인율 (결제금액 ↓)"}
          >
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Input
                  type="number"
                  min={0}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder="0"
                  className="pr-8 text-[13px]"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-medium text-gray-400">
                  {discountType === "AMOUNT" ? "원" : "%"}
                </span>
              </div>
              <UnitToggle value={discountType} onChange={setDiscountType} />
            </div>
            {pricePreview !== null && (
              <p className="mt-1 text-[11px] font-medium text-rose-600">
                {basePrice.toLocaleString("ko-KR")}원 →{" "}
                <span className="font-bold">
                  {pricePreview.toLocaleString("ko-KR")}원
                </span>{" "}
                (−{(basePrice - pricePreview).toLocaleString("ko-KR")}원)
              </p>
            )}
          </AdminField>
          <AdminField
            label={bonusType === "AMOUNT" ? "추가 지급 크레딧 (크레딧 ↑)" : "크레딧 추가 지급률 (크레딧 ↑)"}
          >
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Input
                  type="number"
                  min={0}
                  value={bonusValue}
                  onChange={(e) => setBonusValue(e.target.value)}
                  placeholder="0"
                  className="pr-8 text-[13px]"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-medium text-gray-400">
                  {bonusType === "AMOUNT" ? "C" : "%"}
                </span>
              </div>
              <UnitToggle value={bonusType} onChange={setBonusType} />
            </div>
            {bV > 0 && (
              <p className="mt-1 text-[11px] font-medium text-emerald-600">
                {creditAmount.toLocaleString("ko-KR")}C →{" "}
                <span className="font-bold">
                  {grantedPreview.toLocaleString("ko-KR")}C
                </span>{" "}
                (+{(grantedPreview - creditAmount).toLocaleString("ko-KR")}C)
              </p>
            )}
          </AdminField>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <AdminField label="시작일">
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="text-[13px]"
            />
          </AdminField>
          <AdminField label="종료일">
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="text-[13px]"
            />
          </AdminField>
        </div>

        <PromotionAudienceField
          audience={audience}
          onAudienceChange={setAudience}
          targetAcademyIds={targetAcademyIds}
          onTargetsChange={setTargetAcademyIds}
          nameById={nameById}
        />

        <PromotionLinkField
          promotionId={promotionId}
          linkToken={linkToken}
          onLinkTokenChange={setLinkToken}
          origin={origin}
        />
      </div>
    </AdminDialog>
  );
}
