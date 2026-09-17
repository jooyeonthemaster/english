"use client";

// ============================================================================
// 학생 시험 리포트 — 인테이크 패널 프레젠테이션 조각
//
// intake-upload-panel(컨테이너)이 소유한 상태를 받아 그리기만 한다.
// 우 레일 폭 조절 훅/핸들(text-input-board 미러) · 풀폭 CTA(StartButton 미러) ·
// 호스트 폭 판정 훅. 빈 상태 히어로는 intake-empty-hero.tsx, 페이지 작업대
// 2종은 intake-page-workbench.tsx(26-09-03 분리 — 500줄 상한).
// ============================================================================

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { GripVertical, Loader2, PlayCircle, UploadCloud } from "lucide-react";
import { EXAM_ANALYSIS_MIN_CREDITS } from "@/lib/exam-report/types";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";

// ── 업로드 진행 바 ───────────────────────────────────────────────────────────
export function ProgressBar({
  label,
  ratio,
}: {
  label: string;
  ratio: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{
            width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

// ── 호스트 폭 판정 — 좁은 호스트는 2컬럼 대신 세로 스택(26-09-03) ─────────────
// 뷰포트가 아니라 **패널 자신의 폭**으로 판정한다: 스튜디오 중앙 열은 1600 뷰포트
// 에서도 ~670px 라 lg: 류 변형이 "PC" 로 오판해 2컬럼을 강행했다(실측 원인).
// useLayoutEffect 로 첫 페인트 전에 측정 — 2컬럼이 잠깐 번쩍이는 플래시 0.
// display:none 유지 마운트(스튜디오 등록 모드 닫힘)에선 폭 0 → narrow 판정이지만
// 열리는 순간 ResizeObserver 가 재판정한다.
export const INTAKE_STACK_BREAKPOINT = 880;

export function useContainerNarrow(
  ref: RefObject<HTMLElement | null>,
  threshold: number,
): boolean {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setNarrow(el.clientWidth < threshold);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, threshold]);
  return narrow;
}

// ── 우 레일 폭 조절 — text-input-board 의 훅/핸들 미러(키만 exam-report) ─────
const RAIL_W_KEY = "smoat:exam-report:rail-width";
const RAIL_W_DEFAULT = 420;
const clampRailW = (w: number) => Math.min(760, Math.max(320, Math.round(w)));

export function useRailWidth() {
  const [railWidth, setRailWidth] = useState<number>(() => {
    if (typeof window === "undefined") return RAIL_W_DEFAULT;
    const raw = window.localStorage.getItem(RAIL_W_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isNaN(n) ? RAIL_W_DEFAULT : clampRailW(n);
  });
  // 드래그 시작 폭은 ref 로 읽는다 — 핸들러 정체성을 커밋마다 갈지 않는다.
  const railWidthRef = useRef(railWidth);
  railWidthRef.current = railWidth;

  // 성능 계약(resizable-panels startResize 동형): 드래그 중에는 React 를 거치지
  // 않는다 — 매 pointermove 의 setState 는 IntakeUploadPanel 전체(페이지 작업대
  // 썸네일 그리드 + 우 레일 폼)를 프레임마다 리렌더시킨다. 이동 중에는
  // [data-rail-panel] 요소의 style.width 에 rAF 코얼레싱으로 직접 쓰고, 놓을 때
  // 한 번만 커밋+영속한다. 앵커를 못 찾으면 종전 setState 경로로 폴백(무회귀).
  const beginRailResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startW = railWidthRef.current;

      // 포인터 캡처 — 커서가 얇은 핸들을 벗어나도 드래그가 끊기지 않는다.
      const handle = event.currentTarget as HTMLElement;
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        /* 캡처 미지원 브라우저는 window 리스너로 폴백 */
      }

      // 드래그 대상 레일 실체 — 핸들 형제의 [data-rail-panel].
      const railEl =
        handle.parentElement?.querySelector<HTMLElement>("[data-rail-panel]") ??
        (handle.nextElementSibling instanceof HTMLElement
          ? handle.nextElementSibling
          : null);

      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // 드래그 중 hover 스타일 재평가 차단 — 레일 폭이 바뀌면 좌 작업대가
      // 밀리며 커서 아래 요소가 계속 바뀐다(캡처 덕에 move 수신은 유지).
      document.body.style.pointerEvents = "none";

      let latest = startW;
      // rAF 코얼레싱 — 고주사율 포인터가 프레임당 여러 번 발화해도 기록은 1회.
      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        if (railEl) railEl.style.width = `${latest}px`;
      };
      const move = (e: PointerEvent) => {
        e.preventDefault();
        // 왼쪽으로 끌면 우측 고정 레일이 넓어진다.
        latest = clampRailW(startW - (e.clientX - startX));
        if (railEl) {
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } else {
          // 폴백 — 앵커를 못 찾으면 종전대로 상태 갱신.
          setRailWidth(latest);
        }
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (railEl) railEl.style.width = `${latest}px`;
        // 커밋은 여기서 한 번 — 드래그 내내 리렌더 0회.
        setRailWidth(latest);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        document.body.style.pointerEvents = prevPointerEvents;
        try {
          handle.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        try {
          window.localStorage.setItem(RAIL_W_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [],
  );
  return { railWidth, beginRailResize };
}

export function RailResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      title="드래그하여 시험 정보 패널 폭 조절"
      aria-label="시험 정보 패널 폭 조절"
      className="group/rhandle no-print hidden h-full min-h-0 w-3 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 border-l border-slate-100 bg-slate-50 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 lg:flex"
    >
      <GripVertical
        className="size-3 opacity-50 transition-opacity group-hover/rhandle:opacity-80"
        aria-hidden="true"
      />
      <span style={{ writingMode: "vertical-rl" }}>시험 정보</span>
    </button>
  );
}

// ── 풀폭 CTA — 문제/학습지 생성 CTA 표준 레시피(rounded-xl + 파랑 그림자) ────
export function IntakeCta({
  disabled,
  busy,
  busyLabel,
  pageCount,
  isError,
  onClick,
}: {
  disabled: boolean;
  busy: boolean;
  busyLabel: string;
  pageCount: number;
  isError: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      // aria-disabled — 비활처럼 보이되 클릭은 살려, handleStart 의 검증 토스트가
      // 막힌 사유(페이지 없음/제목 없음)를 안내한다.
      aria-disabled={disabled}
      className={
        "inline-flex h-12 w-full items-center justify-center rounded-xl px-3 text-[14px] font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
        (busy
          ? "cursor-wait bg-blue-600 text-white"
          : disabled
            ? "cursor-not-allowed bg-slate-200 text-slate-400"
            : "cursor-pointer bg-blue-600 text-white shadow-md shadow-blue-200/50 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200/60")
      }
    >
      {busy ? (
        <span className="flex min-w-0 items-center justify-center gap-2">
          <Loader2
            className="size-5 shrink-0 animate-spin"
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">{busyLabel}</span>
        </span>
      ) : pageCount === 0 ? (
        // 빈 상태는 다음 행동을 라벨로 안내(문제 생성 CTA "지문을 선택하세요" 미러).
        <span className="flex min-w-0 items-center justify-center gap-2">
          <UploadCloud className="size-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">시험지 페이지를 추가하세요</span>
        </span>
      ) : (
        <>
          <span className="flex min-w-0 items-center justify-center gap-2">
            <PlayCircle className="size-5 shrink-0" aria-hidden="true" />
            {/* 좁은 레일에서 줄바꿈 대신 truncate(생성 CTA 라벨 구조 미러) */}
            <span className="min-w-0 truncate">
              {isError ? "다시 시도" : "등록하고 분석 시작"}
              {` (${pageCount}페이지)`}
            </span>
          </span>
          {/* 과금 안내 — 생성 CTA 의 bg-white/20 CreditCostChip pill 미러.
              단가는 CREDIT_COSTS.EXAM_ANALYSIS(문항당) · 최소 EXAM_ANALYSIS_MIN_CREDITS.
              푸터 컨테이너 460px 미만이면 버튼 밖 캡션으로 내려간다(실측: 허브
              기본 레일 420=푸터 400 에서도 수 px 절단) — 스튜디오 레일 380px 에서 "등록하고 분석 시작 (..." 으로 잘리던 것 수리. */}
          <span className="ml-2 hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-white/20 px-2 py-1 text-[11px] font-semibold @[460px]:inline-flex">
            문항당
            <CreditCostChip
              amount={CREDIT_COSTS.EXAM_ANALYSIS}
              className="text-white"
            />
            · 최소 {EXAM_ANALYSIS_MIN_CREDITS}
          </span>
        </>
      )}
    </button>
  );
}

/** 좁은 푸터용 과금 캡션 — IntakeCta 의 pill 이 숨는 폭(<460px)에서만 보인다. */
export function IntakeCreditCaption({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <p className="mt-1.5 flex items-center justify-center gap-1 whitespace-nowrap text-[11px] font-semibold text-slate-500 @[460px]:hidden">
      문항당
      <CreditCostChip amount={CREDIT_COSTS.EXAM_ANALYSIS} />· 최소{" "}
      {EXAM_ANALYSIS_MIN_CREDITS}
    </p>
  );
}
