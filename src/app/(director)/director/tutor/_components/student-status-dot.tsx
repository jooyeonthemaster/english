import { cn } from "@/lib/utils";

/**
 * Single source of truth for student status tone — overrides the amber PAUSED
 * color in constants.ts (global UI rule forbids amber). Dot + label are always
 * shown together so the meaning never relies on color alone (a11y).
 */
export const STUDENT_STATUS_TONE: Record<
  string,
  { dot: string; text: string; label: string }
> = {
  ACTIVE: { dot: "bg-emerald-500", text: "text-emerald-600", label: "재원" },
  PAUSED: { dot: "bg-[#C4CAD0]", text: "text-[#6B7684]", label: "휴원" },
  WITHDRAWN: { dot: "bg-slate-400", text: "text-[#8B95A1]", label: "퇴원" },
  WAITING: { dot: "bg-blue-500", text: "text-blue-600", label: "대기" },
};

export function StudentStatusDot({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = STUDENT_STATUS_TONE[status] ?? STUDENT_STATUS_TONE.WITHDRAWN;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-bold", className)}
      aria-label={`상태: ${tone.label}`}
    >
      <span className={cn("size-2 shrink-0 rounded-full", tone.dot)} aria-hidden />
      <span className={tone.text}>{tone.label}</span>
    </span>
  );
}
