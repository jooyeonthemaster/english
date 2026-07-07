"use client";

// ============================================================================
// 학생 답안 입력 클라이언트 — /a/[token] 모바일 퍼스트 원스크린
//
// 헤더(시험/학생/안내) → sticky 상단 진행 스트립 → 문항 리스트 → sticky 하단
// 제출 바. 제출은 POST /api/answer/[token] — 서버가 reviewed:true(강사 확정)
// 행을 보존하고 정오/점수는 응답에도 포함하지 않는다.
//
// 이 컴포넌트의 props 에는 정답·정오·점수가 구조적으로 존재하지 않는다(§1-7).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Lock, PencilLine, Send } from "lucide-react";
import type { AnswerSheetQuestion } from "@/lib/exam-report/answer-entry";
import { AnswerQuestionRow, ANSWER_TEXT_MAX } from "./answer-question-row";

/** 서버가 프리필로 내리는 기존 응답 — 학생 입력값만(status/aiRead/점수 금지). */
export interface AnswerPrefillEntry {
  number: string;
  choice?: string;
  text?: string;
}

interface AnswerEntryClientProps {
  token: string;
  studentName: string;
  examTitle: string;
  schoolLine: string;
  locked: boolean;
  submittedAt: string | null;
  questions: AnswerSheetQuestion[];
  prefill: AnswerPrefillEntry[];
}

/** POST /api/answer/[token] 의 entries 상한(계약 §4-W3-3). */
const MAX_ENTRIES = 200;

interface DraftAnswer {
  choice?: string;
  text?: string;
}

function buildInitialDraft(
  prefill: AnswerPrefillEntry[],
): Record<string, DraftAnswer> {
  const draft: Record<string, DraftAnswer> = {};
  for (const entry of prefill) {
    draft[entry.number] = {
      ...(entry.choice ? { choice: entry.choice } : {}),
      ...(entry.text ? { text: entry.text } : {}),
    };
  }
  return draft;
}

export function AnswerEntryClient({
  token,
  studentName,
  examTitle,
  schoolLine,
  locked,
  submittedAt,
  questions,
  prefill,
}: AnswerEntryClientProps) {
  const [draft, setDraft] = useState<Record<string, DraftAnswer>>(() =>
    buildInitialDraft(prefill),
  );
  const [phase, setPhase] = useState<"edit" | "done">("edit");
  const [submitting, setSubmitting] = useState(false);
  // 서버 409 LOCKED(제출 도중 강사 확정)에도 잠금 전환 — 초기값은 gradingConfirmed.
  const [lockedNow, setLockedNow] = useState(locked);
  const [skippedCount, setSkippedCount] = useState(0);
  // 제출 시각 표기는 클라 전용(서버-클라 타임존 상이로 인한 hydration 불일치 방지).
  const [submittedLabel, setSubmittedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!submittedAt) return;
    const at = new Date(submittedAt);
    if (Number.isNaN(at.getTime())) return;
    setSubmittedLabel(
      at.toLocaleString("ko-KR", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  }, [submittedAt]);

  const isFilled = useCallback(
    (question: AnswerSheetQuestion): boolean => {
      const answer = draft[question.number];
      if (!answer) return false;
      if (question.kind === "MC") return Boolean(answer.choice);
      return Boolean(answer.text && answer.text.trim());
    },
    [draft],
  );

  const filledCount = useMemo(
    () => questions.filter(isFilled).length,
    [questions, isFilled],
  );
  const total = questions.length;
  const remaining = total - filledCount;
  const percent = total > 0 ? Math.round((filledCount / total) * 100) : 0;

  const handleChoice = useCallback((number: string, choice: string) => {
    setDraft((prev) => ({ ...prev, [number]: { ...prev[number], choice } }));
  }, []);

  const handleText = useCallback((number: string, text: string) => {
    setDraft((prev) => ({
      ...prev,
      [number]: { ...prev[number], text: text.slice(0, ANSWER_TEXT_MAX) },
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting || lockedNow) return;

    // 입력이 있는 문항만 전송 — 빈 entry 는 서버도 스킵하지만 애초에 싣지 않는다.
    const entries = questions
      .map((question) => {
        const answer = draft[question.number];
        if (!answer) return null;
        if (question.kind === "MC") {
          return answer.choice
            ? { number: question.number, choice: answer.choice }
            : null;
        }
        const text = (answer.text ?? "").trim();
        return text
          ? { number: question.number, text: text.slice(0, ANSWER_TEXT_MAX) }
          : null;
      })
      .filter((entry) => entry !== null)
      .slice(0, MAX_ENTRIES);

    if (entries.length === 0) {
      toast.error("입력한 답이 없어요. 한 문항 이상 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/answer/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        applied?: number;
        skippedReviewed?: string[];
        code?: string;
      } | null;

      if (res.ok && body?.ok) {
        setSkippedCount(body.skippedReviewed?.length ?? 0);
        setPhase("done");
        return;
      }
      if (res.status === 409 && body?.code === "LOCKED") {
        setLockedNow(true);
        toast.error("채점이 확정되어 답안을 수정할 수 없습니다.");
      } else if (res.status === 409 && body?.code === "NOT_READY") {
        toast.error("답안지가 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.");
      } else if (res.status === 404) {
        toast.error("링크가 만료되었거나 비활성화되었습니다.");
      } else {
        toast.error("제출에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      toast.error("네트워크 오류로 제출하지 못했어요. 연결을 확인해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }, [draft, lockedNow, questions, submitting, token]);

  // ── 제출 완료 화면 ─────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <div className="w-full max-w-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">
            답안을 제출했어요
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            선생님이 채점을 확정하기 전까지 이 링크에서 다시 수정할 수 있어요.
          </p>
          {skippedCount > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              선생님이 이미 확인을 마친 {skippedCount}개 문항은 변경되지
              않았어요.
            </p>
          )}
          <button
            type="button"
            onClick={() => setPhase("edit")}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <PencilLine className="h-4 w-4" />
            다시 수정
          </button>
          <p className="mt-6 text-[11px] text-slate-400">SMOAT 학생 답안 입력</p>
        </div>
      </div>
    );
  }

  // ── 입력/읽기전용 화면 ─────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto w-full max-w-lg">
          <p className="text-[11px] font-medium tracking-wide text-slate-400">
            SMOAT 답안 입력
          </p>
          <h1
            className="mt-0.5 truncate text-base font-semibold text-slate-800"
            title={examTitle}
          >
            {examTitle}
          </h1>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {schoolLine ? `${schoolLine} · ` : ""}
            {studentName}
          </p>
          {lockedNow ? null : (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              본인이 시험지에 표기한 답을 그대로 입력하세요.
            </p>
          )}
          {submittedLabel && !lockedNow && (
            <span className="mt-1.5 inline-flex items-center whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600">
              이전 제출 {submittedLabel}
            </span>
          )}
        </div>
      </header>

      {lockedNow ? (
        <div className="border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="mx-auto flex w-full max-w-lg items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Lock className="h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-xs font-medium text-slate-600">
              채점이 확정되어 수정할 수 없습니다.
            </p>
          </div>
        </div>
      ) : (
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
          <div className="mx-auto w-full max-w-lg">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">
                <span className="font-semibold text-blue-600 tabular-nums">
                  {filledCount}
                </span>
                <span className="text-slate-400 tabular-nums">
                  {" "}
                  / {total} 입력
                </span>
              </span>
              <span className="text-slate-400 tabular-nums">{percent}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-[width] duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 py-4">
        <ul className="mx-auto w-full max-w-lg space-y-2.5">
          {questions.map((question) => (
            <AnswerQuestionRow
              key={question.number}
              question={question}
              choice={draft[question.number]?.choice}
              text={draft[question.number]?.text}
              filled={isFilled(question)}
              disabled={lockedNow}
              onChoice={handleChoice}
              onText={handleText}
            />
          ))}
        </ul>
      </main>

      {!lockedNow && (
        <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto w-full max-w-lg">
            {remaining > 0 && (
              <p className="mb-2 text-center text-xs text-slate-500">
                아직 입력하지 않은 문항이{" "}
                <span className="font-semibold text-rose-500 tabular-nums">
                  {remaining}
                </span>
                개 있어요
              </p>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || filledCount === 0}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              답안 제출
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
