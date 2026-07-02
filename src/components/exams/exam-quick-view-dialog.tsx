"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, FileText, Loader2, Pencil, PencilLine, Send, X } from "lucide-react";
import { toast } from "sonner";
import { getExam, publishExam, updateExam } from "@/actions/exams";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";
import { ExamDetailPaperPreview } from "./exam-detail-paper-preview";
import { ExamQuestionCard } from "./exam-detail-client-parts/exam-question-card";
import { STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from "./exam-detail-client-parts/constants";
import type { ExamDetail } from "./exam-detail-client-parts/types";

interface ExamQuickViewDialogProps {
  examId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExamQuickViewDialog({
  examId,
  open,
  onOpenChange,
}: ExamQuickViewDialogProps) {
  const router = useRouter();
  const [loadResult, setLoadResult] = useState<{
    examId: string;
    exam: ExamDetail | null;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const exam = loadResult?.examId === examId ? loadResult.exam : null;
  const loading = open && Boolean(examId) && loadResult?.examId !== examId;

  useEffect(() => {
    if (!open || !examId) return;

    let cancelled = false;

    getExam(examId)
      .then((row) => {
        if (cancelled) return;
        setLoadResult({ examId, exam: (row as ExamDetail | null) ?? null });
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "시험지를 불러오지 못했습니다.",
        );
        setLoadResult({ examId, exam: null });
      });

    return () => {
      cancelled = true;
    };
  }, [examId, open]);

  // 다른 시험지를 열거나 팝업을 닫으면 제목 편집 상태를 초기화한다.
  useEffect(() => {
    setEditingTitle(false);
  }, [examId, open]);

  function startEditTitle() {
    if (!exam) return;
    setTitleDraft(exam.title);
    setEditingTitle(true);
  }

  async function handleSaveTitle() {
    if (!exam) return;
    const next = titleDraft.trim();
    if (!next || next === exam.title) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    const result = await updateExam(exam.id, { title: next });
    setSavingTitle(false);
    if (!result.success) {
      toast.error(result.error || "제목 수정에 실패했습니다.");
      return;
    }
    setLoadResult({ examId: exam.id, exam: { ...exam, title: next } });
    setEditingTitle(false);
    router.refresh();
  }

  function handleEdit() {
    if (!examId) return;
    onOpenChange(false);
    router.push(`/director/workbench/exams/${examId}/edit`);
  }

  function handlePublish() {
    if (!exam) return;
    startTransition(async () => {
      const result = await publishExam(exam.id);
      if (!result.success) {
        toast.error(result.error || "배포에 실패했습니다.");
        return;
      }
      toast.success("시험이 배포되었습니다.");
      setLoadResult({ examId: exam.id, exam: { ...exam, status: "PUBLISHED" } });
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none lg:h-[calc(100dvh-2rem)] lg:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-5 pb-1.5 pt-2.5 pr-14">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {editingTitle && exam ? (
                <>
                  {/* Radix는 DialogTitle 존재를 요구하므로 편집 중엔 sr-only로 유지 */}
                  <DialogTitle className="sr-only">{exam.title}</DialogTitle>
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleSaveTitle();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setEditingTitle(false);
                        }
                      }}
                      disabled={savingTitle}
                      className="min-w-0 flex-1 rounded-md border border-blue-300 bg-white px-2 py-0.5 text-xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveTitle()}
                      disabled={savingTitle}
                      title="저장"
                      aria-label="제목 저장"
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {savingTitle ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTitle(false)}
                      disabled={savingTitle}
                      title="취소"
                      aria-label="제목 수정 취소"
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <DialogTitle className="truncate text-xl font-bold text-slate-900">
                    {exam?.title || "시험지 빠른 보기"}
                  </DialogTitle>
                  {exam && (
                    <button
                      type="button"
                      onClick={startEditTitle}
                      title="제목 수정"
                      aria-label="제목 수정"
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Pencil className="size-4" />
                    </button>
                  )}
                </div>
              )}
              <DialogDescription className="sr-only">
                시험지 미리보기와 문제 목록을 확인합니다.
              </DialogDescription>
              {exam && (
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span>{TYPE_LABELS[exam.type] || exam.type}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLORS[exam.status] || "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {STATUS_LABELS[exam.status] || exam.status}
                  </span>
                  {exam.class && <span>{exam.class.name}</span>}
                  {exam.examDate && <span>{formatDate(exam.examDate)}</span>}
                  <span>{exam.totalPoints}점</span>
                  <span>{exam.questions.length}문항</span>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {exam?.status === "DRAFT" && (
                <Button
                  onClick={handlePublish}
                  disabled={isPending || exam.questions.length === 0}
                  className="h-7 gap-1.5 rounded-md px-2.5 text-[11px] font-semibold"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  배포하기
                </Button>
              )}
              <button
                type="button"
                onClick={handleEdit}
                disabled={!examId}
                title="시험지 수정"
                aria-label="시험지 수정"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-[11px] font-semibold text-blue-700 transition-colors hover:border-blue-200 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PencilLine className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 px-2 pb-2 pt-1 lg:px-3">
          {loading ? (
            <div className="flex h-full min-h-[420px] items-center justify-center">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
                <Loader2 className="size-4 animate-spin text-blue-600" />
                시험지 불러오는 중
              </div>
            </div>
          ) : !exam ? (
            <div className="flex h-full min-h-[420px] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
              시험지를 찾을 수 없습니다.
            </div>
          ) : (
            <Tabs
              key={exam.id}
              defaultValue="preview"
              className="flex min-h-0 flex-1 flex-col"
            >
              <TabsList className="mb-2 shrink-0 border border-slate-200 bg-white">
                <TabsTrigger value="preview">
                  <Eye className="mr-1.5 size-4" />
                  용지 미리보기
                </TabsTrigger>
                <TabsTrigger value="questions">
                  <FileText className="mr-1.5 size-4" />
                  문제 목록
                </TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="mt-0 min-h-0 flex-1">
                <ExamDetailPaperPreview exam={exam} className="h-full min-h-0" />
              </TabsContent>

              <TabsContent
                value="questions"
                className="mt-0 min-h-0 flex-1 overflow-y-auto"
              >
                {exam.questions.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
                    등록된 문제가 없습니다.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {exam.questions.map((eq) => (
                      <ExamQuestionCard key={eq.id} eq={eq} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
