"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isManualGrantTopUp } from "@/lib/credit-topup-status";
import { TOPUP_MANUAL_COMPLETE, TOPUP_STATUS, statusOf } from "@/lib/admin-labels";
import type { StatusMeta, Tone } from "@/lib/admin-labels/tone";
import { StatusBadge, TONE_SOFT } from "@/components/admin/kit";

// 충전 주문 상태 표시 — 라벨·색은 admin-labels 레지스트리(TOPUP_STATUS)만 쓴다.
// 무통장입금 입금 대기는 시간창 카운트다운을 실시간으로 보여준다(BankWaitingBadge).

export const BANK_WINDOW_MINUTES = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_BANK_DEPOSIT_MATCH_WINDOW_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
})();

const CONFIRM_WINDOW_MS = 30 * 60_000;

const EXPIRED: StatusMeta = { label: "시간 초과", tone: "gray" };

type TopUpStatusLike = {
  paymentMethod: string | null;
  status: string;
  createdAt: Date | string;
  customData?: unknown;
};

/** 무통장입금 입금 대기가 시간창을 넘기면 더이상 자동매칭되지 않으므로 "시간 초과"로 표기. */
export function getTopUpStatusMeta(topUp: TopUpStatusLike): StatusMeta {
  const expired =
    topUp.paymentMethod === "BANK_TRANSFER" &&
    topUp.status === "WAITING_FOR_DEPOSIT" &&
    Date.now() - new Date(topUp.createdAt).getTime() > BANK_WINDOW_MINUTES * 60_000;
  if (expired) return EXPIRED;
  if (topUp.status === "COMPLETED" && isManualGrantTopUp(topUp.customData)) {
    return TOPUP_MANUAL_COMPLETE;
  }
  return statusOf(TOPUP_STATUS, topUp.status);
}

export function formatOrderNo(id: string): string {
  return id.slice(-8).toUpperCase();
}

export function maskLongValue(value?: string | null) {
  if (!value) return "-";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function readCustomString(customData: unknown, key: string): string | null {
  if (customData && typeof customData === "object" && !Array.isArray(customData)) {
    const v = (customData as Record<string, unknown>)[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

/** 무통장입금 주문의 customData 에 저장된 입금자명. */
export function readDepositorName(customData: unknown): string | null {
  return readCustomString(customData, "depositorName");
}

function readConfirmStartedAt(customData: unknown): number | null {
  const v = readCustomString(customData, "confirmStartedAt");
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function LiveBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-semibold tabular-nums",
        TONE_SOFT[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * 무통장입금 입금 대기 주문의 라이브 배지: 입금 대기(카운트다운) / 입금 확인중(카운트업) /
 * 입금 확인 실패 / 시간 초과. 디렉터 화면과 동일 기준.
 */
export function BankWaitingBadge({
  createdAt,
  customData,
}: {
  createdAt: Date | string;
  customData: unknown;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");

  const confirmAt = readConfirmStartedAt(customData);
  if (confirmAt != null) {
    const elapsed = now - confirmAt;
    if (elapsed >= CONFIRM_WINDOW_MS) {
      return <LiveBadge tone="rose">입금 확인 실패</LiveBadge>;
    }
    const mm = Math.floor(elapsed / 60_000);
    const ss = Math.floor((elapsed % 60_000) / 1000);
    return (
      <LiveBadge tone="violet">
        <Clock3 className="size-3" strokeWidth={2.2} />
        입금 확인중 {pad(mm)}:{pad(ss)}
      </LiveBadge>
    );
  }

  const expiresAt = new Date(createdAt).getTime() + BANK_WINDOW_MINUTES * 60_000;
  const leftMs = Math.max(expiresAt - now, 0);
  if (leftMs <= 0) {
    return <LiveBadge tone="gray">시간 초과</LiveBadge>;
  }
  const mm = Math.floor(leftMs / 60_000);
  const ss = Math.floor((leftMs % 60_000) / 1000);
  const urgent = leftMs <= 5 * 60_000;
  return (
    <LiveBadge tone={urgent ? "amber" : "sky"}>
      <Clock3 className="size-3" strokeWidth={2.2} />
      입금 대기 {pad(mm)}:{pad(ss)}
    </LiveBadge>
  );
}

/** 표·상세 공용 상태 뱃지 — 무통장 입금 대기만 라이브 카운트다운, 나머지는 레지스트리 뱃지. */
export function TopUpStatusBadge({ topUp }: { topUp: TopUpStatusLike }) {
  if (topUp.paymentMethod === "BANK_TRANSFER" && topUp.status === "WAITING_FOR_DEPOSIT") {
    return <BankWaitingBadge createdAt={topUp.createdAt} customData={topUp.customData} />;
  }
  return <StatusBadge status={getTopUpStatusMeta(topUp)} />;
}
