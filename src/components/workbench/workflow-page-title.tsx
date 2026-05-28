import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowPageTitleProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}

export function WorkflowPageTitle({
  icon: Icon,
  title,
  description,
  className,
}: WorkflowPageTitleProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h1 className="truncate text-[14px] font-bold text-slate-900">
          {title}
        </h1>
        {description ? (
          <p className="truncate text-[12px] font-medium text-slate-400">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
