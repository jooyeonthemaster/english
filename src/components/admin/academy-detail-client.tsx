"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AcademyContentBrowser } from "./academy-content-browser";
import {
  ArrowLeft,
  Building2,
  Coins,
  CreditCard,
  Users,
  UserCog,
  FileText,
  Plus,
  Minus,
  TrendingUp,
  TrendingDown,
  Clock,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatNumber, formatDateTime, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adjustCredits } from "@/actions/admin";

// Matches the return type of getAcademyDetail (academy spread at top level)
interface AcademyDetailData {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  status: string;
  createdAt: Date;
  staff: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
  }[];
  creditBalance: {
    balance: number;
    monthlyAllocation: number;
    bonusCredits: number;
    totalConsumed: number;
    totalAllocated: number;
    lowCreditThreshold: number;
  } | null;
  subscription: {
    id: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    plan: {
      name: string;
      tier: string;
      monthlyPrice: number;
      monthlyCredits: number;
    };
  } | null;
  recentTransactions: {
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string | null;
    createdAt: Date;
  }[];
  usageStats: {
    creditsConsumedLast30Days: number;
    transactionCountLast30Days: number;
    questionCount: number;
    studentCount: number;
    passageCount: number;
    examCount: number;
    classCount: number;
  };
  content?: {
    passages: unknown[];
    questions: unknown[];
    exams: unknown[];
  };
}

interface AcademyDetailClientProps {
  data: AcademyDetailData;
}

const TX_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  ALLOCATION: { label: "할당", className: "text-emerald-600" },
  CONSUMPTION: { label: "사용", className: "text-red-500" },
  TOP_UP: { label: "충전", className: "text-blue-600" },
  ADJUSTMENT: { label: "조정", className: "text-slate-600" },
  REFUND: { label: "환불", className: "text-blue-600" },
  RESET: { label: "초기화", className: "text-gray-500" },
  ROLLOVER: { label: "이월", className: "text-slate-600" },
};

export function AcademyDetailClient({ data }: AcademyDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Credit adjustment dialog
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const {
    subscription,
    creditBalance,
    recentTransactions,
    usageStats,
    staff,
  } = data;

  const isLowCredit =
    creditBalance &&
    creditBalance.balance <= creditBalance.lowCreditThreshold;

  async function handleAdjust() {
    const amount = parseInt(adjustAmount);
    if (!amount || !adjustReason.trim()) return;

    setAdjusting(true);
    try {
      const result = await adjustCredits(data.id, amount, adjustReason);
      if (!result.success) {
        toast.error(result.error || "조정에 실패했습니다");
        return;
      }
      toast.success(
        `크레딧 ${amount > 0 ? "추가" : "차감"}: ${Math.abs(amount)}`,
      );
      setShowAdjust(false);
      setAdjustAmount("");
      setAdjustReason("");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "조정에 실패했습니다");
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <>
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/academies"
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="size-4 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-[22px] font-bold text-gray-900">{data.name}</h1>
          <p className="text-[12px] text-gray-400">{data.slug}</p>
        </div>
        <Badge
          variant="secondary"
          className={cn(
            "ml-2 text-[11px] px-2 border-0",
            data.status === "ACTIVE"
              ? "bg-emerald-50 text-emerald-600"
              : data.status === "TRIAL"
                ? "bg-blue-50 text-blue-600"
                : data.status === "SUSPENDED"
                  ? "bg-red-50 text-red-600"
                  : "bg-gray-100 text-gray-500",
          )}
        >
          {data.status === "ACTIVE" ? "활성" : data.status === "TRIAL" ? "체험" : data.status === "SUSPENDED" ? "정지" : data.status === "DEACTIVATED" ? "비활성" : data.status}
        </Badge>
      </div>

      {/* Info cards row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Credit Balance */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100">
                <Coins className="size-4 text-slate-600" strokeWidth={1.8} />
              </div>
              <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wide">
                크레딧
              </span>
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setShowAdjust(true)}
              className="text-[11px]"
            >
              조정
            </Button>
          </div>
          <div
            className={cn(
              "text-[28px] font-bold leading-tight",
              isLowCredit ? "text-red-600" : "text-gray-900",
            )}
          >
            {formatNumber(creditBalance?.balance ?? 0)}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            월 {formatNumber(creditBalance?.monthlyAllocation ?? 0)}
          </div>
          {isLowCredit && (
            <div className="mt-2 text-[11px] text-red-500 bg-red-50 rounded-md px-2 py-1">
              크레딧 부족 경고
            </div>
          )}
        </div>

        {/* Subscription */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50">
              <CreditCard className="size-4 text-blue-600" strokeWidth={1.8} />
            </div>
            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wide">
              요금제
            </span>
          </div>
          {subscription ? (
            <>
              <div className="text-[18px] font-bold text-gray-900">
                {subscription.plan.name}
              </div>
              <div className="text-[12px] text-gray-400 mt-1">
                월 {formatCurrency(subscription.plan.monthlyPrice)}
              </div>
              <Badge
                variant="secondary"
                className={cn(
                  "mt-2 text-[10px] px-1.5 border-0",
                  subscription.status === "ACTIVE"
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-gray-100 text-gray-500",
                )}
              >
                {subscription.status === "ACTIVE" ? "활성" : subscription.status === "CANCELLED" ? "취소됨" : subscription.status === "EXPIRED" ? "만료" : subscription.status}
              </Badge>
            </>
          ) : (
            <span className="text-[13px] text-gray-400">구독 없음</span>
          )}
        </div>

        {/* People */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100">
              <Users className="size-4 text-slate-600" strokeWidth={1.8} />
            </div>
            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wide">
              인원
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">학생</span>
              <span className="text-[15px] font-semibold text-gray-800">
                {formatNumber(usageStats.studentCount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">직원</span>
              <span className="text-[15px] font-semibold text-gray-800">
                {formatNumber(staff.length)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">클래스</span>
              <span className="text-[15px] font-semibold text-gray-800">
                {formatNumber(usageStats.classCount)}
              </span>
            </div>
          </div>
        </div>

        {/* AI Stats */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100">
              <FileText className="size-4 text-slate-600" strokeWidth={1.8} />
            </div>
            <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wide">
              AI 사용량
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">문제</span>
              <span className="text-[15px] font-semibold text-gray-800">
                {formatNumber(usageStats.questionCount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">지문</span>
              <span className="text-[15px] font-semibold text-gray-800">
                {formatNumber(usageStats.passageCount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-500">시험</span>
              <span className="text-[15px] font-semibold text-gray-800">
                {formatNumber(usageStats.examCount)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-gray-50">
              <span className="text-[12px] text-gray-400">30일간 사용량</span>
              <span className="text-[13px] font-semibold text-gray-700">
                {formatNumber(usageStats.creditsConsumedLast30Days)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Credit Transactions */}
        <div className="bg-white rounded-xl border border-gray-100 lg:col-span-2">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
            <Clock className="size-4 text-gray-400" strokeWidth={1.8} />
            <h3 className="text-[14px] font-semibold text-gray-800">
              최근 크레딧 거래 내역
            </h3>
          </div>
          <div className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9 pl-5">
                    유형
                  </TableHead>
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9">
                    금액
                  </TableHead>
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9">
                    잔액
                  </TableHead>
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9">
                    설명
                  </TableHead>
                  <TableHead className="text-[12px] text-gray-400 font-medium h-9 pr-5">
                    날짜
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-[13px] text-gray-400 py-8"
                    >
                      거래 내역이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  recentTransactions.slice(0, 20).map((tx) => {
                    const tc = TX_TYPE_CONFIG[tx.type] || TX_TYPE_CONFIG.ADJUSTMENT;
                    return (
                      <TableRow key={tx.id} className="hover:bg-gray-50/50">
                        <TableCell className="pl-5">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 border-0 bg-gray-50 ${tc.className}`}
                          >
                            {tc.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {tx.amount > 0 ? (
                              <TrendingUp className="size-3 text-emerald-500" />
                            ) : (
                              <TrendingDown className="size-3 text-red-400" />
                            )}
                            <span
                              className={cn(
                                "text-[13px] font-medium",
                                tx.amount > 0
                                  ? "text-emerald-600"
                                  : "text-red-500",
                              )}
                            >
                              {tx.amount > 0 ? "+" : ""}
                              {formatNumber(tx.amount)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-[13px] text-gray-600">
                          {formatNumber(tx.balanceAfter)}
                        </TableCell>
                        <TableCell className="text-[12px] text-gray-500 max-w-[200px] truncate">
                          {tx.description || "-"}
                        </TableCell>
                        <TableCell className="text-[12px] text-gray-400 pr-5">
                          {formatDateTime(tx.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Staff List */}
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
            <UserCog className="size-4 text-gray-400" strokeWidth={1.8} />
            <h3 className="text-[14px] font-semibold text-gray-800">
              직원 목록
            </h3>
          </div>
          <div className="p-3 space-y-1">
            {staff.length === 0 ? (
              <p className="text-center text-[13px] text-gray-400 py-6">
                직원이 없습니다
              </p>
            ) : (
              staff.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold">
                    {member.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-gray-800 truncate">
                        {member.name}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[9px] px-1.5 border-0",
                          member.role === "DIRECTOR"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-gray-100 text-gray-500",
                        )}
                      >
                        {member.role === "DIRECTOR" ? "원장" : "강사"}
                      </Badge>
                      {!member.isActive && (
                        <Badge
                          variant="secondary"
                          className="text-[9px] px-1.5 border-0 bg-red-50 text-red-500"
                        >
                          비활성
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Mail className="size-3 text-gray-300" />
                      <span className="text-[11px] text-gray-400 truncate">
                        {member.email}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Content Browser */}
      <AcademyContentBrowser
        academyId={data.id}
        passageCount={usageStats.passageCount}
        questionCount={usageStats.questionCount}
        examCount={usageStats.examCount}
      />

      {/* Credit Adjustment Dialog */}
      <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-[16px]">크레딧 조정</DialogTitle>
            <DialogDescription className="text-[13px]">
              <strong>{data.name}</strong>의 크레딧을 추가하거나 차감합니다.
              현재 잔액:{" "}
              <strong>{formatNumber(creditBalance?.balance ?? 0)}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[12px] font-medium text-gray-600">
                금액 (양수 = 추가, 음수 = 차감)
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => {
                    const v = parseInt(adjustAmount) || 0;
                    setAdjustAmount(String(v - 100));
                  }}
                >
                  <Minus className="size-3.5" />
                </Button>
                <Input
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="h-9 text-[13px] text-center flex-1"
                  placeholder="0"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => {
                    const v = parseInt(adjustAmount) || 0;
                    setAdjustAmount(String(v + 100));
                  }}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[12px] font-medium text-gray-600">
                사유
              </Label>
              <textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="크레딧 조정 사유를 입력하세요"
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 resize-none"
              />
            </div>

            {adjustAmount && parseInt(adjustAmount) !== 0 && (
              <div className="rounded-lg bg-gray-50 p-3 text-[12px] text-gray-500">
                조정 후 잔액:{" "}
                <strong className="text-gray-800">
                  {formatNumber(
                    (creditBalance?.balance ?? 0) +
                      (parseInt(adjustAmount) || 0),
                  )}
                </strong>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdjust(false)}
              disabled={adjusting}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleAdjust}
              disabled={
                !adjustAmount ||
                parseInt(adjustAmount) === 0 ||
                !adjustReason.trim() ||
                adjusting
              }
            >
              {adjusting ? (
                <div className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  조정 중...
                </div>
              ) : (
                "조정 적용"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
