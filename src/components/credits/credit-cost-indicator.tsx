"use client";

import { Coins } from "lucide-react";
import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";
import { cn } from "@/lib/utils";

interface CreditCostIndicatorProps {
  operation: OperationType;
  className?: string;
}

export function CreditCostIndicator({
  operation,
  className,
}: CreditCostIndicatorProps) {
  const cost = CREDIT_COSTS[operation];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[12px] font-medium text-gray-400",
        className,
      )}
    >
      <Coins className="size-3" strokeWidth={1.8} />
      <span className="tabular-nums">{cost}</span>
      <span>크레딧</span>
    </span>
  );
}
