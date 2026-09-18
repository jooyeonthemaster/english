"use client";

import { Fragment, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/admin/kit";
import { activeFlag } from "@/lib/admin-labels";
import { cn } from "@/lib/utils";

/**
 * 배너 관리 세 목록(랜딩 헤더·랜딩 팝업·앱 배너)이 같이 쓰는 행 —
 * 순서 ↑↓ · 썸네일 · 제목+노출 뱃지 · 메타 줄 · 스위치 · 수정 · 삭제.
 * AdminHoverDetail 이 감쌀 수 있도록 li 속성(onClick·onPointerMove 등)을 그대로 넘긴다.
 */
export function BannerListRow({
  thumb,
  title,
  active,
  badges,
  meta,
  index,
  count,
  disabled = false,
  onMove,
  onToggle,
  onEdit,
  onDelete,
  className,
  ...rest
}: ComponentProps<"li"> & {
  /** 썸네일 이미지 또는 아이콘 */
  thumb: ReactNode;
  title: string;
  active: boolean;
  /** 노출 뱃지 뒤에 덧붙일 뱃지(예: 현재 노출) */
  badges?: ReactNode;
  /** 메타 줄 — falsy 항목은 건너뛰고 "·" 로 잇는다 */
  meta: ReactNode[];
  index: number;
  count: number;
  disabled?: boolean;
  onMove: (dir: -1 | 1) => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const metaItems = meta.filter(Boolean);
  return (
    <li
      {...rest}
      className={cn(
        "flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50/60",
        className,
      )}
    >
      {/* 순서 */}
      <div className="flex shrink-0 flex-col">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onMove(-1)}
          disabled={disabled || index === 0}
          aria-label="위로"
          title="위로"
          className="text-gray-400 hover:text-gray-700"
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onMove(1)}
          disabled={disabled || index === count - 1}
          aria-label="아래로"
          title="아래로"
          className="text-gray-400 hover:text-gray-700"
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>

      {/* 썸네일 */}
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-gray-400">
        {thumb}
      </div>

      {/* 제목 · 메타 */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[13px] font-semibold text-gray-900">{title}</p>
          <StatusBadge status={activeFlag(active)} />
          {badges}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-gray-400">
          {metaItems.map((item, i) => (
            <Fragment key={i}>
              {i > 0 && <span aria-hidden>·</span>}
              <span className="min-w-0 truncate">{item}</span>
            </Fragment>
          ))}
        </div>
      </div>

      {/* 조작 */}
      <div className="flex shrink-0 items-center gap-1">
        <Switch
          checked={active}
          onCheckedChange={onToggle}
          disabled={disabled}
          aria-label={active ? "노출 끄기" : "노출 켜기"}
          className="mr-1"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label="수정"
          title="수정"
          className="text-gray-400 hover:text-gray-700"
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="삭제"
          title="삭제"
          className="text-gray-400 hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}
