"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  generateWeeklyReport,
  generateMonthlyReport,
  bulkGenerateReports,
  sendReport,
  bulkSendReports,
  updateReportComment,
  deleteReport,
} from "@/actions/reports";
import type { ReportListItem } from "@/actions/reports";
import { ReportsFiltersBar } from "./_components/reports-filters-bar";
import { ReportsTable } from "./_components/reports-table";
import {
  GenerateReportDialog,
  type GenerateReportPayload,
} from "./_components/generate-report-dialog";
import { ReportCommentDialog } from "./_components/report-comment-dialog";

export function ReportsManagementClient({
  reports: initialReports,
  classes,
  students,
}: {
  reports: ReportListItem[];
  classes: { id: string; name: string }[];
  students: { id: string; name: string }[];
}) {
  const [reports, setReports] = useState(initialReports);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [commentReportId, setCommentReportId] = useState("");
  const [commentText, setCommentText] = useState("");
  const [isPending, startTransition] = useTransition();

  // Filter reports
  const filtered = reports.filter((r) => {
    if (
      search &&
      !r.studentName.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (typeFilter !== "ALL" && r.type !== typeFilter) return false;
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    return true;
  });

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
  }

  function handleGenerate(payload: GenerateReportPayload) {
    startTransition(async () => {
      try {
        if (payload.scope === "STUDENT" && payload.studentId) {
          if (payload.type === "WEEKLY") {
            await generateWeeklyReport(payload.studentId);
          } else {
            await generateMonthlyReport(payload.studentId);
          }
          toast.success("리포트가 생성되었습니다");
        } else {
          const classId =
            payload.scope === "CLASS" ? payload.classId : undefined;
          const result = await bulkGenerateReports(payload.type, classId);
          toast.success(
            `${result.studentCount}명의 학생 리포트 ${result.totalGenerated}건 생성`
          );
        }
        setShowGenerateDialog(false);
        // Refresh page
        window.location.reload();
      } catch (error) {
        toast.error("리포트 생성 중 오류가 발생했습니다");
      }
    });
  }

  async function handleSend(reportId: string) {
    startTransition(async () => {
      try {
        await sendReport(reportId);
        setReports((prev) =>
          prev.map((r) =>
            r.id === reportId
              ? { ...r, status: "SENT", sentAt: new Date().toISOString() }
              : r
          )
        );
        toast.success("리포트가 발송되었습니다");
      } catch {
        toast.error("발송 중 오류가 발생했습니다");
      }
    });
  }

  async function handleBulkSend() {
    const draftIds = [...selectedIds].filter((id) => {
      const report = reports.find((r) => r.id === id);
      return report?.status === "DRAFT";
    });

    if (draftIds.length === 0) {
      toast.error("발송할 수 있는 초안 리포트가 없습니다");
      return;
    }

    startTransition(async () => {
      try {
        await bulkSendReports(draftIds);
        setReports((prev) =>
          prev.map((r) =>
            draftIds.includes(r.id)
              ? { ...r, status: "SENT", sentAt: new Date().toISOString() }
              : r
          )
        );
        setSelectedIds(new Set());
        toast.success(`${draftIds.length}건의 리포트가 발송되었습니다`);
      } catch {
        toast.error("일괄 발송 중 오류가 발생했습니다");
      }
    });
  }

  async function handleDelete(reportId: string) {
    if (!confirm("이 리포트를 삭제하시겠습니까?")) return;

    startTransition(async () => {
      try {
        await deleteReport(reportId);
        setReports((prev) => prev.filter((r) => r.id !== reportId));
        toast.success("리포트가 삭제되었습니다");
      } catch {
        toast.error("삭제 중 오류가 발생했습니다");
      }
    });
  }

  async function handleSaveComment() {
    if (!commentReportId) return;

    startTransition(async () => {
      try {
        await updateReportComment(commentReportId, commentText);
        setShowCommentDialog(false);
        toast.success("강사 코멘트가 저장되었습니다");
      } catch {
        toast.error("코멘트 저장 중 오류가 발생했습니다");
      }
    });
  }

  function handleOpenComment(reportId: string) {
    setCommentReportId(reportId);
    setCommentText("");
    setShowCommentDialog(true);
  }

  const draftCount = reports.filter((r) => r.status === "DRAFT").length;

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            학습 리포트 관리
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            학부모 리포트 생성 및 발송
          </p>
        </div>
        <Button
          onClick={() => setShowGenerateDialog(true)}
          className="gradient-primary text-white"
        >
          <Plus className="size-4 mr-1.5" />
          리포트 생성
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl bg-gray-50 p-4">
          <p className="text-xs text-gray-500">전체</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {reports.length}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 p-4">
          <p className="text-xs text-gray-500">초안</p>
          <p className="text-2xl font-bold text-gray-600 mt-1">{draftCount}</p>
        </div>
        <div className="rounded-xl bg-blue-50 p-4">
          <p className="text-xs text-blue-600">발송됨</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">
            {reports.filter((r) => r.status === "SENT").length}
          </p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-4">
          <p className="text-xs text-emerald-600">열람</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">
            {reports.filter((r) => r.status === "VIEWED").length}
          </p>
        </div>
      </div>

      <ReportsFiltersBar
        search={search}
        typeFilter={typeFilter}
        statusFilter={statusFilter}
        selectedCount={selectedIds.size}
        isPending={isPending}
        onSearchChange={setSearch}
        onTypeChange={setTypeFilter}
        onStatusChange={setStatusFilter}
        onBulkSend={handleBulkSend}
      />

      <ReportsTable
        reports={filtered}
        selectedIds={selectedIds}
        isPending={isPending}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onOpenComment={handleOpenComment}
        onSend={handleSend}
        onDelete={handleDelete}
      />

      <GenerateReportDialog
        open={showGenerateDialog}
        isPending={isPending}
        classes={classes}
        students={students}
        onOpenChange={setShowGenerateDialog}
        onSubmit={handleGenerate}
      />

      <ReportCommentDialog
        open={showCommentDialog}
        commentText={commentText}
        isPending={isPending}
        onOpenChange={setShowCommentDialog}
        onCommentChange={setCommentText}
        onSave={handleSaveComment}
      />
    </div>
  );
}
