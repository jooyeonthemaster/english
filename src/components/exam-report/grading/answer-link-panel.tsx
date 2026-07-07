"use client";

// ============================================================================
// 학생 시험 리포트 — 학생 답안 링크 패널 (발급/복사/끄기/제출 상태)
//
// 답안 수집 스텝의 (b) 경로. share-panel 패턴 미러 — 서버 단일 판정:
// enable/disableAnswerLink 서버액션 결과로 로컬 student 를 갱신한다.
// - answerEnabled=false → [링크 만들기] (enableAnswerLink → {token})
// - answerEnabled=true  → {origin}/a/{token} 표시 + 복사 + [끄기](AlertDialog)
//   + 제출 상태 칩(미제출 / 제출됨 · 상대시간). 제출됨이면 [정오표에서 확인] CTA.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Copy, Link2, Loader2 } from "lucide-react";

import { enableAnswerLink, disableAnswerLink } from "@/actions/exam-report";
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
import { cn, formatRelativeTime } from "@/lib/utils";
import type { ExamStudentDetail } from "../ui-contracts";

interface AnswerLinkPanelProps {
  student: ExamStudentDetail;
  /** 문항 지도 미완이면 학생 제출이 서버에서 409(NOT_READY)라 발급을 막는다. */
  examMapReady: boolean;
  onStudentChange: (next: ExamStudentDetail) => void;
  /** 제출됨 → [정오표에서 확인] CTA. */
  onGoVerdict: () => void;
}

export function AnswerLinkPanel({
  student,
  examMapReady,
  onStudentChange,
  onGoVerdict,
}: AnswerLinkPanelProps) {
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const answerUrl =
    student.answerEnabled && student.answerToken
      ? `${origin}/a/${student.answerToken}`
      : "";
  const submittedAt = student.answerSubmittedAt;

  const handleEnable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { token } = await enableAnswerLink(student.id);
      onStudentChange({ ...student, answerToken: token, answerEnabled: true });
      toast.success("답안 입력 링크를 만들었어요");
    } catch {
      toast.error("답안 링크 발급에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [busy, student, onStudentChange]);

  const handleDisable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await disableAnswerLink(student.id);
      // 서버가 revoke 시 version 을 +1 하므로(학생 POST 레이스 봉쇄) 낙관 patch 도
      // 동기화 — 안 맞추면 이후 강사 저장(updateStudentGrading)의 CAS 가 오충돌한다.
      onStudentChange({
        ...student,
        answerToken: null,
        answerEnabled: false,
        version: student.version + 1,
      });
      toast.success("답안 링크를 껐어요");
    } catch {
      toast.error("답안 링크 끄기에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [busy, student, onStudentChange]);

  const handleCopy = useCallback(async () => {
    if (!answerUrl) return;
    try {
      await navigator.clipboard.writeText(answerUrl);
      setCopied(true);
      toast.success("링크를 복사했어요");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("복사에 실패했습니다. 링크를 직접 선택해 주세요.");
    }
  }, [answerUrl]);

  if (!student.answerEnabled || !student.answerToken) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] leading-relaxed text-slate-500">
          링크를 학생에게 보내면 학생이 휴대폰으로 본인 답을 직접 입력합니다.
          정답·점수는 학생에게 보이지 않아요.
        </p>
        {!examMapReady && (
          <p className="text-[11px] text-slate-400">
            시험 문항 분석이 완료된 뒤에 링크를 만들 수 있습니다.
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleEnable()}
          disabled={busy || !examMapReady}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          링크 만들기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* 제출 상태 칩 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {submittedAt ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <Check className="h-3 w-3" />
            제출됨 · {formatRelativeTime(submittedAt)}
          </span>
        ) : (
          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            미제출
          </span>
        )}
      </div>

      <div className="flex items-stretch gap-1.5">
        <input
          readOnly
          value={answerUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="h-8 min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/30"
          aria-label="학생 답안 입력 링크 주소"
        />
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors",
            copied
              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
              : "border-slate-200 text-slate-600 hover:bg-slate-50",
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {submittedAt && (
          <button
            type="button"
            onClick={onGoVerdict}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
          >
            정오표에서 확인
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-md px-2.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-50 disabled:opacity-60",
                submittedAt ? "shrink-0" : "w-full",
              )}
            >
              끄기
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>답안 링크를 끌까요?</AlertDialogTitle>
              <AlertDialogDescription>
                기존 링크는 즉시 무효화됩니다. 이미 제출된 답안은 정오표에 그대로
                남고, 다시 켜면 새 주소가 발급돼요.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void handleDisable()}>
                끄기
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
