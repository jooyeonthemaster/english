"use client";

// 유입 경로 화면 공용 조각 — 채널 이름(색 점), 수치 셀(0 흐리게), 「가입/방문자」 셀.

import type { ReactNode } from "react";
import { CHANNEL_COLORS, channelLabel, isChannel } from "@/lib/analytics/channels";
import { fmtDuration, fmtInt, fmtKrw, fmtPct } from "@/lib/analytics/format";

/** 「가입/방문자」 열 이름(§14 D12) — 비율이 아니라 두 수의 비교라는 뜻을 이름에 남긴다. */
export const SIGNUP_RATIO_LABEL = "가입/방문자";

/** 같은 각주를 채널·소스·캠페인 표가 공유한다(§14 D12). */
export const SIGNUP_RATIO_NOTE =
  "「가입/방문자」의 가입은 최초 유입 귀속이라 기간 밖 방문에서 올 수 있습니다 — 같은 행의 방문자 수와 같은 집단이 아니며 100% 를 넘을 수 있습니다.";

export function channelColor(channel: string): string {
  return isChannel(channel) ? CHANNEL_COLORS[channel] : "#94a3b8";
}

export function ChannelName({ channel }: { channel: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-2 shrink-0 rounded-full" style={{ background: channelColor(channel) }} aria-hidden />
      {channelLabel(channel)}
    </span>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-gray-300">{children}</span>;
}

/** 정수 — 0 은 흐리게 */
export function countCell(n: number): ReactNode {
  return n ? fmtInt(n) : <Muted>0</Muted>;
}

/** 원화 — 0 은 흐리게 */
export function krwCell(n: number): ReactNode {
  return n ? <span className="font-semibold text-gray-800">{fmtKrw(n)}</span> : <Muted>-</Muted>;
}

/** 이탈률 — 기간 내 방문이 없는 행(귀속 가입만 있는 행)은 '-' */
export function bounceCell(rate: number, sessions: number): ReactNode {
  return sessions ? fmtPct(rate) : <Muted>-</Muted>;
}

export function durationCell(ms: number, sessions: number): ReactNode {
  return sessions ? fmtDuration(ms) : <Muted>-</Muted>;
}

/** part/whole 백분율(소수 1자리). whole 0 이면 null */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/**
 * 「가입/방문자」 셀 — 분자(기간 내 가입 학원의 귀속)와 분모(기간 내 방문자)는 같은 집단이 아니다(§14 D12).
 * 방문자가 있는 행은 가입 0 이어도 0% 를 흐리게 찍고, 방문이 아예 없는 귀속 전용 행만 '-' 로 둔다.
 */
export function conversionCell(signups: number, visitors: number): ReactNode {
  const r = ratio(signups, visitors);
  if (r === null) return <Muted>-</Muted>;
  if (signups === 0) return <Muted>{fmtPct(r)}</Muted>;
  return <span className="font-semibold text-blue-600">{fmtPct(r)}</span>;
}
