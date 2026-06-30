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
import { CREDITS_CHANGED_EVENT } from "@/lib/credits-client";

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

interface CreditBadgeProps {
  collapsed?: boolean;
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
}

export function CreditBadge({
  collapsed = false,
  popoverSide,
  popoverAlign = "end",
}: CreditBadgeProps = {}) {
  return (
    <CreditBadgeContent
      collapsed={collapsed}
      popoverSide={popoverSide}
      popoverAlign={popoverAlign}
    />
  );
}

// 마지막으로 본 잔액을 모듈 스코프에 보관 → 뱃지가 리마운트(모달/네비게이션)돼도 직전 잔액을
// 기억해 차감/환급 방향 애니메이션이 사라지지 않게 한다. sessionStorage 로 새로고침도 버팀.
const BALANCE_CACHE_KEY = "credit-badge:last-balance";
const BALANCE_POLL_INTERVAL_MS = 60_000;
let lastKnownBalance: number | null = null;
function readLastBalance(): number | null {
  if (lastKnownBalance !== null) return lastKnownBalance;
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage?.getItem(BALANCE_CACHE_KEY);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}
function writeLastBalance(n: number) {
  lastKnownBalance = n;
  try {
    window.sessionStorage?.setItem(BALANCE_CACHE_KEY, String(n));
  } catch {
    // sessionStorage 접근 불가 시 모듈 변수만 사용
  }
}

function CreditBadgeContent({
  collapsed = false,
  popoverSide,
  popoverAlign = "end",
}: CreditBadgeProps = {}) {
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  // 잔액 변화 강조용: dir = 차감("down")/환급("up"), id 는 같은 방향 연속 변화에도 애니메이션을 재시작시키는 키
  const [flash, setFlash] = useState<{ dir: "up" | "down"; id: number } | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const flashIdRef = useRef(0);

  const fetchBalance = useCallback(async (force = false) => {
    if (
      !force &&
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }
    try {
      const res = await fetch("/api/credits/balance");
      if (!res.ok) return;
      const data = (await res.json()) as CreditSummary;
      const prev = readLastBalance(); // 모듈/세션에 보관된 직전 잔액 (리마운트에도 유지)
      // 직전 잔액이 없으면(앱 최초 진입) 강조하지 않음. 그 외 잔액이 바뀌면 방향에 따라 강조.
      if (prev !== null && typeof data.balance === "number" && data.balance !== prev) {
        flashIdRef.current += 1;
        setFlash({ dir: data.balance < prev ? "down" : "up", id: flashIdRef.current });
      }
      if (typeof data.balance === "number") writeLastBalance(data.balance);
      setSummary(data);
    } catch {
      // silently fail — badge is non-critical UI
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance(true);
    intervalRef.current = setInterval(fetchBalance, BALANCE_POLL_INTERVAL_MS);
    // 크레딧 소모/환급 직후 즉시 재조회 (60초 폴링 대기 없이 사이드바 반영)
    const onChanged = () => fetchBalance(true);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void fetchBalance(true);
    };
    window.addEventListener(CREDITS_CHANGED_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener(CREDITS_CHANGED_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchBalance]);

  if (loading || !summary) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 h-9 rounded-xl text-gray-300",
          collapsed ? "w-10 justify-center px-0 mx-auto" : "px-2.5",
        )}
      >
        <Coins className="size-[15px]" strokeWidth={1.7} />
        {!collapsed && (
          <span className="text-[13px] font-medium tabular-nums">--</span>
        )}
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
            "flex items-center h-9 rounded-xl transition-all duration-200 hover:bg-black/[0.03] outline-none",
            collapsed
              ? "w-10 justify-center px-0 mx-auto"
              : "gap-1.5 px-2.5",
            summary.isLow ? "text-red-500" : "text-emerald-600",
          )}
          aria-label={`크레딧 잔액: ${summary.balance.toLocaleString()}`}
        >
          <Coins className="size-[15px]" strokeWidth={1.7} />
          {!collapsed && (
            <>
              <span
                key={flash?.id ?? "static"}
                onAnimationEnd={() => setFlash(null)}
                className={cn(
                  "text-[13px] font-semibold tabular-nums",
                  flash?.dir === "down" && "credit-flash-down",
                  flash?.dir === "up" && "credit-flash-up",
                )}
              >
                {summary.balance.toLocaleString()}
              </span>
              {summary.isLow && (
                <TrendingDown className="size-3 text-red-400" strokeWidth={2} />
              )}
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side={popoverSide}
        align={popoverAlign}
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
          <div className="relative bg-gray-50 rounded-lg px-3 py-2 overflow-hidden select-none" aria-disabled>
            <div className="pointer-events-none opacity-40 grayscale">
              <span className="text-[10px] text-gray-400 font-medium block">
                월간 배정
              </span>
              <span className="text-[14px] font-bold text-gray-700 tabular-nums">
                {summary.monthlyAllocation.toLocaleString()}
              </span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-white/30 backdrop-blur-[1px]">
              <span className="inline-flex items-center rounded-full border border-gray-200 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-gray-500 shadow-sm">
                준비중
              </span>
            </div>
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
