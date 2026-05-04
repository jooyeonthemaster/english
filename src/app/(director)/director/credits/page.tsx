"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Coins,
  Calendar,
  Gift,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Filter,
  Zap,
  FileText,
  Brain,
  MessageSquare,
  Pencil,
  ScanText,
  BookOpen,
  Languages,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CREDIT_COSTS,
  OPERATION_LABELS,
  type OperationType,
} from "@/lib/credit-costs";

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  operationType?: string;
  description?: string;
  staffId?: string;
  createdAt: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  CONSUMPTION: "사용",
  ALLOCATION: "배정",
  TOP_UP: "충전",
  ADJUSTMENT: "조정",
  REFUND: "환불",
  RESET: "리셋",
  ROLLOVER: "이월",
};

const FILTER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "CONSUMPTION", label: "사용" },
  { value: "ALLOCATION", label: "배정" },
  { value: "TOP_UP", label: "충전" },
  { value: "REFUND", label: "환불" },
  { value: "ADJUSTMENT", label: "조정" },
];

// 기능별 아이콘 매핑
const OPERATION_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  QUESTION_GEN_SINGLE: FileText,
  QUESTION_GEN_VOCAB: BookOpen,
  AUTO_GEN_BATCH: Zap,
  LEARNING_QUESTION_GEN: GraduationCap,
  PASSAGE_ANALYSIS: Brain,
  GRAMMAR_ENHANCEMENT: Languages,
  SENTENCE_RETRANSLATION: Languages,
  QUESTION_EXPLANATION: FileText,
  QUESTION_MODIFY: Pencil,
  AI_CHAT: MessageSquare,
  TEXT_EXTRACTION: ScanText,
};

// 기능별 색상 매핑
const OPERATION_COLORS: Record<string, { bg: string; text: string }> = {
  QUESTION_GEN_SINGLE: { bg: "bg-blue-50", text: "text-blue-500" },
  QUESTION_GEN_VOCAB: { bg: "bg-sky-50", text: "text-sky-500" },
  AUTO_GEN_BATCH: { bg: "bg-violet-50", text: "text-violet-500" },
  LEARNING_QUESTION_GEN: { bg: "bg-indigo-50", text: "text-indigo-500" },
  PASSAGE_ANALYSIS: { bg: "bg-emerald-50", text: "text-emerald-500" },
  GRAMMAR_ENHANCEMENT: { bg: "bg-teal-50", text: "text-teal-500" },
  SENTENCE_RETRANSLATION: { bg: "bg-cyan-50", text: "text-cyan-500" },
  QUESTION_EXPLANATION: { bg: "bg-blue-50", text: "text-blue-500" },
  QUESTION_MODIFY: { bg: "bg-slate-100", text: "text-slate-500" },
  AI_CHAT: { bg: "bg-pink-50", text: "text-pink-500" },
  TEXT_EXTRACTION: { bg: "bg-gray-100", text: "text-gray-500" },
};

// ─── Page Component ─────────────────────────────────────────────────────────

export default function CreditsPage() {
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [totalTx, setTotalTx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const isFirstRender = useRef(true);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/credits/balance");
      if (res.ok) setSummary(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (filterType) params.set("type", filterType);
      const res = await fetch(`/api/credits/transactions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions);
        setTotalTx(data.total);
      }
    } catch {
      /* ignore */
    } finally {
      setTxLoading(false);
    }
  }, [page, filterType]);

  // Initial load
  useEffect(() => {
    Promise.all([fetchSummary(), fetchTransactions()]).then(() =>
      setLoading(false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when page or filterType changes (skip initial)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchTransactions();
  }, [page, filterType, fetchTransactions]);

  const costEntries = Object.entries(CREDIT_COSTS) as [OperationType, number][];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-gray-500 font-medium">
            로딩 중...
          </span>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalTx / pageSize);
  const usagePercent = summary
    ? summary.monthlyAllocation > 0
      ? Math.round(
          ((summary.monthlyAllocation - summary.balance + summary.bonusCredits) /
            summary.monthlyAllocation) *
            100,
        )
      : 0
    : 0;

  return (
    <div className="space-y-5 -mx-1">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900">크레딧 관리</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            AI 기능 사용 크레딧 현황 및 내역을 확인하세요
          </p>
        </div>
        <button
          onClick={() => {
            fetchSummary();
            fetchTransactions();
          }}
          className="flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium text-gray-500 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:text-gray-700 transition-all duration-200 shadow-sm"
        >
          <RefreshCw className="size-3.5" strokeWidth={1.8} />
          새로고침
        </button>
      </div>

      {/* Overview cards — 2x2 grid with usage bar */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 현재 잔액 — 강조 카드 */}
          <div className="col-span-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-medium text-blue-200">현재 잔액</span>
                {summary.planName && (
                  <span className="text-[10px] font-semibold bg-white/15 backdrop-blur-sm px-2 py-0.5 rounded-md">
                    {summary.planName}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-[36px] font-extrabold tabular-nums tracking-tight leading-none">
                  {summary.balance.toLocaleString()}
                </span>
                <span className="text-[13px] font-medium text-blue-200">크레딧</span>
              </div>
              {/* Usage progress bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-blue-200 mb-1.5">
                  <span>이번 달 사용량</span>
                  <span className="font-semibold text-white">{usagePercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/80 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <OverviewCard
            label="월간 배정"
            value={summary.monthlyAllocation}
            icon={Calendar}
            accent="blue"
          />
          <OverviewCard
            label="보너스"
            value={summary.bonusCredits}
            icon={Gift}
            accent="indigo"
          />
        </div>
      )}

      {/* Usage breakdown — compact grid */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-[14px] font-semibold text-gray-800">
            기능별 크레딧 비용
          </h2>
          <p className="text-[12px] text-gray-400 mt-0.5">
            각 AI 기능 사용 시 차감되는 크레딧 단가
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {costEntries.map(([op, cost], idx) => {
            const OpIcon = OPERATION_ICONS[op] || Coins;
            const colors = OPERATION_COLORS[op] || { bg: "bg-gray-100", text: "text-gray-500" };
            return (
              <div
                key={op}
                className={cn(
                  "flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors",
                  // grid borders
                  idx < costEntries.length - (costEntries.length % 3 || 3) && "border-b border-gray-50",
                  (idx + 1) % 3 !== 0 && "lg:border-r lg:border-gray-50",
                  (idx + 1) % 2 !== 0 && "sm:border-r sm:border-gray-50 lg:border-r-0",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn("flex items-center justify-center w-7 h-7 rounded-lg", colors.bg)}>
                    <OpIcon className={cn("size-3.5", colors.text)} strokeWidth={1.8} />
                  </div>
                  <span className="text-[13px] font-medium text-gray-700">
                    {OPERATION_LABELS[op] || op}
                  </span>
                </div>
                <span className={cn(
                  "text-[13px] font-bold tabular-nums",
                  cost >= 5 ? "text-blue-600" : "text-gray-600",
                )}>
                  {cost}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transaction history */}
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">
              크레딧 사용 내역
            </h2>
            <p className="text-[12px] text-gray-400 mt-0.5">
              총 {totalTx.toLocaleString()}건
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="size-3.5 text-gray-400" strokeWidth={1.8} />
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPage(0);
              }}
              className="text-[12px] font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg h-8 px-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {txLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Coins className="size-8 mb-2" strokeWidth={1.2} />
            <span className="text-[13px] font-medium">
              크레딧 사용 내역이 없습니다
            </span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50">
                    <th className="px-5 py-2.5">일시</th>
                    <th className="px-4 py-2.5">유형</th>
                    <th className="px-4 py-2.5">기능</th>
                    <th className="px-4 py-2.5 text-right">금액</th>
                    <th className="px-5 py-2.5 text-right">잔액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map((tx) => {
                    const isPositive = tx.amount > 0;
                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-5 py-3 text-[12px] text-gray-500 tabular-nums whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleDateString("ko-KR", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center h-[20px] px-2 text-[10px] font-semibold rounded-md",
                              isPositive
                                ? "text-emerald-600 bg-emerald-500/[0.08]"
                                : "text-red-500 bg-red-500/[0.08]",
                            )}
                          >
                            {TYPE_LABELS[tx.type] || tx.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-gray-600">
                          {tx.operationType
                            ? OPERATION_LABELS[
                                tx.operationType as OperationType
                              ] || tx.operationType
                            : tx.description || "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 text-[13px] font-semibold tabular-nums",
                              isPositive
                                ? "text-emerald-600"
                                : "text-red-500",
                            )}
                          >
                            {isPositive ? (
                              <ArrowUpRight className="size-3" />
                            ) : (
                              <ArrowDownRight className="size-3" />
                            )}
                            {isPositive ? "+" : ""}
                            {tx.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-[12px] font-medium text-gray-500 tabular-nums">
                          {tx.balanceAfter.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <span className="text-[12px] text-gray-400">
                  {page * pageSize + 1}-
                  {Math.min((page + 1) * pageSize, totalTx)} / {totalTx}건
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="h-7 px-2.5 text-[12px] font-medium text-gray-500 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    이전
                  </button>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={page >= totalPages - 1}
                    className="h-7 px-2.5 text-[12px] font-medium text-gray-500 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Overview Card (compact) ────────────────────────────────────────────────

function OverviewCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  accent: "emerald" | "blue" | "indigo" | "gray" | "red";
}) {
  const accentMap = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-500", value: "text-emerald-700" },
    blue: { bg: "bg-blue-50", text: "text-blue-500", value: "text-blue-700" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-500", value: "text-indigo-700" },
    gray: { bg: "bg-gray-100", text: "text-gray-500", value: "text-gray-700" },
    red: { bg: "bg-red-50", text: "text-red-500", value: "text-red-700" },
  };
  const colors = accentMap[accent];

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium text-gray-400">{label}</span>
        <div className={cn("flex items-center justify-center w-7 h-7 rounded-lg", colors.bg)}>
          <Icon className={cn("size-3.5", colors.text)} strokeWidth={1.8} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-[22px] font-bold tabular-nums tracking-tight", colors.value)}>
          {value.toLocaleString()}
        </span>
        <span className="text-[11px] text-gray-400 font-medium">크레딧</span>
      </div>
    </div>
  );
}
