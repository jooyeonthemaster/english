"use client";

// 번들 섹션 — 카드 목록 + 활성 토글 + 링크 복사. 카드 본문 클릭=편집 팝업, 호버=상세.

import { useState, useTransition } from "react";
import { Boxes, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  toggleBundleActive,
  type AdminBundleView,
} from "@/actions/admin/credit-promotion-bundles";
import { AdminEmptyState, SectionCard, StatusBadge } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/admin/credit-promotion-editor";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { cn } from "@/lib/utils";
import { CopyLinkButton } from "./copy-link-button";
import { bundleCardDetail } from "./promotion-hover-detail";
import { bundleStatus } from "./promotion-labels";

export function BundlesSection({
  bundles,
  origin,
  onOpenEditor,
  onBundlesChange,
}: {
  bundles: AdminBundleView[];
  origin: string;
  onOpenEditor: (bundle: AdminBundleView | null) => void;
  onBundlesChange: (bundles: AdminBundleView[]) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggleActive(bundle: AdminBundleView, next: boolean) {
    if (pendingId) return;
    setPendingId(bundle.id);
    startTransition(async () => {
      const res = await toggleBundleActive(bundle.id, next);
      if (res.success && res.bundles) onBundlesChange(res.bundles);
      else toast.error(res.error ?? "상태 변경에 실패했습니다.");
      setPendingId(null);
    });
  }

  return (
    <SectionCard
      title="프로모션 번들"
      description={
        <>
          여러 프로모션을 <b className="text-gray-600">한 링크·한 페이지</b>로 묶어
          노출합니다. 방문자가 &ldquo;혜택 받기&rdquo;를 누르면 번들에 담긴 모든
          프로모션이 함께 적용됩니다.
        </>
      }
      padded={bundles.length > 0}
    >
      {bundles.length === 0 ? (
        <AdminEmptyState
          icon={Boxes}
          title="만들어진 번들이 없습니다."
          description="프로모션을 묶어 첫 번들을 만들어보세요."
          action={
            <Button type="button" size="sm" onClick={() => onOpenEditor(null)}>
              <Plus className="size-4" strokeWidth={2} />
              번들 만들기
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {bundles.map((bundle) => {
            const runningCount = bundle.items.filter((i) => i.isInWindow).length;
            const bundleUrl = `${origin}/credits/promo/b/${bundle.slug}`;
            return (
              <div
                key={bundle.id}
                className={cn(
                  "rounded-xl border p-4 transition",
                  bundle.isActive && runningCount > 0
                    ? "border-emerald-200 bg-emerald-50/30"
                    : "border-gray-200 bg-gray-50/40",
                  !bundle.isActive && "opacity-70",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <AdminHoverDetail
                    title={bundle.name}
                    detail={bundleCardDetail(bundle)}
                    click="none"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onOpenEditor(bundle)}
                      className="h-auto min-w-0 flex-1 justify-start rounded-lg p-0 text-left font-normal whitespace-normal hover:bg-transparent"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[15px] font-bold text-gray-900">
                            {bundle.name}
                          </span>
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-500">
                            /b/{bundle.slug}
                          </span>
                          <StatusBadge status={bundleStatus(bundle, runningCount)} />
                        </div>
                        {bundle.description && (
                          <p className="mt-1 line-clamp-1 text-[12px] text-gray-500">
                            {bundle.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {bundle.items.map((item) => (
                            <span
                              key={item.promotionId}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                item.isInWindow
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-gray-100 text-gray-400",
                              )}
                            >
                              {item.productName}
                              <span className="text-[11px] opacity-70">
                                {item.promotionName?.trim() || "이름 없음"}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </Button>
                  </AdminHoverDetail>

                  <div
                    className="flex shrink-0 items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <CopyLinkButton url={bundleUrl} label="링크 복사" />
                    <ToggleSwitch
                      checked={bundle.isActive}
                      disabled={pendingId === bundle.id}
                      text="활성"
                      label={`${bundle.name} 활성`}
                      onChange={(next) => toggleActive(bundle, next)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onOpenEditor(bundle)}
                      aria-label="번들 편집"
                      className="text-gray-400 hover:text-gray-700"
                    >
                      <Pencil className="size-4" strokeWidth={2} />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
