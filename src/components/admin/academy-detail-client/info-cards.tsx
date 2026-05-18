"use client";

import {
  Coins,
  CreditCard,
  FileText,
  Users,
} from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AcademyDetailData } from "./types";

interface InfoCardsProps {
  data: AcademyDetailData;
  isLowCredit: boolean;
  onAdjustClick: () => void;
}

export function InfoCards({
  data,
  isLowCredit,
  onAdjustClick,
}: InfoCardsProps) {
  const { creditBalance, subscription, usageStats, staff } = data;

  return (
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
            onClick={onAdjustClick}
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
              {subscription.status === "ACTIVE"
                ? "활성"
                : subscription.status === "CANCELLED"
                  ? "취소됨"
                  : subscription.status === "EXPIRED"
                    ? "만료"
                    : subscription.status}
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
  );
}
