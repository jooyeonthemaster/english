import type { ReactNode } from "react";

/**
 * 랜딩 씬 공용 디자인 랭귀지 (Claude Design "시안 A" 랜딩 이식).
 * features 페이지(feature-page-shell)와 같은 문법: 네이비/틴트 배경 + 잉크 그리드,
 * eyebrow 킥커, 고스트 아웃라인 숫자, 라이브 데모 브라우저 프레임.
 * 라이브 데모 컴포넌트 자체는 절대 건드리지 않고 프레이밍만 담당한다.
 */

/** 잉크 그리드 패턴 (라이트 배경용) */
export const GRID_INK =
  "[background-image:linear-gradient(rgba(15,23,42,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.045)_1px,transparent_1px)] [background-size:34px_34px]";

/** 그리드 패턴 (네이비 배경용) */
export const GRID_DARK =
  "[background-image:linear-gradient(rgba(148,180,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,180,255,0.06)_1px,transparent_1px)] [background-size:34px_34px]";

/** 네이비 라디얼 씬 배경 */
export const SCENE_NAVY_BG =
  "bg-[radial-gradient(120%_80%_at_50%_-8%,#1B2A4A_0%,#111C34_45%,#0B1220_100%)]";

/** 씬 상단 파랑 글로우 블롭 */
export function SceneGlow({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(59,130,246,0.38),transparent)] blur-[20px] ${className}`}
    />
  );
}

/** 킥커 — FEATURE · OO 라벨 (시안 A kicker: 14px 800 tracking .14em blue-600) */
export function SceneKicker({
  children,
  dark,
  className = "",
}: {
  children: ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`flex items-center gap-2.5 text-[12px] font-extrabold uppercase tracking-[0.14em] sm:text-[14px] ${
        dark ? "text-blue-300" : "text-blue-600"
      } ${className}`}
    >
      {children}
    </p>
  );
}

/** 고스트 아웃라인 숫자 — 씬 타이틀 뒤에 배치 (부모가 relative 여야 함) */
export function SceneGhost({
  n,
  className = "",
}: {
  n: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute select-none text-[92px] font-black leading-[0.8] tracking-[-0.05em] text-transparent tabular-nums [-webkit-text-stroke:2px_#BFDBFE] lg:text-[190px] ${className}`}
    >
      {n}
    </span>
  );
}

/** 씬 타이틀의 파랑 강조 (기존 underline 데코 대체) */
export function Accent({ children }: { children: ReactNode }) {
  return <span className="text-blue-600">{children}</span>;
}

// 참고: 데모 컴포넌트들은 자체 LIVE DEMO 크롬(필+안내+푸터 CTA)을 이미 갖고 있다.
// 프레임을 중복으로 씌우지 말 것 — 이 파일은 씬 프레이밍(배경·킥커·고스트 숫자)만 담당.
