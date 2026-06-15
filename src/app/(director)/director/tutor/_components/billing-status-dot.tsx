import { cn } from "@/lib/utils";
import { BILLING_STATE_COLOR, type BillingState } from "@/lib/billing-status";

export function BillingStatusDot({
  state,
  label,
  className,
}: {
  state: BillingState;
  label: string;
  className?: string;
}) {
  const tone = BILLING_STATE_COLOR[state];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-bold", className)}
      aria-label={`원비: ${label}`}
    >
      <span className={cn("size-2 shrink-0 rounded-full", tone.dot)} aria-hidden />
      <span className={tone.text}>{label}</span>
    </span>
  );
}
