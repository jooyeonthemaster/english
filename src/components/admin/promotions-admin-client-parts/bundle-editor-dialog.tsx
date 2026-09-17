"use client";

// 번들 편집 팝업 — 이름/slug/설명/활성 + 포함 프로모션 다중 선택(순서 지정).
// 부모가 열릴 때만 마운트한다(폼 상태 초기화). 저장·삭제 액션은 기존 것 재사용.

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Link2, Loader2, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createBundle,
  updateBundle,
  deleteBundle,
  type AdminBundleView,
} from "@/actions/admin/credit-promotion-bundles";
import type { AdminCreditProductView } from "@/lib/credit-top-up-products";
import { AdminDialog, StatusBadge, useConfirm } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminField, ToggleSwitch } from "@/components/admin/credit-promotion-editor";
import { bonusLabel, discountLabel } from "./promotion-labels";

type PromoInfo = {
  productName: string;
  promotionName: string | null;
  discountType: string;
  discountValue: number;
  bonusType: string;
  bonusValue: number;
  isInWindow: boolean;
};

export function BundleEditorDialog({
  bundle,
  products,
  origin,
  onSaved,
  onClose,
}: {
  bundle: AdminBundleView | null;
  products: AdminCreditProductView[];
  origin: string;
  onSaved: (bundles: AdminBundleView[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(bundle?.name ?? "");
  const [slug, setSlug] = useState(bundle?.slug ?? "");
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [isActive, setIsActive] = useState(bundle?.isActive ?? true);
  const [promotionIds, setPromotionIds] = useState<string[]>(
    bundle ? bundle.items.map((i) => i.promotionId) : [],
  );
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  // promotionId → 표시 정보(현재 products 상태 우선, 없으면 번들 스냅샷 폴백).
  const promoInfo = useMemo(() => {
    const map = new Map<string, PromoInfo>();
    for (const item of bundle?.items ?? []) map.set(item.promotionId, item);
    for (const product of products) {
      for (const promo of product.promotions) {
        map.set(promo.id, {
          productName: product.name,
          promotionName: promo.name,
          discountType: promo.discountType,
          discountValue: promo.discountValue,
          bonusType: promo.bonusType,
          bonusValue: promo.bonusValue,
          isInWindow: promo.isInWindow,
        });
      }
    }
    return map;
  }, [products, bundle]);

  const available = useMemo(() => {
    const selected = new Set(promotionIds);
    return products.flatMap((product) =>
      product.promotions
        .filter((promo) => !selected.has(promo.id))
        .map((promo) => ({ product, promo })),
    );
  }, [products, promotionIds]);

  function move(index: number, delta: -1 | 1) {
    setPromotionIds((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save() {
    if (pending) return;
    startTransition(async () => {
      const payload = {
        name,
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        isActive,
        promotionIds,
      };
      const res = bundle
        ? await updateBundle(bundle.id, payload)
        : await createBundle(payload);
      if (!res.success || !res.bundles) {
        toast.error(res.error ?? "번들을 저장하지 못했습니다.");
        return;
      }
      toast.success(bundle ? "번들을 저장했습니다." : "번들을 만들었습니다.");
      onSaved(res.bundles);
    });
  }

  async function remove() {
    if (!bundle || pending) return;
    const ok = await confirm({
      title: "번들을 삭제할까요?",
      description: "번들 링크가 즉시 닫힙니다. 포함된 프로모션 자체는 삭제되지 않습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteBundle(bundle.id);
      if (res.success && res.bundles) {
        toast.success("번들을 삭제했습니다.");
        onSaved(res.bundles);
      } else toast.error(res.error ?? "번들을 삭제하지 못했습니다.");
    });
  }

  const bundleUrl = `${origin}/credits/promo/b/${slug.trim() || bundle?.slug || "..."}`;

  return (
    <AdminDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={bundle ? "번들 편집" : "번들 만들기"}
      description="포함 프로모션의 순서가 랜딩 노출 순서입니다."
      size="md"
      footer={
        <>
          {bundle && (
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
              <ShieldCheck className="size-3.5" strokeWidth={2.2} />
            )}
            {bundle ? "저장" : "번들 만들기"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <AdminField label="번들 이름">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 신학기 패키지"
              className="text-[13px]"
            />
          </AdminField>
          <AdminField label="링크 주소 (slug)">
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="비우면 이름으로 자동 생성"
              className="font-mono text-[13px]"
            />
            <p className="mt-1 text-[11px] leading-4 text-gray-400">
              영문 소문자·숫자·하이픈. 링크: /credits/promo/b/{"{slug}"}
            </p>
          </AdminField>
        </div>

        <AdminField label="설명 (선택)">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="랜딩 페이지 상단에 함께 노출됩니다."
            className="min-h-14 text-[13px]"
          />
        </AdminField>

        {/* 포함 프로모션 — 순서 = 랜딩 노출 순서 */}
        <div className="space-y-1.5">
          <span className="text-[12px] font-semibold text-gray-500">
            포함 프로모션 ({promotionIds.length}개) — 순서대로 랜딩에 노출
          </span>
          {promotionIds.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 px-3 py-5 text-center text-[12px] text-gray-400">
              아래 목록에서 프로모션을 추가하세요.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {promotionIds.map((id, index) => {
                const info = promoInfo.get(id);
                return (
                  <li
                    key={id}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <span className="w-5 shrink-0 text-center text-[11px] font-bold tabular-nums text-gray-400">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold text-gray-800">
                        {info?.productName ?? "삭제된 프로모션"}
                        <span className="ml-1.5 font-medium text-gray-400">
                          {info?.promotionName?.trim() || "이름 없음"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-2 text-[11px]">
                        {info && discountLabel(info) && (
                          <span className="font-semibold text-rose-600">{discountLabel(info)}</span>
                        )}
                        {info && bonusLabel(info) && (
                          <span className="font-semibold text-emerald-600">{bonusLabel(info)}</span>
                        )}
                        {info && !info.isInWindow && (
                          <span className="text-gray-400">지금은 기간 외 — 랜딩에 노출되지 않음</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label="위로"
                        className="text-gray-400 hover:text-gray-700"
                      >
                        <ChevronUp className="size-4" strokeWidth={2.2} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => move(index, 1)}
                        disabled={index === promotionIds.length - 1}
                        aria-label="아래로"
                        className="text-gray-400 hover:text-gray-700"
                      >
                        <ChevronDown className="size-4" strokeWidth={2.2} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setPromotionIds((prev) => prev.filter((x) => x !== id))}
                        aria-label="빼기"
                        className="text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <X className="size-4" strokeWidth={2.2} />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {available.length > 0 && (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/60 p-2">
              {available.map(({ product, promo }) => (
                <Button
                  key={promo.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPromotionIds((prev) => [...prev, promo.id])}
                  className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-left font-normal whitespace-normal hover:bg-white"
                >
                  <Plus className="size-3.5 shrink-0 text-blue-500" strokeWidth={2.4} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-gray-700">
                    <b>{product.name}</b>
                    <span className="ml-1.5 text-gray-500">
                      {promo.name?.trim() || "이름 없음"}
                    </span>
                    <span className="ml-1.5 text-[11px] text-gray-400">
                      {[discountLabel(promo), bonusLabel(promo)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {promo.isInWindow && (
                    <StatusBadge status={{ label: "진행 중", tone: "emerald" }} />
                  )}
                  {!promo.linkToken && (
                    <StatusBadge status={{ label: "저장 시 링크 자동 발급", tone: "blue" }} />
                  )}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 truncate font-mono text-[11px] text-gray-500">
            <Link2 className="size-3.5 shrink-0" strokeWidth={2} />
            {bundleUrl}
          </span>
          <ToggleSwitch checked={isActive} onChange={setIsActive} text="활성" label="번들 활성" />
        </div>
      </div>
    </AdminDialog>
  );
}
