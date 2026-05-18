"use client";

import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import type { AnalyticsData } from "./types";

// ---------------------------------------------------------------------------
// 성적 분석 탭
// ---------------------------------------------------------------------------

export function AnalyticsTab({ analytics }: { analytics: AnalyticsData | null }) {
  if (!analytics || analytics.totalStudents === 0) {
    return (
      <div className="rounded-xl border border-[#E5E8EB] bg-white p-12 text-center text-[#8B95A1]">
        <BarChart3 className="size-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">채점된 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score Summary */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="평균" value={analytics.avgScore} valueClassName="text-[#3182F6]" />
        <SummaryCard label="최고점" value={analytics.maxScore} valueClassName="text-emerald-600" />
        <SummaryCard label="최저점" value={analytics.minScore} valueClassName="text-red-500" />
        <SummaryCard label="응시자" value={analytics.totalStudents} valueClassName="text-[#191F28]" />
      </div>

      {/* Score Distribution */}
      <div className="rounded-xl border border-[#E5E8EB] bg-white p-5">
        <h3 className="text-sm font-semibold text-[#191F28] mb-4">점수 분포</h3>
        <div className="flex items-end gap-2 h-40">
          {analytics.distribution.map((count, i) => {
            const max = Math.max(...analytics.distribution, 1);
            const height = (count / max) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-[#8B95A1]">{count}</span>
                <div
                  className={cn(
                    "w-full rounded-t transition-all",
                    i >= 9
                      ? "bg-emerald-400"
                      : i >= 7
                        ? "bg-blue-400"
                        : i >= 5
                          ? "bg-amber-400"
                          : "bg-red-400",
                  )}
                  style={{ height: `${Math.max(height, 4)}%` }}
                />
                <span className="text-[10px] text-[#8B95A1]">{i * 10}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Question Analysis */}
      <div className="rounded-xl border border-[#E5E8EB] bg-white p-5">
        <h3 className="text-sm font-semibold text-[#191F28] mb-4">문항별 정답률</h3>
        <div className="space-y-3">
          {analytics.questionAnalysis.map((qa) => (
            <div key={qa.questionId} className="flex items-center gap-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-[#F7F8FA] text-xs font-bold text-[#4E5968] shrink-0">
                {qa.orderNum}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#191F28] truncate mb-1">{qa.questionText}</p>
                <div className="flex items-center gap-2">
                  <Progress value={qa.correctRate} className="h-2 flex-1" />
                  <span
                    className={cn(
                      "text-xs font-medium min-w-[36px] text-right",
                      qa.correctRate >= 70
                        ? "text-emerald-600"
                        : qa.correctRate >= 40
                          ? "text-amber-600"
                          : "text-red-600",
                    )}
                  >
                    {qa.correctRate}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E8EB] bg-white p-4 text-center">
      <p className="text-xs text-[#8B95A1]">{label}</p>
      <p className={cn("text-2xl font-bold", valueClassName)}>{value}</p>
    </div>
  );
}
