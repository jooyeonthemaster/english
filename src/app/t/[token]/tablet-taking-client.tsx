"use client";

// ============================================================================
// /t/[token] 태블릿 응시 클라이언트 (V2) — 상태 오케스트레이션 본체
//
// 크롬(헤더/푸터/모드B 카드)은 taking-parts/taking-chrome.tsx, 자동저장 기계
// (1.2s 디바운스 + hidden 플러시/pagehide 비콘/online 재시도)는 taking-shared
// 의 useTakingAutosave 소유. 제출은 검토 → 미응답 확인(번호 칩 점프) → 완료.
// 타이머는 session.duration(과제 durationMin 오버라이드는 페이지 레벨 패치
// 완료본) — 만료 시 자동 제출. 과제 출처(?return=g)만 [저장하고 나가기] 노출:
// 저장 큐 소진 확정 후 /g/tasks 이탈, 실패 시 잔류+토스트. 표시 상태(viewMode/
// currentIdx/flagged)는 기기 로컬 지속 — 제출·LOCKED 시 제거(공용 태블릿).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { TakingSession } from "@/lib/exam-scoring/taking-payload";
import type { StudentInput } from "@/lib/exam-scoring/types";
import {
  clearTakingPrefs,
  hasStudentInput,
  readTakingPrefs,
  submitResponses,
  useTakingAutosave,
  writeTakingPrefs,
  type TakingResponsesMap,
} from "./taking-shared";
import { TakingIntroScreen } from "./taking-parts/intro-screen";
import { PaperTakingView } from "./taking-parts/paper-taking-view";
import { NavigatorSheet } from "./taking-parts/navigator-sheet";
import { ReviewScreen } from "./taking-parts/review-screen";
import {
  RemovedNotice,
  SingleQuestionCard,
  TakingFooter,
  TakingHeader,
  useFontScale,
  useTimeWarning,
} from "./taking-parts/taking-chrome";
import {
  ConfirmIncompleteDialog,
  DisabledScreen,
  ExitConfirmDialog,
  ExpiredScreen,
  LockedScreen,
  OfflineBanner,
  SubmitDoneScreen,
  TimeUpOverlay,
} from "./taking-parts/status-parts";
import { useCountdown } from "./taking-parts/use-countdown";

type Phase =
  | "intro"
  | "taking"
  | "review"
  | "done"
  | "locked"
  | "disabled"
  | "expired";

/** 서버 save/submit 바디의 responses 키 상한(zod ≤300)과 동일 */
const MAX_SUBMIT_ENTRIES = 300;

// ── 본체 ─────────────────────────────────────────────────────────────────────

export function TabletTakingClient({
  token,
  session,
  exitHref,
  assignmentInstructions,
  assignmentDueLabel,
}: {
  token: string;
  session: TakingSession;
  /** 과제 출처(?return=g) 진입에서만 — 저장 후 나가기 목적지(/g/tasks) */
  exitHref?: string | null;
  /** 과제 안내문(합니다체) — 브리지 없는 DIRECT 배포는 null(표시 생략) */
  assignmentInstructions?: string | null;
  /** 과제 마감 표기(서버 Asia/Seoul 포맷 완료본) */
  assignmentDueLabel?: string | null;
}) {
  const questions = session.questions;

  const [inputs, setInputs] = useState<Record<string, StudentInput | null>>(() => ({
    ...session.savedInputs,
  }));
  // 보기 모드(설계 §결정3) — "paper"(시험지 전체, 기본) | "single"(한 문제씩).
  const [viewMode, setViewMode] = useState<"paper" | "single">("paper");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flagged, setFlagged] = useState<Set<string>>(() => new Set());
  const [navOpen, setNavOpen] = useState(false);
  // ASSIGNED(미시작)은 인트로부터 — 시작 버튼을 눌러야 응시(타이머)로 진입한다.
  const [phase, setPhase] = useState<Phase>(
    session.status === "ASSIGNED" ? "intro" : "taking",
  );
  /** [응시 시작] 클릭 시각(ISO) — 서버 startedAt 이 없는 신규 응시의 타이머 기산점 */
  const [clientStartedAt, setClientStartedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** 미응답 확인 다이얼로그 — null 이면 닫힘, 배열이면 미응답 문항 번호 목록 */
  const [confirmMissing, setConfirmMissing] = useState<number[] | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [autoSubmitFailed, setAutoSubmitFailed] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  /** paper 점프 직후 일시 하이라이트 문항 번호 */
  const [flashOrderNum, setFlashOrderNum] = useState<number | null>(null);

  // 최신 입력 — 디바운스/타이머 콜백의 stale closure 방지용 ref 미러.
  const inputsRef = useRef(inputs);
  useEffect(() => {
    inputsRef.current = inputs;
  }, [inputs]);
  const submittingRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  // ── 자동저장(큐·플러시·내구성 — taking-shared 소유) ─────────────────────────
  const { saveState, offline, queueInput, retrySave, cancelPending, drainPendingSaves } =
    useTakingAutosave({
      token,
      initialVersion: session.version,
      onFatal: (code) =>
        setPhase(
          code === "LOCKED" ? "locked" : code === "DISABLED" ? "disabled" : "expired",
        ),
    });

  const handleInputChange = useCallback(
    (questionId: string, input: StudentInput | null) => {
      setInputs((prev) => ({ ...prev, [questionId]: input }));
      queueInput(questionId, input);
    },
    [queueInput],
  );

  // ── 표시 상태 로컬 지속(정답성 0) — 마운트 후 복원(SSR 불일치 방지) ─────────
  useEffect(() => {
    const prefs = readTakingPrefs(token);
    if (!prefs) return;
    if (prefs.viewMode) setViewMode(prefs.viewMode);
    if (typeof prefs.currentIdx === "number") {
      setCurrentIdx(Math.min(Math.max(prefs.currentIdx, 0), questions.length - 1));
    }
    if (prefs.flagged && prefs.flagged.length > 0) {
      const alive = new Set(questions.map((q) => q.questionId));
      setFlagged(new Set(prefs.flagged.filter((id) => alive.has(id))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (phase === "done" || phase === "locked") {
      clearTakingPrefs(token);
      return;
    }
    if (phase !== "taking" && phase !== "review") return;
    writeTakingPrefs(token, { viewMode, currentIdx, flagged: Array.from(flagged) });
  }, [token, phase, viewMode, currentIdx, flagged]);

  // ── 제출 ────────────────────────────────────────────────────────────────────
  const performSubmit = useCallback(
    async (confirmIncomplete: boolean, options?: { auto?: boolean }) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      // 제출 바디가 전 입력을 싣는다 — 잔여 자동저장은 취소(CAS 경합 방지).
      cancelPending();

      const payload: TakingResponsesMap = {};
      for (const question of questions.slice(0, MAX_SUBMIT_ENTRIES)) {
        payload[question.questionId] = inputsRef.current[question.questionId] ?? null;
      }
      const result = await submitResponses(token, payload, confirmIncomplete);
      submittingRef.current = false;
      setSubmitting(false);

      if (result.ok) {
        setConfirmMissing(null);
        setAutoSubmitFailed(false);
        setPhase("done");
        return;
      }
      if (result.code === "INCOMPLETE") {
        // 서버 기준 미응답 번호로 재확인 — 빈 목록(방어)은 클라 계산분 폴백.
        const missing =
          result.missing.length > 0
            ? result.missing
            : questions
                .filter((q) => !hasStudentInput(inputsRef.current[q.questionId]))
                .map((q) => q.orderNum);
        setConfirmMissing(missing);
        return;
      }
      if (result.code === "LOCKED") return setPhase("locked");
      if (result.code === "DISABLED") return setPhase("disabled");
      if (result.code === "NOT_FOUND") return setPhase("expired");
      if (options?.auto) {
        setAutoSubmitFailed(true);
        return;
      }
      toast.error(result.message);
    },
    [questions, token, cancelPending],
  );

  // 타이머 만료 → 자동 제출(1회, confirmIncomplete:true)
  const handleTimeExpired = useCallback(() => {
    if (autoSubmittedRef.current) return;
    if (phase !== "taking" && phase !== "review") return;
    autoSubmittedRef.current = true;
    setTimeUp(true);
    setNavOpen(false);
    setConfirmMissing(null);
    setExitConfirmOpen(false);
    void performSubmit(true, { auto: true });
  }, [phase, performSubmit]);

  // 타이머 기산점 — 서버 startedAt(이어하기) 우선, 신규 응시는 [응시 시작] 클릭
  // 시각. 인트로 열람 중에는 duration 을 끊어 카운트다운 자체를 기동하지 않는다.
  const remaining = useCountdown(
    phase === "intro" ? null : session.duration,
    session.startedAt ?? clientStartedAt,
    handleTimeExpired,
  );
  // 잔여 5분 최초 진입 1회 경고 토스트(taking-chrome 소유)
  useTimeWarning(remaining);

  // 인트로 → 응시 진입. clientStartedAt 은 최초 1회만 기록(재진입 리셋 방지).
  const startTaking = useCallback(() => {
    setClientStartedAt((prev) => prev ?? new Date().toISOString());
    setPhase("taking");
  }, []);

  const retryAutoSubmit = useCallback(() => {
    setAutoSubmitFailed(false);
    void performSubmit(true, { auto: true });
  }, [performSubmit]);

  // ── 저장 후 나가기(과제 출처 전용) ──────────────────────────────────────────
  const performExit = useCallback(async () => {
    if (!exitHref) return;
    setExiting(true);
    const drained = await drainPendingSaves();
    if (!drained) {
      setExiting(false);
      toast.error(
        "답안 저장을 완료하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
      );
      return;
    }
    // 표시 상태는 유지(재진입 이어하기의 일부) — 전량 저장 확정 후 이탈.
    window.location.assign(exitHref);
  }, [exitHref, drainPendingSaves]);

  // ── 네비게이션 ──────────────────────────────────────────────────────────────
  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(index, 0), questions.length - 1);
      setCurrentIdx(clamped);
      setNavOpen(false);
      setPhase("taking");
      if (viewMode !== "paper") return;
      // paper: 스크롤+일시 링. review→paper 복귀는 phase 전환 렌더 뒤에야
      // 시트가 존재하므로 rAF 2틱 지연 필수.
      const orderNum = questions[clamped]?.orderNum;
      if (orderNum == null) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document
            .getElementById(`taking-q-${orderNum}`)
            ?.scrollIntoView({ block: "start", behavior: "smooth" });
        });
      });
      setFlashOrderNum(orderNum);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashOrderNum(null), 1800);
    },
    [questions, viewMode],
  );

  // 언마운트 시 하이라이트 해제 타이머 정리
  useEffect(() => () => clearTimeout(flashTimerRef.current ?? undefined), []);

  /** 문항 번호 기준 점프(미응답 칩) — 다이얼로그를 닫고 이동 */
  const jumpToOrder = useCallback(
    (orderNum: number) => {
      const index = questions.findIndex((q) => q.orderNum === orderNum);
      if (index < 0) return;
      setConfirmMissing(null);
      goTo(index);
    },
    [questions, goTo],
  );

  // 한 문제씩 모드에서만 문항 전환 시 스크롤 초기화(paper 는 scrollIntoView 소유).
  useEffect(() => {
    if (viewMode === "single") mainRef.current?.scrollTo({ top: 0 });
  }, [currentIdx, viewMode]);

  const toggleFlag = useCallback((questionId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }, []);

  const navItems = useMemo(
    () =>
      questions.map((question) => ({
        questionId: question.questionId,
        orderNum: question.orderNum,
        answered: hasStudentInput(inputs[question.questionId]),
        flagged: flagged.has(question.questionId),
      })),
    [questions, inputs, flagged],
  );

  const handleReviewSubmit = useCallback(() => {
    const missing = navItems.filter((i) => !i.answered).map((i) => i.orderNum);
    if (missing.length > 0) {
      setConfirmMissing(missing);
      return;
    }
    void performSubmit(false);
  }, [navItems, performSubmit]);

  // ── 글자 크기(가 100→115→130%) — 배율 전후 스크롤 위치 비율 보존 ────────────
  const { fontScale, fontScaleSupported, cycleFontScale } = useFontScale();
  const handleCycleFontScale = useCallback(() => {
    const el = mainRef.current;
    const ratio = el && el.scrollHeight > 0 ? el.scrollTop / el.scrollHeight : 0;
    cycleFontScale();
    requestAnimationFrame(() => {
      const next = mainRef.current;
      if (next) next.scrollTop = ratio * next.scrollHeight;
    });
  }, [cycleFontScale]);

  // ── 상태 화면 ───────────────────────────────────────────────────────────────
  if (phase === "locked") return <LockedScreen />;
  if (phase === "disabled") return <DisabledScreen />;
  if (phase === "expired") return <ExpiredScreen />;
  if (phase === "done") {
    return (
      <SubmitDoneScreen
        examTitle={session.examTitle}
        studentName={session.studentName}
        exitHref={exitHref}
      />
    );
  }
  if (phase === "intro") {
    return (
      <TakingIntroScreen
        examTitle={session.examTitle}
        studentName={session.studentName}
        totalQuestions={session.totalQuestions}
        duration={session.duration}
        mode={session.mode}
        instructions={assignmentInstructions}
        dueLabel={assignmentDueLabel}
        onStart={startTaking}
      />
    );
  }

  const overlays = (
    <>
      {confirmMissing != null && !timeUp && (
        <ConfirmIncompleteDialog
          missingOrderNums={confirmMissing}
          submitting={submitting}
          onCancel={() => setConfirmMissing(null)}
          onConfirm={() => void performSubmit(true)}
          onJump={jumpToOrder}
        />
      )}
      {exitConfirmOpen && !timeUp && (
        <ExitConfirmDialog
          hasTimer={session.duration != null}
          exiting={exiting}
          onCancel={() => setExitConfirmOpen(false)}
          onConfirm={() => void performExit()}
        />
      )}
      {timeUp && <TimeUpOverlay failed={autoSubmitFailed} onRetry={retryAutoSubmit} />}
    </>
  );

  if (phase === "review") {
    return (
      <>
        <ReviewScreen
          examTitle={session.examTitle}
          studentName={session.studentName}
          items={navItems}
          submitting={submitting}
          remaining={remaining}
          onBack={() => setPhase("taking")}
          onJump={goTo}
          onSubmit={handleReviewSubmit}
        />
        {overlays}
      </>
    );
  }

  // ── 응시 화면 ───────────────────────────────────────────────────────────────
  const current = questions[currentIdx];
  if (!current) return <ExpiredScreen />; // 방어 — 로더가 빈 세션을 걸러 실제로는 도달 불가

  const isLast = currentIdx === questions.length - 1;
  const isPaper = viewMode === "paper";
  const answeredCount = navItems.filter((item) => item.answered).length;
  // 진행률은 두 모드 모두 응답 수 기준(응시 진척의 단일 진실).
  const progressPct =
    questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  return (
    <div className="flex h-dvh flex-col bg-[#F7F8FA]">
      <TakingHeader
        examTitle={session.examTitle}
        isPaper={isPaper}
        currentIdx={currentIdx}
        totalCount={questions.length}
        answeredCount={answeredCount}
        progressPct={progressPct}
        remaining={remaining}
        saveState={saveState}
        fontScale={fontScale}
        fontScaleSupported={fontScaleSupported}
        onCycleFontScale={handleCycleFontScale}
        onToggleView={() => setViewMode(isPaper ? "single" : "paper")}
        onOpenNavigator={() => setNavOpen(true)}
        onRetrySave={retrySave}
        onExit={exitHref ? () => setExitConfirmOpen(true) : null}
      />

      {offline && <OfflineBanner />}

      {session.meta.removedOrderNums.length > 0 && (
        <RemovedNotice count={session.meta.removedOrderNums.length} />
      )}

      {/* 중앙 — 시험지 보기(mode A) | 한 문제씩(mode B). 당겨서 새로고침 차단. */}
      <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-y-contain">
        {isPaper ? (
          <PaperTakingView
            examTitle={session.examTitle}
            studentName={session.studentName}
            instructions={assignmentInstructions ?? undefined}
            questions={questions}
            inputs={inputs}
            flagged={flagged}
            disabled={submitting || timeUp}
            highlightOrderNum={flashOrderNum}
            fontScale={fontScale}
            onChange={handleInputChange}
            onToggleFlag={toggleFlag}
          />
        ) : (
          <SingleQuestionCard
            question={current}
            input={inputs[current.questionId] ?? null}
            isFlagged={flagged.has(current.questionId)}
            disabled={submitting || timeUp}
            fontScale={fontScale}
            onChange={(input) => handleInputChange(current.questionId, input)}
            onToggleFlag={() => toggleFlag(current.questionId)}
          />
        )}
      </main>

      <TakingFooter
        isPaper={isPaper}
        isLast={isLast}
        currentIdx={currentIdx}
        onPrev={() => goTo(currentIdx - 1)}
        onNext={() => (isLast ? setPhase("review") : goTo(currentIdx + 1))}
        onOpenNavigator={() => setNavOpen(true)}
        onReview={() => setPhase("review")}
      />

      {navOpen && (
        <NavigatorSheet
          items={navItems}
          currentIndex={currentIdx}
          onSelect={goTo}
          onClose={() => setNavOpen(false)}
        />
      )}
      {overlays}
    </div>
  );
}
