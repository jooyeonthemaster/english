"use client";

// ============================================================================
// 인쇄 진행 상태 표시줄 — 모든 화면 폭에서 보인다(툴바의 인쇄 버튼 · 다운로드 메뉴는 lg 미만에서
// 숨겨지므로, 좁은 화면 · 대화상자에서도 진행 상태와 제스처 폴백이 보여야 한다).
//  · 라이브 영역(role=status · aria-live=polite)은 항상 마운트해 두고 내용만 바꾼다 — 새로 삽입된
//    라이브 영역은 스크린리더가 읽지 않는 경우가 있다. idle · done 에는 막대를 그리지 않는다(높이 0).
//  · 누름 무장(print-arming.ts): idle · done 에서 무장되면 「준비 중」으로 그린다 — 누르는 순간(click 전) 페인트돼
//    빠른 경로가 click 태스크 안에서 조판 · 인쇄하느라 멈춘 동안에도 보인다. needs-gesture · blocked 에서 이 막대의
//    [인쇄] · [다시 시도]를 누르면 배치는 그대로 두고 아이콘만 스피너로 바꾼다(버튼이 움직이면 click 이 빗나간다).
//  · 진행 중(무장 · preparing · printing) 막대는 미리보기 위에 겹친다(레이아웃 이동 0 — 누름 뒤 첫 페인트가 가볍다).
//    needs-gesture · blocked 는 흐름 안에 둔다(사용자가 읽고 눌러야 하므로 내용을 가리지 않는다).
//  · 스피너는 motion-safe:animate-spin — 컴포지터 애니메이션이라 동기 마운트 중에도 돈다.
//  · 인쇄에는 찍히지 않는다(no-print).
// ============================================================================

import { AlertTriangle, Loader2, Printer, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { printArmHandlers, usePrintArmed } from "./print-arm-ui";
import type {
  ExamPrintController,
  ExamPrintControllerState,
  ExamPrintMode,
  ExamPrintPhase,
} from "./use-exam-print-controller";

const BUTTON_BASE =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1 px-2.5 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3182F6]/60 focus-visible:ring-offset-1";
const BUTTON_PRIMARY = `${BUTTON_BASE} bg-[#3182F6] text-white hover:bg-[#1b64da] active:bg-[#1b64da]`;
const BUTTON_QUIET = `${BUTTON_BASE} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`;
const SPIN = "h-3.5 w-3.5 motion-safe:animate-spin";

function blockedDetail(state: ExamPrintControllerState): string {
  switch (state.reason) {
    case "unmounted-pages": {
      const pages = state.missingPages.map((index) => index + 1);
      const shown = pages.slice(0, 5).join(", ");
      const more = pages.length > 5 ? ` 외 ${pages.length - 5}쪽` : "";
      return pages.length > 0
        ? `${shown}쪽${more}이 아직 그려지지 않아 백지로 나갈 수 있어 멈췄습니다.`
        : "그려지지 않은 쪽이 있어 멈췄습니다.";
    }
    case "not-primary-root":
      return "다른 시험지 미리보기가 함께 열려 있어 인쇄 대상을 정하지 못했습니다. 다른 창을 닫고 다시 시도해 주세요.";
    case "no-root":
      return "미리보기를 찾지 못했습니다.";
    default:
      return "잠시 후 다시 시도해 주세요.";
  }
}

/** 표시줄이 그릴 단계 · 모드 — 잡이 아직 없는(또는 끝난) 상태에서 무장됐으면 「준비 중」(누름 무장) */
export function printBarView(
  state: Pick<ExamPrintControllerState, "phase" | "mode">,
  armed: ExamPrintMode | null,
): { phase: ExamPrintPhase; visible: boolean; mode: ExamPrintMode } {
  const settled = state.phase === "idle" || state.phase === "done";
  const phase: ExamPrintPhase = settled && armed !== null ? "preparing" : state.phase;
  const mode = (settled ? armed : state.mode) ?? state.mode ?? "plain";
  return { phase, visible: phase !== "idle" && phase !== "done", mode };
}

export function PrintStatusBar({
  controller,
  className,
}: {
  controller: Pick<ExamPrintController, "state" | "print" | "cancel" | "arming">;
  className?: string;
}) {
  const { state, print, cancel, arming } = controller;
  const armed = usePrintArmed(arming);
  const { phase, visible, mode } = printBarView(state, armed);
  const subject = mode === "explanation" ? "해설 포함 시험지" : "시험지";

  let body = null;
  if (visible) {
    const busy = phase === "preparing" || phase === "waiting-load" || phase === "printing" || armed !== null;
    // 진행 중(무장 · 준비 · 인쇄 창 · load 대기) 막대는 미리보기 위에 겹쳐 그린다 — 흐름에 끼우면 미리보기 전체가 44px 밀려 A4 쪽을
    // 전부 다시 래스터한다(CPU 4× 실측 커밋→페인트 12~135ms, 누름과 click 사이 페인트를 놓침). 메뉴(z-30)보다 아래(z-20)라
    // 메뉴 항목을 누르는 중 막대가 떠도 click 을 가로채지 않는다. 사용자가 반응해야 하는 needs-gesture · blocked 는 흐름 안.
    const overlay = phase === "preparing" || phase === "waiting-load" || phase === "printing";
    const tone =
      phase === "blocked"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : phase === "needs-gesture"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-blue-100 bg-blue-50 text-slate-700";
    const icon = busy ? (
      <Loader2 className="h-4 w-4 shrink-0 text-[#3182F6] motion-safe:animate-spin" aria-hidden="true" />
    ) : phase === "blocked" ? (
      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
    ) : (
      <Printer className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
    );
    const title =
      phase === "preparing"
        ? `${subject} 준비 중`
        : phase === "waiting-load"
          ? "페이지를 마저 불러오는 중"
          : phase === "printing"
            ? "인쇄 창 여는 중"
            : phase === "needs-gesture"
              ? "인쇄 창이 열리지 않았다면 [인쇄]를 눌러 주세요"
              : "인쇄 준비에 실패했습니다";
    const detail =
      phase === "preparing"
        ? "글꼴 · 쪽 그리기"
        : phase === "waiting-load"
          ? "다 불러오면 인쇄 창이 열립니다."
          : phase === "needs-gesture"
            ? "브라우저가 자동으로 연 인쇄 창을 막았을 수 있습니다."
            : phase === "blocked"
              ? blockedDetail(state)
              : null;
    // 이 막대의 [인쇄] · [다시 시도]도 진입점이다 — 누르는 순간 무장(배치 불변, 아이콘만 스피너)
    const retryProps = { ...printArmHandlers(arming, mode), "aria-busy": armed !== null || undefined };

    body = (
      <div
        className={cn(
          "flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-1.5 lg:px-4",
          overlay && "absolute inset-x-0 top-0 z-20 shadow-sm",
          tone,
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {icon}
          <p className="min-w-0 text-[12px] leading-snug">
            <span className="font-bold">{title}</span>
            {detail ? <span className="ml-1.5 opacity-80">{detail}</span> : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {phase === "needs-gesture" && (
            <button type="button" className={BUTTON_PRIMARY} onClick={() => print(mode)} {...retryProps}>
              {armed !== null ? <Loader2 className={SPIN} aria-hidden="true" /> : <Printer className="h-3.5 w-3.5" aria-hidden="true" />}
              인쇄
            </button>
          )}
          {phase === "blocked" && (
            <button type="button" className={BUTTON_PRIMARY} onClick={() => print(mode)} {...retryProps}>
              {armed !== null ? <Loader2 className={SPIN} aria-hidden="true" /> : <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />}
              다시 시도
            </button>
          )}
          <button type="button" className={BUTTON_QUIET} onClick={cancel}>
            {phase === "preparing" || phase === "waiting-load" ? "취소" : "닫기"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className={cn("no-print relative shrink-0", className)}>
      {body}
    </div>
  );
}
