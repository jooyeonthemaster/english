"use client";

// ============================================================================
// 스튜디오 온보딩 투어 — 오케스트레이터 (.tmp-studio-tour/spec.md §1)
//
// 프롭 0 자립 계층: 필 전환은 실 필 버튼 click()(사용자 클릭과 동일 경로),
// 상태 스냅숏은 DOM 파생. 서버 액션 0 · 스토어 쓰기 0 · 픽 생성 0.
// idle 이면 포털 자체를 마운트하지 않는다(T10 — DOM 기여 0).
//
// 자동 환영 억제(T4): navigator.webdriver(기존 QA 프로브 12종 보호) · ?tour=off.
// ?tour=start 만이 억제를 뚫는다(투어 자체 프로브 전용).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  autoWelcomeSuppressed,
  isXlViewport,
  readTourParam,
  readTourState,
  writeTourState,
} from "./storage";
import { SpotlightLayer } from "./spotlight";
import { TooltipCard } from "./tooltip-card";
import { ExitConfirmCard, FinishCard, WelcomeCard } from "./welcome";
import { buildTourSteps } from "./steps";
import {
  TOUR_CHAPTERS,
  TOUR_OPEN_EVENT,
  assetPillSelector,
  type TourStepRuntime,
} from "./types";
import { classStudioNoticePending } from "@/lib/class-studio-notice";

type Phase = "idle" | "welcome" | "running" | "exit-confirm" | "finished";

export function StudioTour() {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [isXl, setIsXl] = useState(false);

  const steps = useMemo<TourStepRuntime[]>(() => buildTourSteps(), []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const step = steps[Math.min(stepIndex, steps.length - 1)];

  // ── 마운트·자동 환영 판정 ────────────────────────────────────────────────
  // 태스크로 한 틱 미룬다: SSR 하이드레이션 가드(mounted)와 effect 내 동기
  // setState 금지 규칙을 동시에 만족한다(idle 은 어차피 null 렌더).
  // 저장된 스텝 id → 현재 원장의 index (미발견·부재 = 0 = 처음부터).
  const resolveSavedIndex = useCallback(
    (id: string | undefined): number => {
      if (!id) return 0;
      const idx = steps.findIndex((s) => s.id === id);
      return idx >= 0 ? idx : 0;
    },
    [steps],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      setMounted(true);
      const saved = readTourState();
      setResumeAvailable(
        saved?.status === "pending" && resolveSavedIndex(saved.step) > 0,
      );
      setIsXl(isXlViewport());

      const param = readTourParam();
      if (param === "start") {
        setPhase("welcome");
        return;
      }
      if (autoWelcomeSuppressed()) return;
      // 「클래스 스튜디오 오픈」 공지가 아직 안 읽혔다면 자동 환영을 미룬다 —
      // 스튜디오 첫 방문에서 공지와 환영 카드가 같은 순간 두 겹으로 뜨는 것을
      // 막는다. 공지의 [둘러보기] 는 TOUR_OPEN_EVENT(수동 개방)로 직접 넘어온다.
      if (classStudioNoticePending()) return;
      if (saved) return; // 이미 완료·미룸·진행 저장 사용자 — 자동 재개방 없음
      if (!isXlViewport()) return; // 좁은 화면 첫 방문 — 다음 xl 방문에서 자동 환영
      setPhase("welcome");
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  // 수동 개방(헤더 「튜토리얼」 버튼) — 언제나 허용.
  useEffect(() => {
    const open = () => {
      const saved = readTourState();
      setResumeAvailable(
        saved?.status === "pending" && resolveSavedIndex(saved.step) > 0,
      );
      setIsXl(isXlViewport());
      setPhase("welcome");
    };
    window.addEventListener(TOUR_OPEN_EVENT, open);
    return () => window.removeEventListener(TOUR_OPEN_EVENT, open);
  }, [resolveSavedIndex]);

  // 환영 카드가 열린 동안 뷰포트 변화 추적(창을 키우면 시작 가능해진다).
  useEffect(() => {
    if (phase !== "welcome") return;
    const mq = window.matchMedia("(min-width: 1280px)");
    const sync = () => setIsXl(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [phase]);

  // 투어 활성 표식 — coach.tsx 억제 축 + 프로브 판독 축.
  useEffect(() => {
    if (phase !== "idle") {
      document.body.dataset.studioTourActive = "1";
      return () => {
        delete document.body.dataset.studioTourActive;
      };
    }
    return undefined;
  }, [phase]);

  // ── 진행 제어 ────────────────────────────────────────────────────────────
  const startTour = useCallback(() => {
    const saved = readTourState();
    const idx =
      saved?.status === "pending" ? resolveSavedIndex(saved.step) : 0;
    setStepIndex(idx);
    setPhase("running");
    writeTourState({ v: 1, status: "pending", step: steps[idx]?.id ?? "" });
  }, [steps, resolveSavedIndex]);

  const dismissWelcome = useCallback(() => {
    const saved = readTourState();
    // 진행 저장이 있으면 보존한다(미룸으로 강등 금지 — 이어보기 계약).
    if (!saved || saved.status !== "pending") {
      writeTourState({ v: 1, status: "dismissed", step: "" });
    }
    setPhase("idle");
  }, []);

  const finishTour = useCallback(() => {
    writeTourState({ v: 1, status: "done", step: "" });
    setPhase("finished");
  }, []);

  // 업데이터 안 부수효과 금지(StrictMode 이중 호출) — stepIndex 를 직접 읽는다.
  const goNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      finishTour();
      return;
    }
    setStepIndex(stepIndex + 1);
  }, [stepIndex, steps.length, finishTour]);

  const goPrev = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  const jumpChapter = useCallback(
    (chapterIdx: number) => {
      const target = TOUR_CHAPTERS[chapterIdx];
      if (!target) return;
      const idx = steps.findIndex((s) => s.chapter === target.id);
      if (idx >= 0) setStepIndex(idx);
    },
    [steps],
  );

  const skipChapter = useCallback(() => {
    const cur = steps[stepIndex]?.chapter;
    const nextIdx = steps.findIndex((s, j) => j > stepIndex && s.chapter !== cur);
    if (nextIdx === -1) {
      finishTour();
      return;
    }
    setStepIndex(nextIdx);
  }, [steps, stepIndex, finishTour]);

  const exitAndSave = useCallback(() => {
    writeTourState({
      v: 1,
      status: "pending",
      step: steps[stepIndex]?.id ?? "",
    });
    setPhase("idle");
  }, [steps, stepIndex]);

  const closeFinished = useCallback(() => setPhase("idle"), []);

  const goStartAfterFinish = useCallback(() => {
    document
      .querySelector<HTMLButtonElement>(assetPillSelector("passages"))
      ?.click();
    setPhase("idle");
  }, []);

  // ── 스텝 진입 부수효과: 저장 · 뷰 보장 · 앵커 스크롤 ─────────────────────
  useEffect(() => {
    if (phase !== "running" || !step) return;
    writeTourState({ v: 1, status: "pending", step: step.id });

    const timers: number[] = [];
    if (step.view) {
      // 뷰 보장 — 필 부재의 두 원인을 모두 처리한다(적대검수 확정):
      // ① 클래스 미선택 → 퀵 선택 실클릭  ② 들여오기 집중 모드(takeover) →
      // 「지문관리로 돌아가기」 실클릭(입력 중 초안은 intake 가 자체 보존).
      // 이후 필 마운트를 재시도한다(150ms × 4). 픽·서버 상태는 만들지 않는다.
      let viewTries = 0;
      const ensureView = () => {
        const pill = document.querySelector<HTMLButtonElement>(
          assetPillSelector(step.view!),
        );
        if (pill) {
          if (pill.getAttribute("aria-pressed") !== "true") pill.click();
          return;
        }
        if (viewTries === 0) {
          const intakeBack = document.querySelector<HTMLButtonElement>(
            '[data-tour="intake-back"]',
          );
          if (intakeBack) intakeBack.click();
          else
            document
              .querySelector<HTMLButtonElement>('[data-tour="quick-class"]')
              ?.click();
        }
        viewTries += 1;
        if (viewTries < 5) timers.push(window.setTimeout(ensureView, 150));
      };
      ensureView();
    }

    if (step.anchor) {
      let tries = 0;
      const tryScroll = () => {
        const el = document.querySelector<HTMLElement>(step.anchor!);
        if (el) {
          el.scrollIntoView({ block: "nearest", inline: "nearest" });
          return;
        }
        tries += 1;
        if (tries < 4) timers.push(window.setTimeout(tryScroll, 150));
      };
      tryScroll();
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [phase, stepIndex, step]);

  // 포커스: 카드로(스텝마다) — preventScroll 로 스크롤 하이재킹 방지.
  useEffect(() => {
    if (phase === "running") cardRef.current?.focus({ preventScroll: true });
  }, [phase, stepIndex]);

  // ── 키보드 ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      // IME 조합 중 키(한글 입력의 Escape 취소 등)는 투어가 소비하지 않는다.
      if (e.isComposing || e.keyCode === 229) return;
      const t = e.target as HTMLElement | null;
      const inField =
        !!t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

      if (phase === "running") {
        if (e.key === "Escape") {
          // 앱의 Esc 사다리(조판 닫기 등)로 새지 않게 캡처 단계에서 흡수한다.
          e.preventDefault();
          e.stopPropagation();
          setPhase("exit-confirm");
          return;
        }
        if (e.key === "Tab") {
          // 포커스 트랩 — 컨테이너(카드 + 오버레이 데모) 안에서 순환.
          const scope = containerRef.current;
          if (!scope) return;
          const focusables = Array.from(
            scope.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null);
          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          const active = document.activeElement as HTMLElement | null;
          if (!active || !scope.contains(active)) {
            e.preventDefault();
            first.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          } else if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
          }
          return;
        }
        if (inField || (t && t.tagName === "BUTTON")) return;
        if (e.key === "ArrowRight" || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          goNext();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          goPrev();
        }
        return;
      }
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (phase === "exit-confirm") setPhase("running");
      else if (phase === "welcome") dismissWelcome();
      else if (phase === "finished") closeFinished();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase, goNext, goPrev, dismissWelcome, closeFinished]);

  // 딤 클릭 = 카드 시선 유도 펄스(진행 아님).
  const pulseCard = useCallback(() => {
    cardRef.current?.animate(
      [
        { boxShadow: "0 0 0 0 rgba(59,130,246,0.55)" },
        { boxShadow: "0 0 0 14px rgba(59,130,246,0)" },
      ],
      { duration: 420, easing: "ease-out" },
    );
  }, []);

  // 앵커 소실 fallback:"skip" — 스텝을 조용히 넘긴다.
  const onFallbackSkip = useCallback(() => goNext(), [goNext]);

  if (!mounted || phase === "idle" || !step) return null;

  const doneChapters = new Set<string>();
  for (const c of TOUR_CHAPTERS) {
    const lastIdx = steps.reduce(
      (acc, s, i) => (s.chapter === c.id ? i : acc),
      -1,
    );
    if (lastIdx !== -1 && lastIdx < stepIndex) doneChapters.add(c.id);
  }

  const overlayDemo = step.demo?.kind === "overlay" ? step.demo : null;
  const stageDemo = step.demo?.kind === "stage" ? step.demo.render() : null;

  return createPortal(
    <div
      ref={containerRef}
      data-studio-tour
      data-tour-phase={phase}
      className="fixed inset-0 z-[100]"
      style={{ pointerEvents: "none" }}
    >
      {phase === "running" ? (
        <>
          <SpotlightLayer
            stepKey={step.id}
            anchor={step.anchor}
            fallback={step.fallback ?? "center"}
            padding={step.padding ?? 8}
            radius={step.radius ?? 12}
            interactive={step.interactive ?? false}
            placement={step.placement ?? "auto"}
            overlayAnchor={overlayDemo?.anchor}
            cardRef={cardRef}
            arrowRef={arrowRef}
            overlayRef={overlayRef}
            containerRef={containerRef}
            onDimClick={pulseCard}
            onFallbackSkip={onFallbackSkip}
          />
          {overlayDemo ? (
            <div
              ref={overlayRef}
              data-tour-overlay
              className="absolute left-0 top-0 overflow-auto rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/30"
              // pointerEvents 는 spotlight 루프가 표시 상태와 함께 토글한다 —
              // 초기 auto 고정이면 숨김(opacity 0) 상태의 투명 div 가 좌상단에서
              // 딤 클릭을 삼킨다(적대검수 확정 minor).
              style={{ pointerEvents: "none", opacity: 0, willChange: "transform" }}
            >
              {overlayDemo.render()}
            </div>
          ) : null}
          <TooltipCard
            step={step}
            stepNumber={stepIndex + 1}
            totalSteps={steps.length}
            doneChapters={doneChapters}
            stageDemo={stageDemo}
            isFirst={stepIndex === 0}
            isLast={stepIndex === steps.length - 1}
            cardRef={cardRef}
            arrowRef={arrowRef}
            onPrev={goPrev}
            onNext={goNext}
            onJumpChapter={jumpChapter}
            onSkipChapter={skipChapter}
            onExitRequest={() => setPhase("exit-confirm")}
          />
        </>
      ) : (
        <div
          className="absolute inset-0 bg-slate-950/60"
          style={{ pointerEvents: "auto" }}
        />
      )}
      {phase === "welcome" ? (
        <WelcomeCard
          isXl={isXl}
          hasResume={resumeAvailable}
          onStart={startTour}
          onDismiss={dismissWelcome}
        />
      ) : null}
      {phase === "exit-confirm" ? (
        <ExitConfirmCard
          onContinue={() => setPhase("running")}
          onExit={exitAndSave}
        />
      ) : null}
      {phase === "finished" ? (
        <FinishCard onGoStart={goStartAfterFinish} onClose={closeFinished} />
      ) : null}
    </div>,
    document.body,
  );
}
