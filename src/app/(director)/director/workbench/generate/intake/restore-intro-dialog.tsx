"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, ListChecks, RotateCcw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { CREDIT_COSTS } from "@/lib/credit-costs";

// "다시 보지 않기" preference for the AI-restore intro modal. "1" = dismissed.
const DISMISS_KEY = "smoat:generate:restore-intro-dismissed";

/** True when the teacher ticked "다시 보지 않기" — skip the intro and restore directly. */
export function readRestoreIntroDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeRestoreIntroDismissed(dismissed: boolean): void {
  try {
    if (dismissed) window.localStorage.setItem(DISMISS_KEY, "1");
    else window.localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

const FIXES = [
  "빈칸(________) 원래 표현 채우기",
  "어법·어휘 오류 교정",
  "문장 순서·삽입 위치 복원",
  "선지 번호·문제 마커 제거",
];

interface RestoreIntroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Proceed → run the actual restore. */
  onConfirm: () => void;
  /** False when the passage is too short to restore (proceed disabled). */
  canRestore: boolean;
}

/**
 * Visual intro/confirmation gate for AI 원문 복원 on the paste-passage surface.
 * Explains what restoration does, stresses that the teacher should paste the
 * questions + choices for a complete result, and offers a "다시 보지 않기"
 * preference (persisted) that lets future clicks skip straight to restoring.
 */
export function RestoreIntroDialog({
  open,
  onOpenChange,
  onConfirm,
  canRestore,
}: RestoreIntroDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Reflect the stored preference each time the dialog opens.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only localStorage sync on open
    if (open) setDontShowAgain(readRestoreIntroDismissed());
  }, [open]);

  const toggleDontShow = () =>
    setDontShowAgain((v) => {
      const next = !v;
      writeRestoreIntroDismissed(next);
      return next;
    });

  const handleConfirm = () => {
    onOpenChange(false);
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-2xl border-slate-200 p-0 sm:max-w-xl"
      >
        {/* Hero band */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 px-6 py-5">
          <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-14 left-12 h-28 w-28 rounded-full bg-indigo-300/20 blur-2xl" />
          <div className="relative flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white shadow-lg shadow-blue-900/30 ring-1 ring-white/30">
              <RotateCcw className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <DialogTitle className="text-[17px] font-extrabold tracking-tight text-white">
                AI 원문 복원
              </DialogTitle>
              <DialogDescription className="mt-1 text-[12.5px] leading-snug text-blue-50/90">
                빈칸·어법 오류·선지 마커가 뒤섞인{" "}
                <b className="font-bold text-white">문제 형태 지문</b>을 깔끔한{" "}
                <b className="font-bold text-white">원문</b>으로 되살립니다.
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              title="닫기"
              className="relative -mr-1 -mt-1 shrink-0 rounded-lg p-1 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Before → After */}
          <div className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1 rounded-xl border border-rose-200 bg-rose-50/50 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="inline-flex h-4 items-center rounded bg-rose-100 px-1.5 text-[9.5px] font-bold text-rose-600">
                  변형 전
                </span>
                <span className="text-[10.5px] font-medium text-rose-500/80">
                  문제 형태
                </span>
              </div>
              <div className="space-y-1 font-mono text-[10.5px] leading-relaxed text-slate-500">
                <p>
                  The trait{" "}
                  <span className="rounded bg-rose-100 px-1 font-semibold text-rose-600 line-through">
                    ⑤were
                  </span>{" "}
                  common in
                </p>
                <p>
                  the{" "}
                  <span className="rounded bg-rose-100 px-1 font-semibold text-rose-600">
                    ________
                  </span>{" "}
                  where people
                </p>
                <p className="text-slate-400">① cause ② trait ③ effect …</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-500/40">
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>

            <div className="min-w-0 flex-1 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="inline-flex h-4 items-center rounded bg-emerald-100 px-1.5 text-[9.5px] font-bold text-emerald-700">
                  복원 후
                </span>
                <span className="text-[10.5px] font-medium text-emerald-600/80">
                  원문
                </span>
              </div>
              <div className="space-y-1 font-mono text-[10.5px] leading-relaxed text-slate-700">
                <p>
                  The trait{" "}
                  <span className="font-semibold text-emerald-700">was</span>{" "}
                  common in
                </p>
                <p>
                  the{" "}
                  <span className="font-semibold text-emerald-700">village</span>{" "}
                  where people
                </p>
                <p>gathered every morning.</p>
              </div>
            </div>
          </div>

          {/* Key callout — include questions + choices */}
          <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3.5 py-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <ListChecks className="h-3.5 w-3.5" />
            </span>
            <p className="text-[12px] leading-relaxed text-slate-700">
              <b className="font-bold text-blue-700">
                완전한 복원을 위해 문제와 선지(①②③④⑤)까지 함께 붙여넣어 주세요.
              </b>{" "}
              정답·문항이 있어야 AI가 빈칸과 밑줄 어법을 <b>정확히</b> 되살립니다.
              지문만 넣으면 문맥 추정으로 일부만 복원될 수 있어요.
            </p>
          </div>

          {/* What it fixes */}
          <ul className="mt-3 grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
            {FIXES.map((t) => (
              <li
                key={t}
                className="flex items-center gap-1.5 text-[11.5px] text-slate-600"
              >
                <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-3.5">
          <button
            type="button"
            onClick={toggleDontShow}
            aria-pressed={dontShowAgain}
            className="group flex items-center gap-2 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-700"
          >
            <span
              className={
                "flex h-4 w-4 items-center justify-center rounded border transition-colors " +
                (dontShowAgain
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white group-hover:border-slate-400")
              }
            >
              {dontShowAgain && <Check className="h-3 w-3" />}
            </span>
            다시 보지 않기
          </button>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 text-[11px] font-semibold text-slate-400 sm:flex">
              <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] text-slate-600">
                ◈ {CREDIT_COSTS.PASSAGE_RESTORATION}
              </span>
              지문당
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-lg px-3.5 text-[12.5px] font-semibold text-slate-500 transition-colors hover:bg-slate-100"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canRestore}
              title={canRestore ? "AI 복원 시작" : "지문을 먼저 입력하세요"}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[12.5px] font-bold text-white shadow-lg shadow-blue-500/40 transition-all hover:bg-blue-700 hover:shadow-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              <RotateCcw className="h-4 w-4" />
              복원 시작
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
