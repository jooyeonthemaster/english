"use client";

import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  sm: "sm:max-w-[440px]",
  md: "sm:max-w-[600px]",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-[1180px]",
} as const;

/**
 * 관리자 팝업 한 종류 — 제목 줄(닫기 X) · 스크롤 본문 · 버튼 줄(취소 → 주 버튼 순).
 * 편집·상세·확인 모두 이걸 쓴다. 폭은 4단계.
 */
export function AdminDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
  footer,
  bodyClassName,
  padded = true,
  onInteractOutside,
  onEscapeKeyDown,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  size?: keyof typeof SIZE_CLASS;
  children: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
  /** false = 본문 여백·스크롤 없음(2단 편집기처럼 내부에서 직접 잡을 때) */
  padded?: boolean;
  /**
   * 팝업 위에 Radix 밖의 레이어(미리보기·대상 선택 등)를 띄울 때, 바깥 클릭·ESC 가
   * 팝업까지 닫지 않도록 가로챈다.
   */
  onInteractOutside?: ComponentProps<typeof DialogContent>["onInteractOutside"];
  onEscapeKeyDown?: ComponentProps<typeof DialogContent>["onEscapeKeyDown"];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn("gap-0 p-0", SIZE_CLASS[size])}
        onInteractOutside={onInteractOutside}
        onEscapeKeyDown={onEscapeKeyDown}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <DialogTitle className="text-[16px] font-semibold text-gray-900">{title}</DialogTitle>
            <DialogDescription className={cn("mt-0.5 text-[12px] text-gray-400", !description && "sr-only")}>
              {description ?? title}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="닫기"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-4" />
          </button>
        </div>
        <div
          className={cn(
            padded && "max-h-[70dvh] overflow-y-auto px-5 py-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
