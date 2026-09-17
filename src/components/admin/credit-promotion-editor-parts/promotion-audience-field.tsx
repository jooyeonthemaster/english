"use client";

// 프로모션 노출 대상 — 전체 공개 / 지정 학원·링크 선택 + 지정 학원 picker.

import { useState } from "react";
import { Users, X } from "lucide-react";
import { BannerTargetPicker } from "@/components/admin/banners/banner-target-picker";
import { FilterChipGroup } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";

export type PromotionAudience = "ALL" | "TARGETED";

const AUDIENCE_OPTIONS = [
  { key: "ALL", label: "전체 공개" },
  { key: "TARGETED", label: "지정 학원/링크" },
] as const;

export function PromotionAudienceField({
  audience,
  onAudienceChange,
  targetAcademyIds,
  onTargetsChange,
  nameById,
}: {
  audience: PromotionAudience;
  onAudienceChange: (next: PromotionAudience) => void;
  targetAcademyIds: string[];
  onTargetsChange: (next: string[]) => void;
  nameById: Map<string, string>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedCount = targetAcademyIds.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-gray-500">노출 대상</span>
        <FilterChipGroup
          options={AUDIENCE_OPTIONS}
          value={audience}
          onChange={onAudienceChange}
          ariaLabel="노출 대상"
        />
      </div>

      {audience === "TARGETED" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
              <Users className="size-3.5" strokeWidth={2} />
              지정 학원 {selectedCount > 0 && `· ${selectedCount}곳`}
            </span>
            {selectedCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onTargetsChange([])}
                className="text-gray-400 hover:text-rose-600"
              >
                전체 해제
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
            className="text-gray-700"
          >
            <Users className="size-3.5 text-gray-400" strokeWidth={2} />
            {selectedCount > 0 ? `학원 ${selectedCount}곳 · 변경` : "학원 선택"}
          </Button>
          {selectedCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {targetAcademyIds.slice(0, 12).map((id) => {
                const nm = nameById.get(id) ?? id;
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                  >
                    {nm}
                    <button
                      type="button"
                      onClick={() =>
                        onTargetsChange(targetAcademyIds.filter((x) => x !== id))
                      }
                      aria-label={`${nm} 제거`}
                      className="text-blue-400 hover:text-blue-700"
                    >
                      <X className="size-3" strokeWidth={2.4} />
                    </button>
                  </span>
                );
              })}
              {selectedCount > 12 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                  +{selectedCount - 12}곳
                </span>
              )}
            </div>
          )}
          <BannerTargetPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            audiences={["DIRECTOR"]}
            targetMode="SPECIFIC"
            selectedIds={targetAcademyIds}
            onConfirm={(sel) => onTargetsChange(sel.academyIds)}
            hideRole
            hideScope
            title="지정 학원 선택"
          />
        </div>
      )}
    </>
  );
}
