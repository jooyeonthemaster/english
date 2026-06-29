import { cn } from "@/lib/utils";
import type { StatusOption } from "@/lib/help-center";

/** 헬프센터 상태 뱃지 — 공지/뱃지 톤과 통일된 작은 pill. */
export function StatusBadge({
  status,
  className,
}: {
  status: StatusOption;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-none whitespace-nowrap",
        status.className,
        className,
      )}
    >
      {status.label}
    </span>
  );
}
