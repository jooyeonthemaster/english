"use client";

// ③ 검색엔진 패널 공용 조각 — 상태 배지·정보 카드.
// 배지가 「구조적으로 항상 초록」이 되지 않도록, 근거가 약한 통과(코드 하드코딩 폴백)는 warn 으로 구분한다.

import type { ReactNode } from "react";
import type { IndexNowCheck, VerificationState } from "@/lib/analytics/reports/search-engines";
import { cn } from "@/lib/utils";

export function InfoCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-100 bg-white p-4">
      <div className="mb-2 text-[12px] font-medium text-gray-400">{label}</div>
      {children}
    </div>
  );
}

export function OkBadge({
  ok,
  okText,
  failText,
  tone = "ok",
}: {
  ok: boolean;
  okText: string;
  failText: string;
  /** warn = 조건은 충족하지만 근거가 약하다(코드 하드코딩 폴백 등) */
  tone?: "ok" | "warn";
}) {
  const okClass = tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";
  const okDot = tone === "warn" ? "bg-amber-400" : "bg-emerald-500";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold",
        ok ? okClass : "bg-gray-100 text-gray-500",
      )}
    >
      <span className={cn("size-1.5 rounded-full", ok ? okDot : "bg-gray-400")} aria-hidden />
      {ok ? okText : failText}
    </span>
  );
}

/** 소유확인 코드 — env 주입인지 코드 하드코딩 폴백인지 구분해 표기한다. */
export function VerificationBadge({ name, state }: { name: string; state: VerificationState }) {
  return (
    <OkBadge
      ok={state.present}
      tone={state.present && !state.fromEnv ? "warn" : "ok"}
      okText={`${name} 삽입됨${state.fromEnv ? "(env)" : "(기본값)"}`}
      failText={`${name} 없음`}
    />
  );
}

const KEY_CHECK_LABEL: Record<IndexNowCheck["state"], { text: string; className: string; dot: string }> = {
  match: { text: "키 파일 확인됨", className: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  mismatch: { text: "키 파일 불일치", className: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  unreachable: { text: "키 파일 확인 불가", className: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  skipped: { text: "키 파일 미검사", className: "bg-gray-100 text-gray-500", dot: "bg-gray-400" },
};

/** keyLocation 을 서버가 실제로 GET 한 결과(검색엔진이 키를 검증하는 방식과 같다). */
export function KeyCheckBadge({ check }: { check: IndexNowCheck }) {
  const s = KEY_CHECK_LABEL[check.state];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold", s.className)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {s.text}
    </span>
  );
}
