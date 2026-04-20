"use client";

// ---------------------------------------------------------------------------
// Passage → Exam quick-add dialog
//
// The passage detail page used to navigate to `/director/exams?passageIds=...`
// which was a dead-end (the exams list ignores that param). This dialog
// replaces that link with two actionable branches:
//
//   1. "새 시험 만들기" — takes a title, calls `createExam` to spawn a DRAFT
//      exam, then auto-links the passage's saved questions via
//      `addQuestionsToExam` and navigates to the exam builder.
//
//   2. "기존 DRAFT 시험에 추가" — fetches the academy's DRAFT exams via
//      `getDraftExamsForPicker`, lets the teacher pick one, then calls
//      `addQuestionsToExam` and redirects to that exam.
//
// Both branches short-circuit with a clear empty-state if the passage has
// zero saved questions yet, and guide the teacher to /generate instead.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FilePlus2,
  FileText,
  Layers,
  Loader2,
  PlusCircle,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getDraftExamsForPicker,
  getPassageQuestionIds,
} from "@/actions/workbench";
import { addQuestionsToExam, createExam } from "@/actions/exams";

interface DraftExamOption {
  id: string;
  title: string;
  type: string;
  examDate: Date | null;
  _count: { questions: number };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academyId: string;
  passageId: string;
  passageTitle: string;
}

type Mode = "new" | "existing";

export function PassageAddToExamDialog({
  open,
  onOpenChange,
  academyId,
  passageId,
  passageTitle,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("new");
  const [loadingExams, setLoadingExams] = useState(false);
  const [draftExams, setDraftExams] = useState<DraftExamOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [newExamTitle, setNewExamTitle] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [questionIds, setQuestionIds] = useState<string[] | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Reset local state whenever the dialog is reopened so stale selections
  // from a previous passage don't leak between invocations.
  useEffect(() => {
    if (!open) return;
    setMode("new");
    setSelectedExamId("");
    setNewExamTitle(`${passageTitle} - 시험지`);
    setQuestionIds(null);
  }, [open, passageTitle]);

  // Load the passage's question ids once per open — needed for both branches.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingQuestions(true);
    getPassageQuestionIds(passageId)
      .then((res) => {
        if (cancelled) return;
        setQuestionIds(res?.questionIds ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setQuestionIds([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingQuestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, passageId]);

  // Fetch DRAFT exams lazily — only when the user flips to the existing-exam tab.
  useEffect(() => {
    if (!open || mode !== "existing" || draftExams.length > 0) return;
    let cancelled = false;
    setLoadingExams(true);
    getDraftExamsForPicker(academyId)
      .then((rows) => {
        if (cancelled) return;
        setDraftExams(rows as DraftExamOption[]);
      })
      .catch(() => {
        if (cancelled) return;
        setDraftExams([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingExams(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, academyId, draftExams.length]);

  const hasQuestions = (questionIds?.length ?? 0) > 0;

  const disableSubmit = useMemo(() => {
    if (submitting || loadingQuestions) return true;
    if (!hasQuestions) return true;
    if (mode === "new") return newExamTitle.trim().length === 0;
    return selectedExamId.length === 0;
  }, [
    submitting,
    loadingQuestions,
    hasQuestions,
    mode,
    newExamTitle,
    selectedExamId,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!hasQuestions || !questionIds) return;
    setSubmitting(true);
    try {
      if (mode === "new") {
        const created = await createExam(academyId, {
          title: newExamTitle.trim() || `${passageTitle} - 시험지`,
          type: "OFFLINE",
          totalPoints: questionIds.length,
        });
        if (!created.success || !created.id) {
          toast.error(created.error || "시험 생성 실패");
          return;
        }
        const linked = await addQuestionsToExam(created.id, questionIds);
        if (!linked.success) {
          toast.error(linked.error || "문제 연결 실패");
          return;
        }
        toast.success(
          `새 시험이 생성되었습니다. (${questionIds.length}문제 연결)`,
        );
        onOpenChange(false);
        router.push(`/director/exams/${created.id}`);
        return;
      }

      // Existing exam path.
      const linked = await addQuestionsToExam(selectedExamId, questionIds);
      if (!linked.success) {
        toast.error(linked.error || "문제 연결 실패");
        return;
      }
      toast.success(`${questionIds.length}문제가 시험에 추가되었습니다.`);
      onOpenChange(false);
      router.push(`/director/exams/${selectedExamId}`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "시험 추가 중 오류가 발생했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    academyId,
    hasQuestions,
    mode,
    newExamTitle,
    onOpenChange,
    passageTitle,
    questionIds,
    router,
    selectedExamId,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <FilePlus2 className="w-4 h-4 text-sky-600" />
            시험에 추가
          </DialogTitle>
          <DialogDescription className="text-[12px] text-slate-500">
            &ldquo;{passageTitle}&rdquo; 지문의 문제를 시험지에 연결합니다.
          </DialogDescription>
        </DialogHeader>

        {/* Empty-state: passage has no saved questions yet */}
        {loadingQuestions ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-[12px]">문제 확인 중...</span>
          </div>
        ) : !hasQuestions ? (
          <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-4 text-[12px] leading-relaxed text-slate-600">
            <div className="flex items-start gap-2">
              <Wand2 className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-slate-800 mb-1">
                  이 지문에는 아직 저장된 문제가 없습니다.
                </p>
                <p>
                  시험에 추가하려면 먼저 문제를 생성해야 합니다. 문제 생성
                  페이지로 이동해 주세요.
                </p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                닫기
              </Button>
              <Button
                size="sm"
                className="bg-sky-600 hover:bg-sky-700"
                onClick={() => {
                  onOpenChange(false);
                  router.push(
                    `/director/workbench/generate?passageIds=${encodeURIComponent(
                      passageId,
                    )}`,
                  );
                }}
              >
                <Layers className="w-3.5 h-3.5 mr-1" />
                문제 생성하러 가기
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Mode toggle */}
            <div
              role="tablist"
              aria-label="시험 추가 방식"
              className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "new"}
                onClick={() => setMode("new")}
                className={`flex items-center justify-center gap-1.5 h-8 rounded-md text-[12px] font-medium transition-colors ${
                  mode === "new"
                    ? "bg-white text-sky-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                새 시험 만들기
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "existing"}
                onClick={() => setMode("existing")}
                className={`flex items-center justify-center gap-1.5 h-8 rounded-md text-[12px] font-medium transition-colors ${
                  mode === "existing"
                    ? "bg-white text-sky-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                기존 시험에 추가
              </button>
            </div>

            {/* Form body */}
            <div className="space-y-3">
              {mode === "new" ? (
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-500">
                    시험지 제목
                  </span>
                  <input
                    autoFocus
                    value={newExamTitle}
                    onChange={(e) => setNewExamTitle(e.target.value)}
                    placeholder="예: 중간고사 모의고사 1회"
                    className="w-full h-9 px-3 text-[13px] rounded-lg border border-slate-200 bg-white outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/10"
                  />
                  <span className="text-[11px] text-slate-400">
                    DRAFT 상태로 생성되며, 배포 전 자유롭게 문제를 편집할 수
                    있습니다.
                  </span>
                </label>
              ) : (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-500">
                    DRAFT 시험 선택
                  </span>
                  {loadingExams ? (
                    <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-[12px] text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      시험 목록 불러오는 중...
                    </div>
                  ) : draftExams.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-[12px] text-slate-500">
                      추가 가능한 DRAFT 시험이 없습니다. &ldquo;새 시험
                      만들기&rdquo; 탭을 사용해 주세요.
                    </div>
                  ) : (
                    <Select
                      value={selectedExamId}
                      onValueChange={setSelectedExamId}
                    >
                      <SelectTrigger className="h-9 text-[13px]">
                        <SelectValue placeholder="시험지를 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {draftExams.map((exam) => (
                          <SelectItem key={exam.id} value={exam.id}>
                            <span className="truncate max-w-[280px] inline-block align-middle">
                              {exam.title}
                            </span>
                            <span className="ml-2 text-[10px] text-slate-400">
                              {exam._count.questions}문제
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Footer summary + actions */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">
                  연결 예정: <strong>{questionIds?.length ?? 0}문제</strong>
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    disabled={submitting}
                  >
                    취소
                  </Button>
                  <Button
                    size="sm"
                    className="bg-sky-600 hover:bg-sky-700"
                    onClick={handleSubmit}
                    disabled={disableSubmit}
                  >
                    {submitting ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <FilePlus2 className="w-3.5 h-3.5 mr-1" />
                    )}
                    {mode === "new" ? "시험 만들기" : "시험에 추가"}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
