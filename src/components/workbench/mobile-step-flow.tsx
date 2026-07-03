"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 워크벤치 모바일 스텝 플로우 공용 UI.
 *
 * PC(≥lg)에서는 한 화면에 여러 기능을 함께 쓰지만, 모바일(<lg)에서는
 * "한 화면 = 한 기능"이 되도록 페이지를 스텝으로 쪼갠다. 이 파일은 그
 * 껍데기(상단 스테퍼 + 하단 고정 이전/다음 바)만 제공하고, 스텝 상태와
 * 전환 규칙은 각 페이지가 소유한다. 모든 요소는 lg:hidden — PC 레이아웃에는
 * 어떤 영향도 주지 않는다.
 */

export interface MobileFlowStep {
  key: string;
  label: string;
}

/** <lg(1024px 미만) 뷰포트 여부 — SSR/첫 페인트는 false(PC 무영향). */
export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023.98px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isMobile;
}

/**
 * 상단 스테퍼 — 번호 원 + 라벨, 연결선. 지난 스텝은 체크, 현재는 파랑.
 * 스텝을 탭하면 바로 이동한다(각 페이지가 onSelect에서 가드).
 */
export function MobileStepHeader({
  steps,
  currentKey,
  onSelect,
}: {
  steps: readonly MobileFlowStep[];
  currentKey: string;
  onSelect: (key: string) => void;
}) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === currentKey),
  );
  return (
    <nav
      aria-label="진행 단계"
      className="rounded-lg border border-slate-200 bg-white px-2 py-2.5 shadow-sm lg:hidden"
    >
      <ol className="flex items-start">
        {steps.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={step.key} className="flex min-w-0 flex-1 items-start">
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  className={
                    "mt-[13px] h-0.5 min-w-3 flex-1 rounded-full " +
                    (i <= currentIndex ? "bg-blue-500" : "bg-slate-200")
                  }
                />
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(step.key)}
                aria-current={active ? "step" : undefined}
                className="flex shrink-0 cursor-pointer flex-col items-center gap-1 px-1.5"
              >
                <span
                  className={
                    "flex size-[26px] items-center justify-center rounded-full border text-[12px] font-bold transition-colors " +
                    (active
                      ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                      : done
                        ? "border-blue-200 bg-blue-50 text-blue-600"
                        : "border-slate-200 bg-white text-slate-400")
                  }
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={
                    "text-[10.5px] font-semibold leading-tight " +
                    (active
                      ? "text-blue-700"
                      : done
                        ? "text-slate-600"
                        : "text-slate-400")
                  }
                >
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * 하단 고정 이전/다음 바. prev/next 를 null 로 주면 해당 버튼이 빠진다.
 * next.onClick 없이 disabled 만 주면 비활성 안내 버튼이 된다.
 *
 * 비활성 상태에서도 힌트를 주려면 `onDisabledHint` 를 준다 — PC 와 동일하게
 * 네이티브 disabled 대신 aria-disabled(클릭 살림)로 만들어, 눌렀을 때 어떤
 * 요소를 조작해야 하는지 파란 글로우로 유도한다.
 */
export function MobileStepNav({
  prev,
  next,
  hint,
}: {
  prev: { label: string; onClick: () => void } | null;
  next: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    /** 비활성일 때 눌렀을 때 실행 — 보통 대상 요소를 힌트 글로우시킨다. */
    onDisabledHint?: () => void;
  } | null;
  /** 다음 버튼 위에 얇게 띄우는 안내 문구 (비활성 사유 등). */
  hint?: ReactNode;
}) {
  const nextDisabled = next ? next.disabled || !next.onClick : false;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {hint ? (
        <p className="border-b border-slate-100 px-4 py-1.5 text-center text-[11.5px] text-slate-500">
          {hint}
        </p>
      ) : null}
      <div className="flex items-center gap-2 px-4 py-2.5">
        {prev ? (
          <button
            type="button"
            onClick={prev.onClick}
            className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {prev.label}
          </button>
        ) : null}
        {next ? (
          <button
            type="button"
            // 네이티브 disabled 대신 aria-disabled — 비활성처럼 보이되 클릭은 살려
            // 눌렀을 때 onDisabledHint(글로우 유도)를 띄운다(PC 와 동일한 UX).
            aria-disabled={nextDisabled}
            onClick={() => {
              if (nextDisabled) {
                next.onDisabledHint?.();
                return;
              }
              next.onClick?.();
            }}
            className={
              "inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-4 text-[13.5px] font-bold transition-colors " +
              (nextDisabled
                ? "cursor-not-allowed bg-slate-200 text-slate-400"
                : "cursor-pointer bg-blue-600 text-white hover:bg-blue-700")
            }
          >
            <span className="truncate">{next.label}</span>
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          </button>
        ) : (
          <span className="flex-1" />
        )}
      </div>
    </div>
  );
}
