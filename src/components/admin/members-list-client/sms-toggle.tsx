"use client";

// ============================================================================
// 회원 목록의 "문자 발송" 토글.
//   · 켜짐(Bell)   = SMS 발송 대상
//   · 꺼짐(BellOff) = 발송 제외 (이미 주기적으로 피드백 받는 영어쌤 등)
//   · 내부/테스트 계정(허수)은 토글 불가 — "내부" 배지로만 표시(항상 제외)
// 토글은 academy_feature_flags(OUTREACH_SMS_OPT_OUT)에 즉시 저장된다.
// 행 클릭(상세 이동)과 충돌하지 않도록 stopPropagation 한다.
// ============================================================================

import { useState, useTransition } from "react";
import { Bell, BellOff, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toggleMemberSmsOptOut } from "@/actions/admin-members";

export function SmsToggle({
  memberId,
  optOut,
  isInternal,
}: {
  memberId: string;
  optOut: boolean;
  isInternal: boolean;
}) {
  const [current, setCurrent] = useState(optOut);
  const [isPending, startTransition] = useTransition();

  if (isInternal) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium text-gray-400 bg-gray-50"
        title="내부/테스트 계정 — 문자 발송 대상에서 항상 제외됩니다"
        onClick={(e) => e.stopPropagation()}
      >
        <Lock className="size-3" strokeWidth={2} aria-hidden />
        내부
      </span>
    );
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (isPending) return;
    const next = !current;
    setCurrent(next); // 낙관적 반영
    startTransition(async () => {
      const res = await toggleMemberSmsOptOut({ memberId, optOut: next });
      if (!res.success) {
        setCurrent(!next); // 롤백
        toast.error(res.error || "변경에 실패했습니다");
      }
    });
  }

  const excluded = current;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={!excluded}
      title={excluded ? "발송 제외됨 — 클릭하면 발송 대상으로" : "발송 대상 — 클릭하면 제외"}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
        excluded
          ? "text-gray-400 hover:bg-gray-100"
          : "text-blue-600 hover:bg-blue-50",
      )}
    >
      {isPending ? (
        <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />
      ) : excluded ? (
        <BellOff className="size-3.5" strokeWidth={2} aria-hidden />
      ) : (
        <Bell className="size-3.5" strokeWidth={2} aria-hidden />
      )}
      <span className="hidden xl:inline">{excluded ? "제외" : "발송"}</span>
    </button>
  );
}
