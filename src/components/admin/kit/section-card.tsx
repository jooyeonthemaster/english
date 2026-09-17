import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 페이지 안 구역 카드 — 제목 줄(아이콘·설명·오른쪽 버튼) + 본문 */
export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  padded = true,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  /** 본문 여백(표를 넣을 땐 false) */
  padded?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-gray-100 bg-white", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-gray-900">
                {Icon && <Icon className="size-4 text-blue-600" strokeWidth={2} aria-hidden />}
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-[12px] text-gray-400">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(padded && "p-5")}>{children}</div>
    </section>
  );
}
