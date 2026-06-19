"use client";

// 분석 대시보드 공용 섹션 카드 — 흰 카드 + 헤더(제목/설명/우측 액션) + 본문.
// expand 가 주어지면 헤더에 확대 버튼이 생기고, 클릭 시 더 큰 차트를 모달로 띄운다.

import { useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AnalyticsSectionProps {
  title: string;
  description?: string;
  /** 헤더 우측 영역(범례·토글 등) */
  right?: ReactNode;
  /** 주어지면 확대 버튼 + 모달. 보통 같은 차트를 더 큰 height 로 전달. */
  expand?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function AnalyticsSection({
  title,
  description,
  right,
  expand,
  className,
  bodyClassName,
  children,
}: AnalyticsSectionProps) {
  const [open, setOpen] = useState(false);
  return (
    <section
      className={cn(
        "bg-white rounded-xl border border-gray-100 overflow-hidden",
        className,
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between px-5 py-4 border-b border-gray-50">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-gray-800">{title}</h3>
          {description && (
            <p className="text-[12px] text-gray-400 mt-0.5">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {right}
          {expand && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center justify-center size-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              aria-label={`${title} 크게 보기`}
              title="크게 보기"
            >
              <Maximize2 className="size-3.5" strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>

      {expand && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="w-[96vw] sm:max-w-[1200px] max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[15px]">{title}</DialogTitle>
              {description && (
                <p className="text-[12px] text-gray-400">{description}</p>
              )}
            </DialogHeader>
            <div className="pt-2">{expand}</div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
