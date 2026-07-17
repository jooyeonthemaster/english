"use client";

import { FileText, Send, Trash2 } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ReportListItem } from "@/actions/reports";
import { STATUS_CONFIG, TYPE_LABELS } from "./report-constants";

interface ReportsTableProps {
  reports: ReportListItem[];
  selectedIds: Set<string>;
  isPending: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpenComment: (reportId: string) => void;
  onSend: (reportId: string) => void;
  onDelete: (reportId: string) => void;
}

export function ReportsTable({
  reports,
  selectedIds,
  isPending,
  onToggleSelect,
  onToggleSelectAll,
  onOpenComment,
  onSend,
  onDelete,
}: ReportsTableProps) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* 좁은 화면(모바일)에서 고정 6열 그리드가 잘리지 않도록 가로 스크롤.
          데스크톱은 컨테이너가 min-w 보다 넓어 스크롤이 생기지 않아 동일하게 렌더된다. */}
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
      {/* Table Header */}
      <div className="grid grid-cols-[40px_1fr_80px_80px_100px_120px] gap-2 px-4 py-3 bg-gray-50 text-xs font-semibold text-gray-500">
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={
              selectedIds.size > 0 && selectedIds.size === reports.length
            }
            onChange={onToggleSelectAll}
            className="rounded border-gray-300"
            aria-label="전체 선택"
          />
        </div>
        <div>학생 / 학부모</div>
        <div className="text-center">유형</div>
        <div className="text-center">상태</div>
        <div className="text-center">생성일</div>
        <div className="text-center">작업</div>
      </div>

      {/* Rows */}
      {reports.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          리포트가 없습니다
        </div>
      ) : (
        reports.map((report) => {
          const statusInfo =
            STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;

          return (
            <div
              key={report.id}
              className="grid grid-cols-[40px_1fr_80px_80px_100px_120px] gap-2 px-4 py-3 border-t border-gray-100 items-center text-sm hover:bg-gray-50 transition-colors"
            >
              <div>
                <input
                  type="checkbox"
                  checked={selectedIds.has(report.id)}
                  onChange={() => onToggleSelect(report.id)}
                  className="rounded border-gray-300"
                  aria-label={`${report.studentName} 리포트 선택`}
                />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-800 truncate">
                  {report.studentName}
                </p>
                {report.parentName && (
                  <p className="text-xs text-gray-400 truncate">
                    {report.parentName} 학부모
                  </p>
                )}
              </div>
              <div className="text-center">
                <Badge variant="secondary" className="text-[10px]">
                  {TYPE_LABELS[report.type] || report.type}
                </Badge>
              </div>
              <div className="text-center">
                <Badge
                  className={cn("text-[10px] font-semibold", statusInfo.color)}
                >
                  {statusInfo.label}
                </Badge>
              </div>
              <div className="text-center text-xs text-gray-500">
                {formatDate(report.createdAt)}
              </div>
              <div className="flex items-center justify-center gap-1">
                {report.status === "DRAFT" && (
                  <>
                    <button
                      onClick={() => onOpenComment(report.id)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title="코멘트 추가"
                      aria-label="코멘트 추가"
                    >
                      <FileText className="size-3.5" />
                    </button>
                    <button
                      onClick={() => onSend(report.id)}
                      disabled={isPending}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 hover:text-blue-600 transition-colors"
                      title="발송"
                      aria-label="발송"
                    >
                      <Send className="size-3.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => onDelete(report.id)}
                  disabled={isPending}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  title="삭제"
                  aria-label="삭제"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })
      )}
        </div>
      </div>
    </div>
  );
}
