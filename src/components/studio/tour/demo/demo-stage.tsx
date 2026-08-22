"use client";

// ============================================================================
// 데모 스테이지 공용 프리미티브 (.tmp-studio-tour/spec.md §3 공통)
//
// 모든 데모가 이 파일의 프레임·칩·토글로 통일된 시각 언어를 쓴다.
// 데모는 순수 목업이다: 서버 액션 0 · 스토어 쓰기 0. 이모지 금지(§10).
// ============================================================================

import type { ReactNode } from "react";
import { Eye } from "lucide-react";

/**
 * 스테이지 데모 프레임 — 카드 안에 들어가는 시연 영역.
 * 상단에 「예시 화면」 신뢰 캡션을 고정해 실 데이터로 오인하지 않게 한다.
 */
export function DemoFrame({
  caption = "예시 화면 — 실제 데이터가 아닙니다",
  children,
  className,
}: {
  caption?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex max-h-[56vh] flex-col">
      {/* min-h(고정 h 금지): 좁은 오버레이(우측 360px)에서 캡션이 2줄로 감기면
          고정 높이 행이 위로 넘친 글자를 잘라 먹는다(픽셀 실측으로 확정한 결함). */}
      <div className="flex min-h-7 shrink-0 items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-1">
        <Eye className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="text-[10.5px] font-semibold leading-snug tracking-tight text-slate-400 break-keep">
          {caption}
        </span>
      </div>
      <div className={`min-h-0 flex-1 overflow-auto p-3 ${className ?? ""}`}>{children}</div>
    </div>
  );
}

/** 세그먼트 토글 버튼 — 실 화면의 세그먼트 관용구를 미러한 데모용. */
export function DemoToggle({
  active,
  label,
  onClick,
  testId,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-demo-toggle={testId ?? label}
      aria-pressed={active}
      className={`inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-[12px] font-semibold transition-colors ${
        active
          ? "border-blue-500 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** 작은 배지 — 유형·난이도·개수 표기. */
export function DemoBadge({
  tone = "slate",
  children,
}: {
  tone?: "slate" | "blue" | "violet" | "emerald" | "rose" | "amber";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    slate: "border-slate-200 bg-slate-50 text-slate-500",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-600",
    rose: "border-rose-200 bg-rose-50 text-rose-600",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[10.5px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** 데모 체크박스 — 실 목록의 role=checkbox 관용구 미러(순번 표시 지원). */
export function DemoCheck({
  checked,
  order,
  tone = "blue",
  onToggle,
  label,
}: {
  checked: boolean;
  /** 체크 순번(1-base) — 실 화면의 「선택 순번 배지」 미러 */
  order?: number;
  /** 문항 blue / 학습지 violet — E24-1-4 색 문법 미러 */
  tone?: "blue" | "violet";
  onToggle: () => void;
  label: string;
}) {
  const on =
    tone === "violet"
      ? "border-violet-500 bg-violet-500 text-white"
      : "border-blue-500 bg-blue-500 text-white";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold transition-colors ${
        checked ? on : "border-slate-300 bg-white text-transparent hover:border-slate-400"
      }`}
      onClick={onToggle}
    >
      {checked ? (order ?? "") : ""}
    </button>
  );
}

/** 미니 종이 — A4/B4 비율 축소 프리뷰의 공용 골격. */
export function DemoPaper({
  size = "A4",
  children,
  className,
}: {
  size?: "A4" | "B4";
  children: ReactNode;
  className?: string;
}) {
  // A4 210×297 · B4 257×364 — 비율만 재현한다.
  const ratio = size === "A4" ? "210 / 297" : "257 / 364";
  return (
    <div
      data-demo-paper={size}
      className={`mx-auto flex flex-col overflow-hidden rounded border border-slate-300 bg-white shadow-sm ${className ?? ""}`}
      style={{ aspectRatio: ratio }}
    >
      {children}
    </div>
  );
}

/** 종이 위 글줄 목업 — 실제 텍스트 대신 리듬 있는 회색 바. */
export function DemoLines({
  count,
  seed = 0,
  className,
}: {
  count: number;
  seed?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="h-1 rounded-full bg-slate-200"
          style={{ width: `${72 + (((i + seed) * 37) % 27)}%` }}
        />
      ))}
    </div>
  );
}
