import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 빈 목록 한 종류 — 아이콘 원 · 제목 · 힌트 · (선택) 버튼 */
export function AdminEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-5 text-center",
        compact ? "py-8" : "py-16",
        className,
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-gray-50">
        <Icon className="size-5 text-gray-300" strokeWidth={1.8} aria-hidden />
      </div>
      <p className="text-[13px] font-medium text-gray-500">{title}</p>
      {description && <p className="mt-1 text-[11px] text-gray-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
