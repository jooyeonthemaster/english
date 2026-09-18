"use client";

import { ChevronDown, FileText, FolderOpen, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AdminEmptyState, StatusBadge } from "@/components/admin/kit";
import { activeFlag } from "@/lib/admin-labels";
import { cn } from "@/lib/utils";
import type {
  OfflineMarketingAssetDto,
  OfflineMarketingCampaignDto,
} from "@/actions/admin-offline-marketing";
import { AssetRow } from "./asset-row";

/** 홍보(캠페인) 카드 — 머리(펼치기·분류·파일 수·조작) + 펼침 시 파일 목록. */
export function CampaignCard({
  campaign: c,
  draggable,
  open,
  pending,
  pendingAssetId,
  onToggleExpand,
  onAddFile,
  onEdit,
  onToggleActive,
  onDelete,
  onPrintAsset,
  onEditAsset,
  onDeleteAsset,
}: {
  campaign: OfflineMarketingCampaignDto;
  draggable: boolean;
  open: boolean;
  pending: boolean;
  pendingAssetId: string | null;
  onToggleExpand: () => void;
  onAddFile: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onPrintAsset: (a: OfflineMarketingAssetDto) => void;
  onEditAsset: (a: OfflineMarketingAssetDto) => void;
  onDeleteAsset: (a: OfflineMarketingAssetDto) => void;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-gray-100 bg-white transition-colors",
        !c.isActive && "opacity-60",
        pending && "pointer-events-none opacity-50",
      )}
    >
      <div className="flex items-center gap-2 p-3 sm:px-4">
        {draggable && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="드래그로 순서 변경"
            title="드래그로 순서 변경"
            className="hidden cursor-grab touch-none text-gray-300 hover:text-gray-500 active:cursor-grabbing sm:inline-flex"
          >
            <GripVertical className="size-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          onClick={onToggleExpand}
          aria-expanded={open}
          className="h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal px-1.5 py-1.5 text-left hover:bg-transparent"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-500">
            <FolderOpen className="size-5" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold text-gray-900">{c.title}</span>
              <StatusBadge status={{ label: c.category, tone: "gray" }} />
              <StatusBadge status={{ label: `파일 ${c.assets.length}`, tone: "blue" }} />
              <StatusBadge status={activeFlag(c.isActive)} />
            </span>
            {c.description && (
              <span className="mt-0.5 block truncate text-[12px] font-normal text-gray-400">
                {c.description}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-gray-400 transition-transform", open && "rotate-180")}
          />
        </Button>

        {/* 홍보 조작 */}
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" onClick={onAddFile} title="파일 추가">
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">파일</span>
          </Button>
          <Switch
            checked={c.isActive}
            onCheckedChange={onToggleActive}
            aria-label={c.isActive ? "노출 끄기" : "노출 켜기"}
            className="mx-1"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            aria-label="홍보 수정"
            title="홍보 수정"
            className="text-gray-400 hover:text-gray-700"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="홍보 삭제"
            title="홍보 삭제"
            className="text-gray-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* 파일 목록(펼침) */}
      {open && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-3 py-3 sm:px-4">
          {c.assets.length === 0 ? (
            <AdminEmptyState
              icon={FileText}
              title="아직 파일이 없어요"
              compact
              action={
                <Button size="sm" variant="outline" onClick={onAddFile}>
                  <Plus className="size-3.5" />첫 파일 추가
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {c.assets.map((a) => (
                <AssetRow
                  key={a.id}
                  asset={a}
                  pending={pendingAssetId === a.id}
                  onPrint={() => onPrintAsset(a)}
                  onEdit={() => onEditAsset(a)}
                  onDelete={() => onDeleteAsset(a)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
