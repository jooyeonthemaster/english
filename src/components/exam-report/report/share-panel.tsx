"use client";

// ============================================================================
// 학생 시험 리포트 — 공유 링크 패널 (발급/복사/카카오/비활성화)
//
// 서버 단일 판정: enable/disable 는 서버액션. 클라는 결과로 로컬 student 를 갱신.
// - shareEnabled=false → '공유 링크 만들기' (enableExamReportShare → {token})
// - shareEnabled=true  → 링크(origin + /r/ + token) 표시 + 복사 + 카카오 + 비활성화
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Link2, Loader2, Share2 } from "lucide-react";
import {
  enableExamReportShare,
  disableExamReportShare,
} from "@/actions/exam-report";
import type { ExamStudentDetail } from "../ui-contracts";
import { KakaoShareButton } from "@/components/growth/kakao-share-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface SharePanelProps {
  student: ExamStudentDetail;
  onStudentChange: (next: ExamStudentDetail) => void;
}

export function SharePanel({ student, onStudentChange }: SharePanelProps) {
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const shareUrl =
    student.shareEnabled && student.shareToken
      ? `${origin}/r/${student.shareToken}`
      : "";

  const handleEnable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { token } = await enableExamReportShare(student.id);
      onStudentChange({
        ...student,
        shareToken: token,
        shareEnabled: true,
        sharedAt: new Date().toISOString(),
      });
      toast.success("공유 링크를 만들었어요");
    } catch {
      toast.error("공유 링크 발급에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [busy, student, onStudentChange]);

  const handleDisable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await disableExamReportShare(student.id);
      onStudentChange({
        ...student,
        shareToken: null,
        shareEnabled: false,
      });
      toast.success("공유 링크를 비활성화했어요");
    } catch {
      toast.error("링크 비활성화에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [busy, student, onStudentChange]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("링크를 복사했어요");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("복사에 실패했습니다. 링크를 직접 선택해 주세요.");
    }
  }, [shareUrl]);

  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Share2 className="h-3.5 w-3.5" />
        공유 링크
      </div>

      {!student.shareEnabled ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs leading-relaxed text-slate-500">
            공개 링크를 만들면 학부모가 로그인 없이 리포트를 볼 수 있어요. 학생
            이름·점수는 링크 주소에 담기지 않습니다.
          </p>
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            공유 링크 만들기
          </button>
        </div>
      ) : (
        <div className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-stretch gap-1.5">
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/30"
              aria-label="공유 링크 주소"
            />
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors",
                copied
                  ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "복사됨" : "복사"}
            </button>
          </div>

          <KakaoShareButton link={shareUrl} className="w-full" />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={busy}
                className="inline-flex h-8 w-full items-center justify-center rounded-md text-xs font-medium text-rose-500 transition-colors hover:bg-rose-50 disabled:opacity-60"
              >
                링크 비활성화
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>공유 링크를 비활성화할까요?</AlertDialogTitle>
                <AlertDialogDescription>
                  기존 링크는 즉시 무효화됩니다. 다시 켜면 새 주소가 발급돼요.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={handleDisable}
                >
                  비활성화
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </section>
  );
}
