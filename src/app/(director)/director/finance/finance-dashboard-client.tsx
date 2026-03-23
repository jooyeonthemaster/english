"use client";

import React, { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExpenseFormDialog } from "@/components/finance/expense-form-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FinanceSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  margin: number;
  revenueBreakdown: { category: string; amount: number }[];
  expenseBreakdown: { category: string; amount: number }[];
}

interface TrendItem {
  month: string;
  revenue: number;
  expenses: number;
}

interface CollectionRateItem {
  month: string;
  rate: number;
}

interface Expense {
  id: string;
  category: string;
  amount: number;
  date: string | Date;
  description: string | null;
  receipt: string | null;
}

interface Props {
  summary: FinanceSummary;
  trend: TrendItem[];
  collectionRate: CollectionRateItem[];
  expenses: Expense[];
  expenseTotal: number;
  expensePage: number;
  expenseTotalPages: number;
  currentCategory: string;
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const PIE_COLORS = [
  "#3B82F6",
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#8B5CF6",
  "#EC4899",
  "#6B7280",
];

function getCategoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label || value;
}

function getCategoryColor(value: string) {
  const colorMap: Record<string, string> = {
    RENT: "bg-blue-100 text-blue-700",
    SALARY: "bg-emerald-100 text-emerald-700",
    MATERIALS: "bg-amber-100 text-amber-700",
    MARKETING: "bg-purple-100 text-purple-700",
    UTILITIES: "bg-orange-100 text-orange-700",
    MAINTENANCE: "bg-cyan-100 text-cyan-700",
    OTHER: "bg-gray-100 text-gray-600",
  };
  return colorMap[value] || "bg-gray-100 text-gray-600";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FinanceDashboardClient({
  summary,
  trend,
  collectionRate,
  expenses,
  expenseTotal,
  expensePage,
  expenseTotalPages,
  currentCategory,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "ALL") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    startTransition(() => {
      router.push(`/director/finance?${params.toString()}`);
    });
  }

  // Custom tooltip for charts
  function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
    if (!active || !payload) return null;
    return (
      <div className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 shadow-lg">
        <p className="text-xs font-medium text-[#8B95A1]">{label}</p>
        {payload.map((entry, i) => (
          <p key={i} className="text-sm font-semibold" style={{ color: entry.color }}>
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-bold text-[#191F28]">재무 관리</h1>
        <p className="mt-1 text-[14px] text-[#8B95A1]">
          학원의 수입, 지출, 순이익을 한 눈에 확인하세요.
        </p>
      </div>

      {/* Revenue vs Expense Chart */}
      <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
        <h3 className="text-[16px] font-semibold text-[#191F28]">
          수입/지출 추이 (최근 6개월)
        </h3>
        <div className="mt-4 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F6" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: "#8B95A1" }}
                axisLine={{ stroke: "#E5E7EB" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#8B95A1" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-[#4E5968]">{value}</span>
                )}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                name="수입"
                stroke="#10B981"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#10B981" }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="expenses"
                name="지출"
                stroke="#EF4444"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#EF4444" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Middle Section: 3 Cards */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Summary */}
        <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50">
              <ArrowUpRight className="size-4 text-emerald-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-[#191F28]">수입 요약</h3>
          </div>
          <p className="mt-4 text-3xl font-bold text-emerald-600">
            {formatCurrency(summary.totalRevenue)}
          </p>
          <p className="mt-1 text-sm text-[#8B95A1]">이번 달 총 수입</p>
          <div className="mt-4 space-y-2">
            {summary.revenueBreakdown.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-[#4E5968]">{item.category}</span>
                <span className="font-medium">{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Expense Summary with Pie Chart */}
        <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-red-50">
              <ArrowDownRight className="size-4 text-red-600" />
            </div>
            <h3 className="text-[15px] font-semibold text-[#191F28]">지출 요약</h3>
          </div>
          <p className="mt-4 text-3xl font-bold text-red-600">
            {formatCurrency(summary.totalExpenses)}
          </p>
          <p className="mt-1 text-sm text-[#8B95A1]">이번 달 총 지출</p>

          {summary.expenseBreakdown.length > 0 ? (
            <div className="mt-3 h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary.expenseBreakdown.map((item) => ({
                      ...item,
                      name: getCategoryLabel(item.category),
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    dataKey="amount"
                    nameKey="name"
                  >
                    {summary.expenseBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value ?? 0))}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-4 text-center text-sm text-[#8B95A1]">지출 기록이 없습니다.</p>
          )}
        </div>

        {/* Net Profit */}
        <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50">
              <Wallet className="size-4 text-[#3B82F6]" />
            </div>
            <h3 className="text-[15px] font-semibold text-[#191F28]">순이익</h3>
          </div>
          <p
            className={cn(
              "mt-4 text-3xl font-bold",
              summary.netProfit >= 0 ? "text-[#3B82F6]" : "text-red-600"
            )}
          >
            {formatCurrency(summary.netProfit)}
          </p>
          <p className="mt-1 text-sm text-[#8B95A1]">이번 달 순이익</p>

          <div className="mt-6 rounded-lg bg-[#F8F9FA] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#4E5968]">이익률</span>
              <span
                className={cn(
                  "text-lg font-bold",
                  summary.margin >= 0 ? "text-[#3B82F6]" : "text-red-600"
                )}
              >
                {summary.margin.toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E5E7EB]">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  summary.margin >= 0 ? "bg-[#3B82F6]" : "bg-red-400"
                )}
                style={{ width: `${Math.min(Math.abs(summary.margin), 100)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-3.5 text-emerald-500" />
                <span className="text-[#4E5968]">수입</span>
              </div>
              <span className="font-medium text-emerald-600">
                {formatCurrency(summary.totalRevenue)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="size-3.5 text-red-500" />
                <span className="text-[#4E5968]">지출</span>
              </div>
              <span className="font-medium text-red-600">
                {formatCurrency(summary.totalExpenses)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Two Columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Expense Records */}
        <div className="rounded-xl border border-[#F2F4F6] bg-white">
          <div className="flex items-center justify-between border-b border-[#F2F4F6] px-4 py-3">
            <h3 className="text-[15px] font-semibold text-[#191F28]">지출 기록</h3>
            <div className="flex items-center gap-2">
              <Select
                value={currentCategory}
                onValueChange={(v) => updateFilter("category", v)}
              >
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue placeholder="카테고리" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체</SelectItem>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 gap-1 bg-[#3B82F6] text-xs hover:bg-[#2563EB]"
                onClick={() => setExpenseDialogOpen(true)}
              >
                <Plus className="size-3.5" />
                지출 등록
              </Button>
            </div>
          </div>

          <div className={cn("transition-opacity", isPending && "opacity-50")}>
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F8F9FA]">
                  <TableHead className="pl-4">일자</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead className="text-right pr-4">금액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-12 text-center text-sm text-[#8B95A1]">
                      지출 기록이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="pl-4 text-[#8B95A1]">
                        {formatDate(expense.date)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            getCategoryColor(expense.category)
                          )}
                        >
                          {getCategoryLabel(expense.category)}
                        </span>
                      </TableCell>
                      <TableCell className="text-[#4E5968]">
                        {expense.description || "-"}
                      </TableCell>
                      <TableCell className="text-right pr-4 font-medium text-red-600">
                        -{formatCurrency(expense.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Right: Collection Rate Chart */}
        <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
          <h3 className="text-[15px] font-semibold text-[#191F28]">수납률 추이</h3>
          <div className="mt-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={collectionRate} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F6" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "#8B95A1" }}
                  axisLine={{ stroke: "#E5E7EB" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#8B95A1" }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  formatter={(value) => [`${value ?? 0}%`, "수납률"]}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    fontSize: 13,
                  }}
                />
                <Bar
                  dataKey="rate"
                  fill="#3B82F6"
                  radius={[4, 4, 0, 0]}
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Expense Form Dialog */}
      <ExpenseFormDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
      />
    </div>
  );
}
