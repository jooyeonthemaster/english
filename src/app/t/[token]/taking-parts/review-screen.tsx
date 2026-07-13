"use client";

// ============================================================================
// /t/[token] 태블릿 응시 — 제출 검토 화면
//
// 마지막 문항 다음 단계: 미응답 문항 리스트(탭 = 해당 문항으로 이동), 플래그
// 문항 리스트, 대형 "제출하기" 버튼. 점수·정오는 어디에도 없다(§6-1).
// ============================================================================

import { ArrowLeft, CheckCircle2, Clock, Flag, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "./use-countdown";

export interface ReviewItem {
  questionId: string;
  orderNum: number;
  answered: boolean;
  flagged: boolean;
}

interface ReviewScreenProps {
  examTitle: string;
  studentName: string;
  items: ReviewItem[];
  submitting: boolean;
  /** 남은 시간(초) — 검토 중에도 만료 자동제출이 도니 타이머를 계속 보여준다 */
  remaining?: number | null;
  onBack: () => void;
  onJump: (index: number) => void;
  onSubmit: () => void;
}

function QuestionChipList({
  label,
  tone,
  entries,
  onJump,
}: {
  label: string;
  tone: "warn" | "info";
  entries: { index: number; orderNum: number }[];
  onJump: (index: number) => void;
}) {
  return (
    <section className="rounded-xl border border-[#E5E8EB] bg-white p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[#191F28]">
        {tone === "warn" ? (
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
        ) : (
          <Flag className="h-3.5 w-3.5 text-[#3182F6]" fill="currentColor" />
        )}
        {label}
        <span className="text-[#8B95A1] tabular-nums">{entries.length}문항</span>
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {entries.map((entry) => (
          <button
            key={entry.orderNum}
            type="button"
            onClick={() => onJump(entry.index)}
            aria-label={`${entry.orderNum}번 문항으로 이동`}
            className={cn(
              "flex h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors tabular-nums",
              tone === "warn"
                ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                : "border-[#E5E8EB] bg-white text-[#4E5968] hover:bg-[#F7F8FA]",
            )}
          >
            {entry.orderNum}번
          </button>
        ))}
      </div>
    </section>
  );
}

export function ReviewScreen({
  examTitle,
  studentName,
  items,
  submitting,
  remaining,
  onBack,
  onJump,
  onSubmit,
}: ReviewScreenProps) {
  const unanswered = items
    .map((item, index) => ({ index, orderNum: item.orderNum, answered: item.answered }))
    .filter((entry) => !entry.answered);
  const flagged = items
    .map((item, index) => ({ index, orderNum: item.orderNum, flagged: item.flagged }))
    .filter((entry) => entry.flagged);
  const answeredCount = items.length - unanswered.length;

  return (
    <div className="flex min-h-dvh flex-col bg-[#F7F8FA]">
      <header className="border-b border-[#E5E8EB] bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="문항으로 돌아가기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#4E5968] transition-colors hover:bg-[#F7F8FA]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-[#191F28]">제출 검토</h1>
            <p className="truncate text-xs text-[#8B95A1]">
              {examTitle} · {studentName}
            </p>
          </div>
          {remaining != null && (
            <span
              aria-live="polite"
              aria-label={`남은 시간 ${formatTime(remaining)}`}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 font-mono text-xs font-semibold",
                // 경고는 rose 만(주황 금지) — 응시 헤더 타이머 칩과 동일 규격.
                remaining < 60
                  ? "animate-pulse bg-rose-600 text-white"
                  : remaining < 300
                    ? "bg-rose-50 text-rose-600"
                    : "bg-[#F7F8FA] text-[#4E5968]",
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              {formatTime(remaining)}
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <section className="rounded-xl border border-[#E5E8EB] bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#191F28]">응답 현황</p>
              <p className="text-sm text-[#4E5968] tabular-nums">
                <span className="font-semibold text-[#3182F6]">{answeredCount}</span> /{" "}
                {items.length} 문항
              </p>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#F2F4F6]">
              <div
                className="h-full rounded-full bg-[#3182F6] transition-[width] duration-300"
                style={{
                  width: `${items.length > 0 ? Math.round((answeredCount / items.length) * 100) : 0}%`,
                }}
              />
            </div>
            {unanswered.length === 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                모든 문항에 응답했습니다. 아래에서 제출해 주세요.
              </p>
            )}
          </section>

          {unanswered.length > 0 && (
            <QuestionChipList
              label="미응답 문항"
              tone="warn"
              entries={unanswered}
              onJump={onJump}
            />
          )}

          {flagged.length > 0 && (
            <QuestionChipList
              label="표시한 문항"
              tone="info"
              entries={flagged}
              onJump={onJump}
            />
          )}

          <p className="px-1 text-xs leading-relaxed text-[#8B95A1]">
            제출하면 답을 더 이상 수정할 수 없습니다. 표시한 문항과 미응답 문항을
            확인한 뒤 제출해 주세요.
          </p>
        </div>
      </main>

      <footer className="border-t border-[#E5E8EB] bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto w-full max-w-3xl">
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#3182F6] text-[15px] font-semibold text-white transition-colors hover:bg-[#1B64DA] disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            제출하기
          </button>
        </div>
      </footer>
    </div>
  );
}
