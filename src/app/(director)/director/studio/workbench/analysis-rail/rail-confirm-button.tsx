"use client";

// ============================================================================
// 레일 공용 2단 인라인 확인 버튼 — 모달 금지 계약(26-09-01 레일 콘솔)의 확인 장치.
//
// 1클릭 = 무장(armed — 자구가 확인 문구로 바뀜) → 2클릭 = 실행. 오터치 방어 3중
// (적대검수 V2-M5):
//   ① 무장 직후 300ms 클릭 무시 — 무의식 더블클릭이 과금/파괴를 관통하지 못한다.
//   ② busy(실행 중) 동안 disabled + 스피너 — 4초 자동 해제 타이머와 겹치지 않는다.
//   ③ 톤 분리: charge(과금 확인)=amber / danger(파괴 확인)=rose — "빨강=위험"
//     학습을 과금 확인이 무디게 만들지 않는다.
// v4 톤 primary(26-09-02 수정 루프 U5-spec-1): 「다음 단계」 블록의 과금 프라이머리
// CTA(AI 분석 시작·심층 분석·리포트 생성)는 idle 이 채운 blue-600(dossier-pick-bar
// ACTION 토큰 미러) — 흰 아웃라인 charge 는 무료 프라이머리보다 약해 보여 위계가
// 뒤집혔다. armed 는 charge 와 같은 amber(과금 확인 어휘 1벌).
// 무장 4초 뒤 자동 복귀. Escape 리스너 없음(셸 드로어 리스너와의 소비 순서
// 문제 원천 차단 — 정본 §3.10.28).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE = {
  primary: {
    idle: "bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800",
    armed: "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
  },
  charge: {
    idle: "border border-blue-200 bg-white text-blue-700 hover:border-blue-300 hover:bg-blue-50",
    armed: "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
  },
  danger: {
    idle: "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
    armed: "border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100",
  },
} as const;

export function RailConfirmButton({
  label,
  confirmLabel,
  tone,
  busy = false,
  disabled = false,
  onConfirm,
  icon,
  className,
  ...dataAttrs
}: {
  label: React.ReactNode;
  /** 무장 상태 자구 — 짧게("한 번 더 → N cr" 급, 숫자는 formatCredits). 긴 설명은 버튼 밖 캡션으로. */
  confirmLabel: string;
  tone: keyof typeof TONE;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  icon?: React.ReactNode;
  className?: string;
} & Partial<Record<`data-${string}`, string | boolean>>) {
  const [armed, setArmed] = useState(false);
  const armedAtRef = useRef(0);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  // busy 전이(실행 시작)에 무장 해제 — 완료 후 잔여 무장 상태 재클릭 차단.
  useEffect(() => {
    if (busy) setArmed(false);
  }, [busy]);

  const handleClick = () => {
    if (busy || disabled) return;
    if (!armed) {
      setArmed(true);
      armedAtRef.current = Date.now();
      return;
    }
    if (Date.now() - armedAtRef.current < 300) return; // ① 더블클릭 무시창
    setArmed(false);
    onConfirm();
  };

  return (
    <button
      type="button"
      {...dataAttrs}
      disabled={busy || disabled}
      onClick={handleClick}
      className={cn(
        "inline-flex h-7 min-w-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[12px] font-semibold transition-colors disabled:cursor-default disabled:opacity-50",
        armed ? TONE[tone].armed : TONE[tone].idle,
        className,
      )}
    >
      {busy ? (
        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {armed ? confirmLabel : label}
    </button>
  );
}
