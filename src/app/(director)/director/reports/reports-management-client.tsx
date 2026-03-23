"use client";

import { useState, useTransition } from "react";
import {
  FileText,
  Send,
  Eye,
  Clock,
  Users,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Filter,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

const TYPE_LABELS: Record<string, string> = {
  WEEKLY: "주간",
  MONTHLY: "월간",
  CUSTOM: "특별",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  DRAFT: { label: "초안", color: "bg-gray-100 text-gray-600", icon: Clock },
  SENT: { label: "발송됨", color: "bg-blue-100 text-blue-700", icon: Send },
  VIEWED: {
    label: "열람",
    color: "bg-emerald-100 text-emerald-700",
    icon: Eye,
  },
};

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
  const [generateType, setGenerateType] = useState<"WEEKLY" | "MONTHLY">(
    "WEEKLY"
  );
  const [generateScope, setGenerateScope] = useState("ALL");
  const [generateClassId, setGenerateClassId] = useState("");
  const [generateStudentId, setGenerateStudentId] = useState("");
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

  async function handleGenerate() {
    startTransition(async () => {
      try {
        if (generateScope === "STUDENT" && generateStudentId) {
          if (generateType === "WEEKLY") {
            await generateWeeklyReport(generateStudentId);
          } else {
            await generateMonthlyReport(generateStudentId);
          }
          toast.success("리포트가 생성되었습니다");
        } else {
          const classId =
            generateScope === "CLASS" ? generateClassId : undefined;
          const result = await bulkGenerateReports(generateType, classId);
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
          <p className="text-2xl font-bold text-gray-600 mt-1">
            {draftCount}
          </p>
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

      {/* Filters & Bulk Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="학생 이름으로 검색"
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 유형</SelectItem>
            <SelectItem value="WEEKLY">주간</SelectItem>
            <SelectItem value="MONTHLY">월간</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 상태</SelectItem>
            <SelectItem value="DRAFT">초안</SelectItem>
            <SelectItem value="SENT">발송됨</SelectItem>
            <SelectItem value="VIEWED">열람</SelectItem>
          </SelectContent>
        </Select>
        {selectedIds.size > 0 && (
          <Button
            onClick={handleBulkSend}
            disabled={isPending}
            size="sm"
            className="bg-blue-500 text-white hover:bg-blue-600"
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            ) : (
              <Send className="size-4 mr-1.5" />
            )}
            선택 발송 ({selectedIds.size}건)
          </Button>
        )}
      </div>

      {/* Report List */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[40px_1fr_80px_80px_100px_120px] gap-2 px-4 py-3 bg-gray-50 text-xs font-semibold text-gray-500">
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={
                selectedIds.size > 0 &&
                selectedIds.size === filtered.length
              }
              onChange={toggleSelectAll}
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
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            리포트가 없습니다
          </div>
        ) : (
          filtered.map((report) => {
            const statusInfo =
              STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;
            const StatusIcon = statusInfo.icon;

            return (
              <div
                key={report.id}
                className="grid grid-cols-[40px_1fr_80px_80px_100px_120px] gap-2 px-4 py-3 border-t border-gray-100 items-center text-sm hover:bg-gray-50 transition-colors"
              >
                <div>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(report.id)}
                    onChange={() => toggleSelect(report.id)}
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
                    className={cn(
                      "text-[10px] font-semibold",
                      statusInfo.color
                    )}
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
                        onClick={() => {
                          setCommentReportId(report.id);
                          setCommentText("");
                          setShowCommentDialog(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                        title="코멘트 추가"
                        aria-label="코멘트 추가"
                      >
                        <FileText className="size-3.5" />
                      </button>
                      <button
                        onClick={() => handleSend(report.id)}
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
                    onClick={() => handleDelete(report.id)}
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

      {/* Generate Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>리포트 생성</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                리포트 유형
              </label>
              <Select
                value={generateType}
                onValueChange={(v) =>
                  setGenerateType(v as "WEEKLY" | "MONTHLY")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">주간 리포트</SelectItem>
                  <SelectItem value="MONTHLY">월간 리포트</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                대상
              </label>
              <Select
                value={generateScope}
                onValueChange={setGenerateScope}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체 학생</SelectItem>
                  <SelectItem value="CLASS">반별</SelectItem>
                  <SelectItem value="STUDENT">개별 학생</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {generateScope === "CLASS" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  반 선택
                </label>
                <Select
                  value={generateClassId}
                  onValueChange={setGenerateClassId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="반을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {generateScope === "STUDENT" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  학생 선택
                </label>
                <Select
                  value={generateStudentId}
                  onValueChange={setGenerateStudentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="학생을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowGenerateDialog(false)}
            >
              취소
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={isPending}
              className="gradient-primary text-white"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                  생성 중...
                </>
              ) : (
                "생성하기"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comment Dialog */}
      <Dialog open={showCommentDialog} onOpenChange={setShowCommentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>강사 코멘트 추가</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="학생에 대한 개인적인 코멘트를 작성하세요..."
              className="w-full min-h-[120px] px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCommentDialog(false)}
            >
              취소
            </Button>
            <Button
              onClick={handleSaveComment}
              disabled={isPending}
              className="gradient-primary text-white"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : null}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
