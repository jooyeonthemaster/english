"use client";

// ---------------------------------------------------------------------------
// 태블릿 시험 배포 모달 (26-07-09 시험지 배포·OMR 대개편, 설계 §5-V1)
//
// 자급자족 컴포넌트 — 열릴 때 스스로 할당 현황(getExamAssignments)과 로스터
// (getAssignableStudents)를 로드한다. 빌더 툴바(V1) 외에 시험지 상세·목록
// 카드(V4/V6)에서도 같은 계약으로 재사용한다:
//   <ExamDeployModal examId examTitle open onOpenChange />
//
// 전 액션 useTransition + 토스트, 처리 중 일괄 비활성. 이 모달이 다루는 링크
// (/t/[token])는 학생 공개면 — 정답·점수 데이터는 이 컴포넌트에 존재하지 않는다
// (서버 액션 반환 자체가 요약 뿐, 설계 §6-1).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmNative } from "@/lib/browser-confirm";
import {
  assignStudentsToExam,
  getAssignableStudents,
  getExamAssignments,
  resetSubmission,
  rotateToken,
  setAssignmentMode,
  toggleAccess,
  unassignStudent,
  type AssignableStudentsData,
  type AssignmentActionResult,
  type ExamAssignMode,
  type ExamAssignmentItem,
} from "@/actions/exams/assignments";
import { StudentPicker } from "./exam-deploy-modal-parts/student-picker";
import { AssignmentTable } from "./exam-deploy-modal-parts/assignment-table";
import { SharedQrSection } from "./exam-deploy-modal-parts/shared-qr-section";

export function ExamDeployModal({
  examId,
  examTitle,
  subject,
  open,
  onOpenChange,
}: {
  examId: string;
  examTitle: string;
  /** exam.subject — KOREAN 이면 공유 QR 배포 비활성(설계 §6-7). 선택. */
  subject?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [assignments, setAssignments] = useState<ExamAssignmentItem[] | null>(
    null,
  );
  const [roster, setRoster] = useState<AssignableStudentsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ExamAssignMode>("TABLET");

  const refresh = useCallback(async (): Promise<boolean> => {
    const [assignmentsRes, rosterRes] = await Promise.all([
      getExamAssignments(examId),
      getAssignableStudents({ examId }),
    ]);
    if (
      !assignmentsRes.success ||
      !assignmentsRes.data ||
      !rosterRes.success ||
      !rosterRes.data
    ) {
      setLoadError(
        assignmentsRes.error ??
          rosterRes.error ??
          "배포 정보를 불러오지 못했습니다.",
      );
      return false;
    }
    setAssignments(assignmentsRes.data);
    setRoster(rosterRes.data);
    setLoadError(null);
    return true;
  }, [examId]);

  // 열릴 때마다 최신 상태 로드 — 첫 로드만 스켈레톤, 재오픈은 조용히 갱신.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSelectedIds(new Set());
    if (assignments === null) setLoading(true);
    void refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // assignments 는 "첫 로드 여부" 판정에만 쓰므로 의존성에서 제외(재오픈 감지는 open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refresh]);

  /** 공용 액션 러너 — 실패 토스트·성공 토스트·현황 재로드까지 한 벌 */
  function runAction<T>(
    action: () => Promise<AssignmentActionResult<T>>,
    successMessage: string,
    onSuccess?: (data: T | undefined) => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? "처리 중 오류가 발생했습니다.");
        return;
      }
      if (successMessage) toast.success(successMessage);
      onSuccess?.(result.data);
      await refresh();
    });
  }

  function handleToggleStudent(studentId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function handleAssign() {
    const studentIds = [...selectedIds];
    if (studentIds.length === 0) {
      toast.error("할당할 학생을 선택해 주세요.");
      return;
    }
    startTransition(async () => {
      const result = await assignStudentsToExam({ examId, studentIds, mode });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "학생 할당 중 오류가 발생했습니다.");
        return;
      }
      const { assigned, skipped } = result.data;
      if (assigned.length > 0) {
        toast.success(`학생 ${assigned.length}명에게 시험을 할당했습니다.`);
      }
      if (skipped.length > 0) {
        toast.message(`${skipped.length}명은 건너뛰었습니다.`, {
          description: skipped[0].reason,
        });
      }
      setSelectedIds(new Set());
      await refresh();
    });
  }

  async function handleCopyLink(tokenPath: string) {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${tokenPath}`,
      );
      toast.success("응시 링크를 복사했습니다.");
    } catch {
      toast.error("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    }
  }

  function handleChangeMode(submissionId: string, nextMode: ExamAssignMode) {
    runAction(
      () => setAssignmentMode(submissionId, nextMode),
      "응시 모드를 변경했습니다.",
    );
  }

  function handleToggleAccess(submissionId: string, enabled: boolean) {
    runAction(
      () => toggleAccess(submissionId, enabled),
      enabled ? "응시 링크를 다시 활성화했습니다." : "응시 링크를 회수했습니다.",
    );
  }

  function handleRotateToken(submissionId: string, studentName: string) {
    if (
      !confirmNative(
        `${studentName} 학생의 응시 링크를 재발급하시겠습니까?`,
        "기존 링크는 즉시 사용할 수 없게 됩니다.",
      )
    ) {
      return;
    }
    runAction(() => rotateToken(submissionId), "새 응시 링크를 발급했습니다.");
  }

  function handleReset(submissionId: string, studentName: string) {
    if (
      !confirmNative(
        `${studentName} 학생을 재응시 처리하시겠습니까?`,
        "답안과 채점 결과가 초기화됩니다. 기존 링크는 무효화되고 새 링크가 발급됩니다.",
      )
    ) {
      return;
    }
    runAction(() => resetSubmission(submissionId), "응시가 초기화되었습니다.");
  }

  function handleUnassign(submissionId: string, studentName: string) {
    if (!confirmNative(`${studentName} 학생의 할당을 해제하시겠습니까?`)) {
      return;
    }
    runAction(() => unassignStudent(submissionId), "할당을 해제했습니다.");
  }

  const submittedCount =
    assignments?.filter(
      (row) => row.status === "SUBMITTED" || row.status === "GRADED",
    ).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="no-print flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {/* 헤더 — 시험지명 + 할당 요약 */}
        <DialogHeader className="shrink-0 border-b border-[#E5E8EB] px-5 pb-4 pt-5">
          <DialogTitle className="text-[16px] font-bold text-slate-900">
            태블릿 시험 배포
          </DialogTitle>
          <DialogDescription className="truncate text-[13px] font-semibold text-slate-600">
            {examTitle}
          </DialogDescription>
          <p className="text-[12px] font-semibold text-[#8B95A1]">
            {assignments === null
              ? "할당 현황을 불러오는 중입니다."
              : `학생 ${assignments.length}명 · 제출 ${submittedCount}명`}
          </p>
        </DialogHeader>

        {/* 본문 — 내부 스크롤 */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="space-y-3" aria-label="배포 정보를 불러오는 중">
              <div className="h-11 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-28 animate-pulse rounded-lg bg-slate-100" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/60 px-4 py-8 text-center">
              <p className="text-[13px] font-semibold text-red-600">
                {loadError}
              </p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void refresh().finally(() => setLoading(false));
                }}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-[#E5E8EB] bg-white px-4 text-[13px] font-bold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                다시 시도
              </button>
            </div>
          ) : roster && assignments ? (
            <>
              {/* 공유 QR 배포(자기등록) — 개별 링크 방식과 시각적으로 구분되는
                  별도 카드(설계 §6.9 Wave-3). 스스로 getExamEnrollment 로드. */}
              <SharedQrSection examId={examId} open={open} subject={subject} />
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-[#E5E8EB]" />
                <span className="text-[11px] font-bold text-[#8B95A1]">
                  또는 개별 링크로 배포
                </span>
                <span className="h-px flex-1 bg-[#E5E8EB]" />
              </div>
              <section className="space-y-2.5">
                <h3 className="text-[13px] font-bold text-slate-800">
                  학생 추가
                </h3>
                <StudentPicker
                  roster={roster}
                  selectedIds={selectedIds}
                  onToggleStudent={handleToggleStudent}
                  mode={mode}
                  onModeChange={setMode}
                  onAssign={handleAssign}
                  pending={isPending}
                />
              </section>
              <section className="space-y-2.5">
                <h3 className="text-[13px] font-bold text-slate-800">
                  할당 현황
                  {assignments.length > 0 && (
                    <span className="ml-1.5 font-semibold text-[#8B95A1]">
                      {assignments.length}명
                    </span>
                  )}
                </h3>
                <AssignmentTable
                  assignments={assignments}
                  pending={isPending}
                  onChangeMode={handleChangeMode}
                  onCopyLink={handleCopyLink}
                  onToggleAccess={handleToggleAccess}
                  onRotateToken={handleRotateToken}
                  onReset={handleReset}
                  onUnassign={handleUnassign}
                />
              </section>
            </>
          ) : null}
        </div>

        {/* 하단 — 채점 관리 딥링크(V4 응시 현황 탭) */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#E5E8EB] bg-slate-50/60 px-5 py-3">
          <p className="hidden text-[11px] font-semibold text-[#8B95A1] sm:block">
            링크를 받은 학생은 로그인 없이 응시할 수 있습니다.
          </p>
          <Link
            href={`/director/exams/${examId}?tab=deployment`}
            className="inline-flex h-11 items-center justify-center gap-1 rounded-lg px-3 text-[13px] font-bold text-[#3182F6] transition-colors hover:bg-blue-50"
          >
            응시 현황에서 채점 관리
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
