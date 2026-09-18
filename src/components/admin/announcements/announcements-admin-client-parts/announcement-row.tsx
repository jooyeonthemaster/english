"use client";

import type { ComponentProps } from "react";
import { MonitorUp, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/admin/kit";
import { activeFlag } from "@/lib/admin-labels";
import { cn, formatDateTime } from "@/lib/utils";
import type { AdminAnnouncementDto } from "@/actions/admin-announcements";
import { audienceLabel, categoryStatus, isVisible, sourceStatus } from "./announcement-labels";

/**
 * 스모트 소식 목록 한 줄 — 행 클릭=편집창, 오른쪽 조작(스위치·고정·배너·수정·삭제)은 행 클릭과 분리.
 * AdminHoverDetail 이 감쌀 수 있도록 li 속성(onClick·onPointerMove 등)을 그대로 넘긴다.
 */
export function AnnouncementRow({
  announcement: a,
  onOpen,
  onToggleVisible,
  onPin,
  onBanner,
  onDelete,
  className,
  onClick,
  ...rest
}: ComponentProps<"li"> & {
  announcement: AdminAnnouncementDto;
  onOpen: () => void;
  onToggleVisible: () => void;
  onPin: () => void;
  onBanner: () => void;
  onDelete: () => void;
}) {
  const visible = isVisible(a.status);
  const source = sourceStatus(a.sourceType);

  return (
    <li
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        onOpen();
      }}
      className={cn(
        "flex cursor-pointer items-start gap-3 px-5 py-3 transition-colors hover:bg-gray-50/60",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {a.isPinned && (
            <Pin className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="상단 고정" />
          )}
          <StatusBadge status={categoryStatus(a.category)} />
          {source && <StatusBadge status={source} />}
        </div>
        <p className="truncate text-[13px] font-semibold text-gray-900">{a.title}</p>
        <p className="mt-0.5 text-[12px] text-gray-400">
          대상 {audienceLabel(a.audiences)}
          {a.publishedAt ? ` · 게시 ${formatDateTime(a.publishedAt)}` : " · 게시일 미정"}
        </p>
      </div>

      {/* 조작 — 행 클릭(수정 열기)과 분리 */}
      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <StatusBadge status={activeFlag(visible)} className="mr-1" />
        <Switch
          checked={visible}
          onCheckedChange={onToggleVisible}
          aria-label={visible ? "노출 끄기" : "노출 켜기"}
          className="mr-1"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onPin}
          aria-label={a.isPinned ? "고정 해제" : "상단 고정"}
          title={a.isPinned ? "고정 해제" : "상단 고정"}
          className="text-gray-400 hover:text-gray-700"
        >
          {a.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBanner}
          aria-label="배너로 띄우기"
          title="배너로 띄우기"
          className="text-gray-400 hover:text-gray-700"
        >
          <MonitorUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpen}
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
