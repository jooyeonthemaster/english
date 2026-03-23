"use client";

import Link from "next/link";
import { FileText, Eye, Send, ChevronRight } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ParentReportSummary } from "@/actions/parent";

const TYPE_LABELS: Record<string, string> = {
  WEEKLY: "주간",
  MONTHLY: "월간",
  CUSTOM: "특별",
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  SENT: { label: "발송됨", color: "bg-blue-100 text-blue-700", icon: Send },
  VIEWED: { label: "열람", color: "bg-emerald-100 text-emerald-700", icon: Eye },
};

export function ReportsClient({
  reports,
}: {
  reports: ParentReportSummary[];
}) {
  return (
    <div className="px-5 pt-6 pb-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">학습 리포트</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          학원에서 발송한 학습 분석 리포트
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <FileText className="size-12 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">
            아직 발송된 리포트가 없습니다
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => {
            const statusInfo = STATUS_MAP[report.status] || STATUS_MAP.SENT;
            const StatusIcon = statusInfo.icon;

            return (
              <Link
                key={report.id}
                href={`/parent/reports/${report.id}`}
                className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors min-h-[64px]"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex-shrink-0">
                  <FileText className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800">
                      {report.studentName}{" "}
                      {TYPE_LABELS[report.type] || report.type} 리포트
                    </p>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {formatDate(report.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge
                    className={cn(
                      "text-[10px] font-semibold flex items-center gap-1",
                      statusInfo.color
                    )}
                  >
                    <StatusIcon className="size-3" />
                    {statusInfo.label}
                  </Badge>
                  <ChevronRight className="size-4 text-gray-300" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
