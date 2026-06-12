import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowPageTitleProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  /** 베타 기능 — 제목 옆에 BETA 배지를 노출한다. */
  beta?: boolean;
}

export function WorkflowPageTitle({
  icon: Icon,
  title,
  description,
  className,
  beta = false,
}: WorkflowPageTitleProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <h1 className="truncate text-[14px] font-bold text-slate-900">
            {title}
          </h1>
          {beta ? (
            <span className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold leading-none tracking-wide text-blue-600">
              BETA
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="truncate text-[12px] font-medium text-slate-400">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
