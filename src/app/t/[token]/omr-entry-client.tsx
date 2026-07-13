"use client";

// ============================================================================
// /t/[token] OMR 모드 — 지면 응시 후 답만 입력하는 모바일 퍼스트 원스크린 (V3)
//
// /a/[token] answer-entry-client 관례를 미러하되 자체 시험지 축
// (TakingSession/AnswerUiSpec)으로 재구현. 구조: 헤더 → sticky 진행 스트립
// (시험명·학생명·답함 n/총·저장 상태) → 전 문항 리스트 → sticky 제출 바.
//
// - 입력 변경 → 1.2s 디바운스 자동저장(saveResponses, 문항 단위 부분 병합).
// - 제출(submitResponses): 미응답 있으면 confirm 후 confirmIncomplete:true.
//   완료 화면은 제출 시각만 — 점수·정오 미노출(§6-1, 서버 응답도 {ok} 뿐).
// - LOCKED(다른 기기 제출·강사 확정)는 저장/제출 어느 경로에서든 완료 화면 전환.
// - 이 컴포넌트의 props(TakingSession)에는 정답·정오·점수가 구조적으로 없다.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, LogOut, Send } from "lucide-react";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import type { TakingSession } from "@/lib/exam-scoring/taking-payload";
import type { StudentInput } from "@/lib/exam-scoring/types";
// V2 소유 저장/제출 래퍼(판별 유니온) — {ok} | {ok:false, code, missing?, message}.
// "답함" 판정도 V2 의 hasStudentInput 로 통일(서버 sanitize 와 동일 축).
import {
  hasStudentInput,
  saveResponses,
  submitResponses,
} from "./taking-shared";
import { ExitConfirmDialog } from "./taking-parts/status-parts";
import { OmrQuestionRow } from "./omr-parts/omr-question-row";
import {
  OmrDisabledScreen,
  OmrDoneScreen,
  SaveStatusBadge,
} from "./omr-parts/omr-screens";
import {
  OMR_MANUAL_TEXT_MAX,
  SAVE_DEBOUNCE_MS,
  SAVE_RETRY_MS,
  formatDateTimeLabel,
  formatTimeLabel,
  type SaveState,
} from "./omr-parts/omr-shared";

export function OmrEntryClient({
  token,
  session,
  exitHref,
}: {
  token: string;
  session: TakingSession;
  /** 과제 출처(?return=g) 진입에서만 — 저장 후 나가기·완료 화면 복귀 목적지(/g/tasks) */
  exitHref?: string | null;
}) {
  // ── 상태 ───────────────────────────────────────────────────────────────────
  const [inputs, setInputs] = useState<Record<string, StudentInput | null>>(
    () => ({ ...session.savedInputs }),
  );
  const [phase, setPhase] = useState<"edit" | "done">(
    session.status === "SUBMITTED" || session.status === "GRADED"
      ? "done"
      : "edit",
  );
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAtLabel, setSavedAtLabel] = useState<string | null>(null);
  // 제출 시각 표기는 클라 전용(서버-클라 타임존 상이로 인한 hydration 불일치 방지).
  const [submittedLabel, setSubmittedLabel] = useState<string | null>(null);
  // LOCKED 경유 완료(다른 기기 제출·강사 확정) — 안내 문구 분기용.
  const [lockedNotice, setLockedNotice] = useState(false);
  // 저장 후 나가기(과제 출처 ?return=g 전용) — 확인 다이얼로그·이탈 진행 상태.
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{
    orderNum: number;
    at: number;
  } | null>(null);

  // ── ref(자동저장 파이프라인) ───────────────────────────────────────────────
  const inputsRef = useRef(inputs);
  const pendingRef = useRef<Map<string, StudentInput | null>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const submittingRef = useRef(false);
  const doneRef = useRef(phase === "done");
  const exitingRef = useRef(false);
  const flushRef = useRef<() => void>(() => {});

  useEffect(() => {
    inputsRef.current = inputs;
  }, [inputs]);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 1600);
    return () => clearTimeout(timer);
  }, [highlight]);

  useEffect(() => {
    if (!session.submittedAt) return;
    const at = new Date(session.submittedAt);
    if (Number.isNaN(at.getTime())) return;
    setSubmittedLabel(formatDateTimeLabel(at));
  }, [session.submittedAt]);

  // 미저장 변경이 있으면 이탈 경고 — 지면 응시분 유실 방지.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (pendingRef.current.size === 0 && !saveInFlightRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // 언마운트 시 디바운스 타이머 정리.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ── 파생값 ─────────────────────────────────────────────────────────────────
  const questions = session.questions;
  const total = questions.length;
  const questionById = useMemo(
    () => new Map(questions.map((q) => [q.questionId, q])),
    [questions],
  );
  const filledCount = useMemo(
    () => questions.filter((q) => hasStudentInput(inputs[q.questionId])).length,
    [questions, inputs],
  );
  // 서버 INCOMPLETE 축과 동일: MANUAL_ONLY(자유영작)는 빈 제출이 정상 경로.
  const missingQuestions = useMemo(
    () =>
      questions.filter(
        (q) =>
          q.answerUi.inputKind !== "MANUAL_ONLY" &&
          !hasStudentInput(inputs[q.questionId]),
      ),
    [questions, inputs],
  );
  const percent = total > 0 ? Math.round((filledCount / total) * 100) : 0;

  // ── 자동저장(1.2s 디바운스 + 실패 자동 재시도) ─────────────────────────────
  const scheduleFlush = useCallback((ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), ms);
  }, []);

  const flush = useCallback(async () => {
    if (saveInFlightRef.current || submittingRef.current || doneRef.current)
      return;
    if (pendingRef.current.size === 0) return;
    const batch = new Map(pendingRef.current);
    pendingRef.current.clear();
    saveInFlightRef.current = true;
    setSaveState("saving");

    /** 실패 시 되돌림 — 그 사이 재변경된 문항은 최신 입력이 우선. */
    const restoreBatch = () => {
      for (const [questionId, input] of batch) {
        if (!pendingRef.current.has(questionId)) {
          pendingRef.current.set(questionId, input);
        }
      }
    };

    try {
      const result = await saveResponses(token, Object.fromEntries(batch));
      if (doneRef.current) return; // 제출 완료 후의 잔여 응답은 무시
      if (result.ok) {
        if (pendingRef.current.size > 0) {
          // 저장 중 새 입력 발생 — 다음 배치를 재디바운스.
          setSaveState("pending");
          scheduleFlush(SAVE_DEBOUNCE_MS);
        } else {
          setSaveState("saved");
          setSavedAtLabel(formatTimeLabel(new Date()));
        }
        return;
      }
      if (result.code === "LOCKED") {
        // 다른 기기 제출·강사 확정 — 더 이상 쓸 수 없다. 완료 화면으로.
        doneRef.current = true;
        setLockedNotice(true);
        setPhase("done");
        return;
      }
      // OFFLINE/CONFLICT/UNKNOWN 등 — 배치를 되돌리고 자동 재시도.
      restoreBatch();
      setSaveState("error");
      scheduleFlush(SAVE_RETRY_MS);
    } catch {
      // saveResponses 는 throw 하지 않는 계약이지만 이중 방어.
      restoreBatch();
      setSaveState("error");
      scheduleFlush(SAVE_RETRY_MS);
    } finally {
      saveInFlightRef.current = false;
    }
  }, [token, scheduleFlush]);

  useEffect(() => {
    flushRef.current = () => void flush();
  }, [flush]);

  /** 입력 반영 + 자동저장 큐 적재 — 모든 입력 핸들러의 단일 통로. */
  const applyInput = useCallback(
    (questionId: string, next: StudentInput | null) => {
      setInputs((prev) => ({ ...prev, [questionId]: next }));
      if (doneRef.current) return;
      pendingRef.current.set(questionId, next);
      setSaveState("pending");
      scheduleFlush(SAVE_DEBOUNCE_MS);
    },
    [scheduleFlush],
  );

  // ── 입력 핸들러 ────────────────────────────────────────────────────────────
  const handleChoice = useCallback(
    (questionId: string, choiceToken: string) => {
      const current = inputsRef.current[questionId]?.choice;
      // 같은 토큰 재탭 = 답 지움(null → 서버 UNKNOWN 수렴).
      applyInput(
        questionId,
        current === choiceToken ? null : { choice: choiceToken },
      );
    },
    [applyInput],
  );

  const handleToggleChoice = useCallback(
    (questionId: string, choiceToken: string) => {
      const cap = questionById.get(questionId)?.answerUi.selectCount;
      const current = inputsRef.current[questionId]?.choices ?? [];
      let next: string[];
      if (current.includes(choiceToken)) {
        next = current.filter((t) => t !== choiceToken);
      } else {
        if (cap != null && current.length >= cap) {
          toast.error(`이 문항은 최대 ${cap}개까지 선택할 수 있습니다.`);
          return;
        }
        next = [...current, choiceToken].sort((a, b) => Number(a) - Number(b));
      }
      applyInput(questionId, next.length > 0 ? { choices: next } : null);
    },
    [applyInput, questionById],
  );

  const handleText = useCallback(
    (questionId: string, fieldKey: string, value: string) => {
      const nextTexts = { ...(inputsRef.current[questionId]?.texts ?? {}) };
      const capped = value.slice(0, OMR_MANUAL_TEXT_MAX);
      if (capped.length === 0) delete nextTexts[fieldKey];
      else nextTexts[fieldKey] = capped;
      applyInput(
        questionId,
        Object.keys(nextTexts).length > 0 ? { texts: nextTexts } : null,
      );
    },
    [applyInput],
  );

  const handleToggleExpanded = useCallback((questionId: string) => {
    setExpandedId((prev) => (prev === questionId ? null : questionId));
  }, []);

  const jumpToOrderNum = useCallback((orderNum: number) => {
    document
      .querySelector(`[data-qnum="${orderNum}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight({ orderNum, at: Date.now() });
  }, []);

  // ── 제출 ───────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submitting || doneRef.current) return;

    let confirmIncomplete = false;
    if (missingQuestions.length > 0) {
      const ok = window.confirm(
        `미응답 ${missingQuestions.length}문항이 있습니다. 그래도 제출하시겠습니까?\n제출 후에는 답을 수정할 수 없습니다.`,
      );
      if (!ok) {
        jumpToOrderNum(missingQuestions[0].orderNum);
        return;
      }
      confirmIncomplete = true;
    }

    // 제출 페이로드가 전 문항 최종 상태를 실으므로 대기 중 자동저장은 중단.
    // (실패 시 pendingRef 는 그대로 남아 자동저장이 재개된다.)
    if (timerRef.current) clearTimeout(timerRef.current);
    const responses: Record<string, StudentInput | null> = {};
    for (const q of questions) {
      responses[q.questionId] = inputsRef.current[q.questionId] ?? null;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await submitResponses(
        token,
        responses,
        confirmIncomplete || undefined,
      );
      if (result.ok) {
        doneRef.current = true;
        pendingRef.current.clear();
        setSubmittedLabel(formatDateTimeLabel(new Date()));
        setPhase("done");
        return;
      }
      if (result.code === "LOCKED") {
        // 409 LOCKED — 이미 제출·확정된 시험. 완료 화면으로 전환.
        doneRef.current = true;
        pendingRef.current.clear();
        setLockedNotice(true);
        setPhase("done");
      } else if (result.code === "INCOMPLETE") {
        // 서버측 미응답 검증(클라 우회 방어선) — 첫 미응답 문항으로 점프.
        toast.error("답을 입력하지 않은 문항이 있습니다. 확인 후 다시 제출해 주세요.");
        const first = result.missing[0];
        if (typeof first === "number") jumpToOrderNum(first);
      } else {
        // DISABLED/NOT_FOUND/OFFLINE/CONFLICT/UNKNOWN — 서버 정렬 메시지 그대로.
        toast.error(result.message);
      }
    } catch {
      // submitResponses 는 throw 하지 않는 계약이지만 이중 방어.
      toast.error("제출에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      // 제출 실패 시 미저장 변경이 남아 있으면 자동저장 재개.
      if (!doneRef.current && pendingRef.current.size > 0) {
        setSaveState("pending");
        scheduleFlush(SAVE_DEBOUNCE_MS);
      }
    }
  }, [
    submitting,
    missingQuestions,
    questions,
    token,
    jumpToOrderNum,
    scheduleFlush,
  ]);

  // ── 저장 후 나가기(과제 출처 ?return=g 전용) ────────────────────────────────
  // 대기 중 자동저장을 소진 확정한 뒤에만 이탈한다(지면 입력분 유실 차단).
  // 실패 시 잔류 + 자동저장 재개 + 토스트, LOCKED(이미 제출·확정)는 유실 없어 그대로 이탈.
  const performExit = useCallback(async () => {
    if (!exitHref || exitingRef.current || doneRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    // 진행 중 저장이 끝날 때까지 대기(CAS 경합 방지).
    while (saveInFlightRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (pendingRef.current.size > 0) {
      const batch = new Map(pendingRef.current);
      pendingRef.current.clear();
      const result = await saveResponses(token, Object.fromEntries(batch));
      if (!result.ok && result.code !== "LOCKED") {
        // 저장 실패 — 배치를 되돌리고 이탈 취소, 자동저장 재개.
        for (const [questionId, input] of batch) {
          if (!pendingRef.current.has(questionId)) {
            pendingRef.current.set(questionId, input);
          }
        }
        exitingRef.current = false;
        setExiting(false);
        setExitConfirmOpen(false);
        setSaveState("error");
        scheduleFlush(SAVE_RETRY_MS);
        toast.error(
          "답안 저장을 완료하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
        );
        return;
      }
    }
    window.location.assign(exitHref);
  }, [exitHref, token, scheduleFlush]);

  // ── 렌더 ───────────────────────────────────────────────────────────────────
  // 신규 표면 게이트(계약) — 공개 플래그라 클라에서도 판정 가능. 훅 이후 배치.
  if (!FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT) {
    return <OmrDisabledScreen />;
  }

  if (phase === "done") {
    return (
      <OmrDoneScreen
        lockedNotice={lockedNotice}
        submittedLabel={submittedLabel}
        exitHref={exitHref}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-xl">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium tracking-wide text-slate-400">
              SMOAT OMR 답안 입력
            </p>
            {exitHref && (
              <button
                type="button"
                onClick={() => setExitConfirmOpen(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50"
              >
                <LogOut className="h-3 w-3 -scale-x-100" />
                저장 후 나가기
              </button>
            )}
          </div>
          <h1
            className="mt-0.5 truncate text-base font-semibold text-slate-800"
            title={session.examTitle}
          >
            {session.examTitle}
          </h1>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {session.studentName}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            시험지에 표기한 답을 그대로 입력해 주세요. 입력한 답은 자동으로
            저장됩니다.
          </p>
          {session.meta.removedOrderNums.length > 0 && (
            <p className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-500">
              출제 조정으로 {session.meta.removedOrderNums.join(", ")}번 문항이
              제외되었습니다. 남은 문항만 입력하시면 됩니다.
            </p>
          )}
        </div>
      </header>

      {/* sticky 진행 스트립 — 시험명·학생명·답함 n/총·저장 상태 */}
      <div className="sticky top-[env(safe-area-inset-top)] z-20 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto w-full max-w-xl">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-slate-500">
              {session.examTitle} · {session.studentName}
            </span>
            <SaveStatusBadge state={saveState} savedAtLabel={savedAtLabel} />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600">
              답함{" "}
              <span className="font-semibold text-blue-600 tabular-nums">
                {filledCount}
              </span>
              <span className="text-slate-400 tabular-nums"> / {total}</span>
            </span>
            <span className="text-slate-400 tabular-nums">{percent}%</span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={filledCount}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="답안 입력 진행률"
          >
            <div
              className="h-full rounded-full bg-blue-600 transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      <main className="flex-1 px-4 py-4">
        {total === 0 ? (
          <p className="mx-auto w-full max-w-xl rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            입력할 문항이 없습니다. 선생님께 문의해 주세요.
          </p>
        ) : (
          <ol className="mx-auto w-full max-w-xl space-y-2.5">
            {questions.map((question) => (
              <OmrQuestionRow
                key={question.questionId}
                question={question}
                input={inputs[question.questionId] ?? null}
                filled={hasStudentInput(inputs[question.questionId])}
                disabled={submitting}
                highlighted={highlight?.orderNum === question.orderNum}
                expanded={expandedId === question.questionId}
                onToggleExpanded={handleToggleExpanded}
                onChoice={handleChoice}
                onToggleChoice={handleToggleChoice}
                onText={handleText}
              />
            ))}
          </ol>
        )}
      </main>

      {/* sticky 제출 바 */}
      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto w-full max-w-xl">
          {missingQuestions.length > 0 ? (
            <button
              type="button"
              onClick={() => jumpToOrderNum(missingQuestions[0].orderNum)}
              className="mb-1 flex min-h-11 w-full items-center justify-center gap-1 rounded-md text-xs text-slate-500 transition-colors hover:text-slate-700"
            >
              <span className="font-semibold text-rose-500 tabular-nums">
                {missingQuestions.length}
              </span>
              <span>문항 미응답</span>
              <span className="font-medium text-blue-600 underline underline-offset-2">
                남은 문항으로 이동
              </span>
            </button>
          ) : (
            <p className="mb-2 flex min-h-8 items-center justify-center text-center text-xs font-medium text-emerald-600">
              모든 문항에 답했습니다. 제출해 주세요.
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || total === 0}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            제출하기
            <span className="text-xs font-medium text-blue-100 tabular-nums">
              {filledCount}/{total} 답함
            </span>
          </button>
        </div>
      </div>

      {exitConfirmOpen && (
        <ExitConfirmDialog
          hasTimer={false}
          exiting={exiting}
          onCancel={() => setExitConfirmOpen(false)}
          onConfirm={() => void performExit()}
        />
      )}
    </div>
  );
}
