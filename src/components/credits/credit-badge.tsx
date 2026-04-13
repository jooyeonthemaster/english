"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Coins, TrendingDown, ChevronRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface CreditSummary {
  balance: number;
  monthlyAllocation: number;
  bonusCredits: number;
  totalConsumed: number;
  totalAllocated: number;
  isLow: boolean;
  threshold: number;
  planName?: string;
  planTier?: string;
}

export function CreditBadge() {
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/credits/balance");
      if (!res.ok) return;
      const data = await res.json();
      setSummary(data);
    } catch {
      // silently fail — badge is non-critical UI
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    intervalRef.current = setInterval(fetchBalance, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchBalance]);

  if (loading || !summary) {
    return (
      <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl text-gray-300">
        <Coins className="size-[15px]" strokeWidth={1.7} />
        <span className="text-[13px] font-medium tabular-nums">--</span>
      </div>
    );
  }

  const consumed =
    summary.monthlyAllocation > 0
      ? summary.monthlyAllocation - summary.balance + summary.bonusCredits
      : summary.totalConsumed;
  const usagePercent =
    summary.monthlyAllocation > 0
      ? Math.round((consumed / summary.monthlyAllocation) * 100)
      : 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 h-9 px-2.5 rounded-xl transition-all duration-200 hover:bg-black/[0.03] outline-none",
            summary.isLow ? "text-red-500" : "text-emerald-600",
          )}
          aria-label={`크레딧 잔액: ${summary.balance.toLocaleString()}`}
        >
          <Coins className="size-[15px]" strokeWidth={1.7} />
          <span className="text-[13px] font-semibold tabular-nums">
            {summary.balance.toLocaleString()}
          </span>
          {summary.isLow && (
            <TrendingDown className="size-3 text-red-400" strokeWidth={2} />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[280px] rounded-xl p-0 shadow-lg border-gray-200/60"
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              크레딧 잔액
            </span>
            {summary.planName && (
              <span className="inline-flex items-center h-[18px] px-1.5 text-[10px] font-semibold rounded-md text-blue-500 bg-blue-500/[0.08]">
                {summary.planName}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "text-[28px] font-bold tabular-nums tracking-tight",
                summary.isLow ? "text-red-500" : "text-gray-900",
              )}
            >
              {summary.balance.toLocaleString()}
            </span>
            <span className="text-[12px] text-gray-400 font-medium">
              크레딧
            </span>
          </div>
        </div>

        {/* Usage bar */}
        {summary.monthlyAllocation > 0 && (
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5">
              <span>월간 사용량</span>
              <span className="tabular-nums">
                {consumed.toLocaleString()} / {summary.monthlyAllocation.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  usagePercent > 80
                    ? "bg-red-400"
                    : usagePercent > 50
                      ? "bg-blue-400"
                      : "bg-emerald-400",
                )}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-[10px] text-gray-400 font-medium block">
              월간 배정
            </span>
            <span className="text-[14px] font-bold text-gray-700 tabular-nums">
              {summary.monthlyAllocation.toLocaleString()}
            </span>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-[10px] text-gray-400 font-medium block">
              보너스
            </span>
            <span className="text-[14px] font-bold text-gray-700 tabular-nums">
              {summary.bonusCredits.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Footer link */}
        <div className="border-t border-gray-100">
          <Link
            href="/director/credits"
            className="flex items-center justify-between px-4 py-2.5 text-[12px] font-medium text-blue-500 hover:bg-blue-50/50 transition-colors rounded-b-xl"
          >
            크레딧 관리
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
