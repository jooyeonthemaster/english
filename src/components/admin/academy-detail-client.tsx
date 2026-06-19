"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { adjustCredits } from "@/actions/admin";
import { AcademyContentBrowser } from "./academy-content-browser";
import { AcademyActivityTimeline } from "./academy-detail-client/activity-timeline";
import type { AcademyDetailData } from "./academy-detail-client/types";
import { InfoCards } from "./academy-detail-client/info-cards";
import { TransactionsTable } from "./academy-detail-client/transactions-table";
import { StaffList } from "./academy-detail-client/staff-list";
import { AdjustCreditDialog } from "./academy-detail-client/adjust-credit-dialog";

interface AcademyDetailClientProps {
  data: AcademyDetailData;
}

export function AcademyDetailClient({ data }: AcademyDetailClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Credit adjustment dialog
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const { creditBalance, recentTransactions, usageStats, staff } = data;

  const isLowCredit = !!(
    creditBalance && creditBalance.balance <= creditBalance.lowCreditThreshold
  );

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
          {data.status === "ACTIVE"
            ? "활성"
            : data.status === "TRIAL"
              ? "체험"
              : data.status === "SUSPENDED"
                ? "정지"
                : data.status === "DEACTIVATED"
                  ? "비활성"
                  : data.status}
        </Badge>
      </div>

      {/* Info cards row */}
      <InfoCards
        data={data}
        isLowCredit={isLowCredit}
        onAdjustClick={() => setShowAdjust(true)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Credit Transactions */}
        <TransactionsTable transactions={recentTransactions} />

        {/* Staff List */}
        <StaffList staff={staff} />
      </div>

      {/* Content Browser */}
      <AcademyContentBrowser
        academyId={data.id}
        passageCount={usageStats.passageCount}
        questionCount={usageStats.questionCount}
        examCount={usageStats.examCount}
      />

      {/* 활동 · 생성 콘텐츠 — 만든 시험지/지문/업로드 자료를 바로 보고 다운로드 */}
      <AcademyActivityTimeline academyId={data.id} />

      {/* Credit Adjustment Dialog */}
      <AdjustCreditDialog
        open={showAdjust}
        onOpenChange={setShowAdjust}
        academyName={data.name}
        currentBalance={creditBalance?.balance ?? 0}
        amount={adjustAmount}
        onAmountChange={setAdjustAmount}
        reason={adjustReason}
        onReasonChange={setAdjustReason}
        adjusting={adjusting}
        onConfirm={handleAdjust}
      />
    </>
  );
}
