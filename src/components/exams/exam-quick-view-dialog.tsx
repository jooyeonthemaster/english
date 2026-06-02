"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, FileText, Loader2, PencilLine, Send, Settings } from "lucide-react";
import { toast } from "sonner";
import { getExam, publishExam } from "@/actions/exams";
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
import { SettingsTab } from "./exam-detail-client-parts/settings-tab";
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
      <DialogContent className="h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none lg:h-[calc(100dvh-2rem)] lg:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-6 py-4 pr-14">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="truncate text-xl font-bold text-slate-900">
                {exam?.title || "시험지 빠른 보기"}
              </DialogTitle>
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
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-blue-100 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-700 transition-colors hover:border-blue-200 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PencilLine className="h-3.5 w-3.5" />
                수정
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3 lg:p-4">
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
            <Tabs key={exam.id} defaultValue="preview">
              <TabsList className="mb-4 border border-slate-200 bg-white">
                <TabsTrigger value="preview">
                  <Eye className="mr-1.5 size-4" />
                  용지 미리보기
                </TabsTrigger>
                <TabsTrigger value="questions">
                  <FileText className="mr-1.5 size-4" />
                  문제 목록
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings className="mr-1.5 size-4" />
                  설정
                </TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="mt-0">
                <ExamDetailPaperPreview exam={exam} />
              </TabsContent>

              <TabsContent value="questions" className="mt-0">
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

              <TabsContent value="settings" className="mt-0">
                <SettingsTab exam={exam} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
