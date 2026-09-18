"use client";

// 리포트 로딩·오류·빈 상태 공용 표시.

import { AlertTriangle, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ReportSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 rounded-lg" />
      ))}
    </div>
  );
}

export function ReportError({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-3 text-[12.5px] text-rose-700",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function ReportEmpty({ message = "이 기간에 데이터가 없습니다", className }: { message?: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 px-3 py-8 text-center text-[12.5px] text-gray-400",
        className,
      )}
    >
      <Inbox className="size-5 text-gray-300" aria-hidden />
      {message}
    </div>
  );
}
