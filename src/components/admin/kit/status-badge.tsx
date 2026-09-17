import type { StatusMap, StatusMeta } from "@/lib/admin-labels/tone";
import { statusOf } from "@/lib/admin-labels/tone";
import { cn } from "@/lib/utils";
import { TONE_DOT, TONE_SOFT } from "./tones";

/**
 * 상태 뱃지 한 종류. 라벨·색은 src/lib/admin-labels 레지스트리에서만 가져온다.
 *   <StatusBadge map={ACADEMY_STATUS} value={academy.status} />
 *   <StatusBadge status={{ label: "수동 충전 완료", tone: "teal" }} />
 */
export function StatusBadge({
  map,
  value,
  status,
  variant = "soft",
  className,
}: {
  map?: StatusMap;
  value?: string | null;
  status?: StatusMeta;
  /** soft=배경 알약(기본), dot=점+글자(표 안에서 조용하게) */
  variant?: "soft" | "dot";
  className?: string;
}) {
  const meta = status ?? (map ? statusOf(map, value) : { label: value ?? "—", tone: "gray" as const });
  if (variant === "dot") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[12px] text-gray-700", className)}>
        <span className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[meta.tone])} aria-hidden />
        {meta.label}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-md px-2 text-[11px] font-semibold",
        TONE_SOFT[meta.tone],
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
