"use client";

// ============================================================================
// 학생 시험 리포트 — 학생 관리 탭 (v3)
//   학생 테이블(이름/답안 수집/채점/점수/리포트/공유) + 학생 추가(별도 다이얼로그)
//   + 답안 링크 발급·복사 quick action + 삭제. 행 클릭 → 학생 워크스페이스
//   (답안 수집 → 정오표 → 리포트). answerSubmittedAt 라이브 갱신은 상위
//   워크스페이스 detail 폴링이 잇는다.
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Link2, Link2Off, MoreHorizontal, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  deleteExamStudent,
  disableAnswerLink,
  enableAnswerLink,
} from "@/actions/exam-report";
import { round2 } from "@/lib/exam-report/grading";
import type { ScoreSummary, StudentReportStatus } from "@/lib/exam-report/types";
import type { ExamAnalysisStudentRow, StudentsTabProps } from "../ui-contracts";
import { examReportBasePrefix } from "../grading/grading-shared";
import { AddStudentDialog } from "./add-student-dialog";

// ── 상태 뱃지 상수(soft: border + bg-50 + text-700) ─────────────────────────

interface BadgeSpec {
  label: string;
  className: string;
  pulse?: boolean;
}

const REPORT_BADGE: Record<StudentReportStatus, BadgeSpec> = {
  NONE: { label: "미생성", className: "border border-slate-200 bg-slate-50 text-slate-500" },
  GENERATING: { label: "생성 중", className: "border border-blue-200 bg-blue-50 text-blue-700", pulse: true },
  GENERATED: { label: "생성됨", className: "border border-emerald-200 bg-emerald-50 text-emerald-700" },
  FAILED: { label: "실패", className: "border border-rose-200 bg-rose-50 text-rose-700" },
};

type GradingBadge = "미채점" | "진행중" | "확정";

function gradingBadgeOf(
  gradingConfirmed: boolean,
  scoreSummary: ScoreSummary | null,
): GradingBadge {
  if (gradingConfirmed) return "확정";
  const graded =
    (scoreSummary?.correctCount ?? 0) +
    (scoreSummary?.wrongCount ?? 0) +
    (scoreSummary?.partialCount ?? 0);
  return graded > 0 ? "진행중" : "미채점";
}

const GRADING_BADGE: Record<GradingBadge, string> = {
  미채점: "border border-slate-200 bg-slate-50 text-slate-500",
  진행중: "border border-blue-200 bg-blue-50 text-blue-700",
  확정: "border border-emerald-200 bg-emerald-50 text-emerald-700",
};

/** 답안 링크 뱃지 — 제출됨(상대시간) > 링크 활성 > 링크 없음. */
function answerLinkBadgeOf(s: ExamAnalysisStudentRow): BadgeSpec {
  if (s.answerSubmittedAt) {
    return {
      label: `제출됨 ${formatRelativeTime(s.answerSubmittedAt)}`,
      className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (s.answerEnabled) {
    return {
      label: "링크 활성",
      className: "border border-blue-200 bg-blue-50 text-blue-700",
    };
  }
  return {
    label: "링크 없음",
    className: "border border-slate-200 bg-slate-50 text-slate-400",
  };
}

// ── 탭 본체 ─────────────────────────────────────────────────────────────────

export function StudentsTab({ detail, onDetailChange }: StudentsTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const base = examReportBasePrefix(pathname ?? "");

  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExamAnalysisStudentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 외부 진입 관례(허브 보드 CTA 등): ?openAddStudent=1 로 들어오면 마운트 시
  // 학생 추가 다이얼로그를 즉시 열고, 뒤로가기/새로고침에 재발화하지 않도록
  // 쿼리를 URL 에서 제거한다. (useSearchParams 대신 window 조회 — Suspense 경계 불요)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("openAddStudent") !== "1") return;
    setAddOpen(true);
    params.delete("openAddStudent");
    const qs = params.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ""}`, {
      scroll: false,
    });
  }, [router]);

  const students = detail.students;
  const studentHref = (sid: string) =>
    `${base}/workbench/exam-report/${detail.id}/students/${sid}`;

  function patchStudentRow(id: string, patch: Partial<ExamAnalysisStudentRow>) {
    onDetailChange({
      ...detail,
      students: students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteExamStudent(deleteTarget.id);
      onDetailChange({
        ...detail,
        students: students.filter((s) => s.id !== deleteTarget.id),
      });
      toast.success("학생을 삭제했습니다.");
      setDeleteTarget(null);
    } catch {
      toast.error("학생 삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  /** 답안 링크 quick action — 미발급이면 발급 후 복사, 발급돼 있으면 복사만. */
  async function handleCopyLink(s: ExamAnalysisStudentRow) {
    try {
      let token = s.answerEnabled ? s.answerToken : null;
      if (!token) {
        const res = await enableAnswerLink(s.id);
        token = res.token;
        patchStudentRow(s.id, { answerToken: token, answerEnabled: true });
      }
      await navigator.clipboard.writeText(`${window.location.origin}/a/${token}`);
      toast.success("답안 입력 링크를 복사했어요. 학생에게 전달하세요.");
    } catch {
      toast.error("답안 링크 처리에 실패했습니다. 다시 시도해 주세요.");
    }
  }

  async function handleDisableLink(s: ExamAnalysisStudentRow) {
    try {
      await disableAnswerLink(s.id);
      patchStudentRow(s.id, { answerToken: null, answerEnabled: false });
      toast.success("답안 링크를 껐어요.");
    } catch {
      toast.error("답안 링크 끄기에 실패했습니다.");
    }
  }

  return (
    <>
      <section className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Users className="h-4 w-4" />
            학생 {students.length}명
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => setAddOpen(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <UserPlus className="h-4 w-4" />
            학생 추가
          </Button>
        </div>

        {students.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Users className="mx-auto mb-3 h-12 w-12 text-slate-200" />
            <p className="font-medium text-slate-500">
              학생을 추가해 답안을 모아보세요
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
              학생을 추가하면 답안 링크를 발급해 학생이 직접 입력하게 하거나,
              채점 화면에서 선생님이 직접 입력해 채점하고 리포트를 만들 수
              있습니다.
            </p>
            <div className="mt-5 flex items-center justify-center">
              <Button
                type="button"
                onClick={() => setAddOpen(true)}
                className="h-10 bg-blue-600 px-5 text-[13.5px] font-semibold hover:bg-blue-700"
              >
                <UserPlus className="h-4 w-4" />
                학생 추가
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-2.5 font-medium">이름</th>
                  <th className="px-4 py-2.5 font-medium">답안 수집</th>
                  <th className="px-4 py-2.5 font-medium">채점</th>
                  <th className="px-4 py-2.5 font-medium">점수</th>
                  <th className="px-4 py-2.5 font-medium">리포트</th>
                  <th className="px-4 py-2.5 font-medium">공유</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const grading = gradingBadgeOf(s.gradingConfirmed, s.scoreSummary);
                  const report = REPORT_BADGE[s.reportStatus];
                  const link = answerLinkBadgeOf(s);
                  const score = s.scoreSummary;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => router.push(studentHref(s.id))}
                      className="cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-blue-50/40"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{s.studentName}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className={link.className}>{link.label}</Badge>
                          {/* 하위호환: 과거 사진 판독으로 등록된 학생만 표기 */}
                          {s.sourceFileCount > 0 && (
                            <span className="whitespace-nowrap text-xs text-slate-400">
                              사진 {s.sourceFileCount}장
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={GRADING_BADGE[grading]}>{grading}</Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {score && score.totalScore != null ? (
                          <span className="whitespace-nowrap">
                            {round2(score.totalScore)}
                            {score.maxScore != null ? (
                              <span className="text-slate-400"> / {round2(score.maxScore)}</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={report.className} pulse={report.pulse}>
                          {report.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            s.shareEnabled
                              ? "border border-blue-200 bg-blue-50 text-blue-700"
                              : "border border-slate-200 bg-slate-50 text-slate-400"
                          }
                        >
                          {s.shareEnabled ? "공개" : "비공개"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {/* 답안 링크 quick action(발급+복사) */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="답안 링크 복사"
                            title={
                              s.answerEnabled
                                ? "답안 링크 복사"
                                : "답안 링크 발급 후 복사"
                            }
                            onClick={() => void handleCopyLink(s)}
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="학생 메뉴"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(studentHref(s.id))}>
                                열기
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleCopyLink(s)}>
                                <Link2 className="h-4 w-4" />
                                {s.answerEnabled ? "답안 링크 복사" : "답안 링크 발급·복사"}
                              </DropdownMenuItem>
                              {s.answerEnabled && (
                                <DropdownMenuItem onClick={() => void handleDisableLink(s)}>
                                  <Link2Off className="h-4 w-4" />
                                  답안 링크 끄기
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteTarget(s)}
                              >
                                <Trash2 className="h-4 w-4" />
                                삭제
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AddStudentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        analysisId={detail.id}
        onAdded={(row) =>
          onDetailChange({ ...detail, students: [...detail.students, row] })
        }
      />

      {/* 삭제 확인 */}
      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.studentName} 학생을 삭제할까요?
            </AlertDialogTitle>
            <AlertDialogDescription>
              답안·채점 데이터와 생성된 리포트가 함께 보관 해제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Badge({
  className,
  pulse,
  children,
}: {
  className: string;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {pulse ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
