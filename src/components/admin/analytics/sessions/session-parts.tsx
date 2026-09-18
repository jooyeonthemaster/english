"use client";

// 방문 여정 화면 공용 조각 — 채널 표시·배지·키/값 목록·지역 문자열.

import type { ReactNode } from "react";
import { CHANNEL_COLORS, channelLabel, countryLabel, isChannel, regionLabel } from "@/lib/analytics/channels";
import { cn } from "@/lib/utils";

export function ChannelDot({ channel, className }: { channel: string | null; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: channel && isChannel(channel) ? CHANNEL_COLORS[channel] : "#94a3b8" }}
      aria-hidden
    />
  );
}

export function ChannelName({ channel }: { channel: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ChannelDot channel={channel} />
      {channelLabel(channel)}
    </span>
  );
}

type BadgeTone = "gray" | "blue" | "emerald" | "amber" | "violet" | "rose";

const BADGE_TONES: Record<BadgeTone, string> = {
  gray: "border-gray-200 bg-gray-50 text-gray-600",
  blue: "border-blue-100 bg-blue-50 text-blue-700",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  violet: "border-violet-100 bg-violet-50 text-violet-700",
  rose: "border-rose-100 bg-rose-50 text-rose-700",
};

export function Badge({
  tone = "gray",
  children,
  title,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 items-center whitespace-nowrap rounded-full border px-1.5 text-[11px] font-semibold leading-none",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function VisitorBadge({ isNew }: { isNew: boolean }) {
  return isNew ? (
    <Badge tone="blue" title="이 브라우저의 첫 방문">
      신규
    </Badge>
  ) : (
    <Badge tone="gray" title="이전에 방문한 적 있는 브라우저">
      재방문
    </Badge>
  );
}

export function ConversionBadge() {
  return (
    <Badge tone="emerald" title="이 세션에서 가입 또는 결제 전환이 판정됨">
      전환
    </Badge>
  );
}

/** 지역 표시 — 국내는 시·도(+도시), 해외는 국가(+도시) */
export function placeText(country: string | null, region: string | null, city: string | null): string {
  if (!country && !region && !city) return "미상";
  const head =
    country === "KR" ? (region ? regionLabel(country, region) : countryLabel(country)) : country ? countryLabel(country) : regionLabel(null, region);
  return city ? `${head} · ${city}` : head;
}

export interface InfoItem {
  label: string;
  value: ReactNode;
  /** 값이 긴 URL·쿼리 등이면 줄바꿈 허용 + 고정폭 */
  mono?: boolean;
}

/**
 * 키/값 목록 — 값이 없는 항목(null·빈 문자열)은 숨긴다.
 * 주의: 임의값 grid-cols-[…]·max-w-[…] 는 모바일 큰글씨 리맵(globals.css body.smoat-large-ui)이
 * 1열·100% 로 덮어쓰므로 flex 행 + 고정 토큰 폭(w-22)으로 짠다.
 */
export function InfoList({ items, className }: { items: InfoItem[]; className?: string }) {
  const visible = items.filter((it) => it.value !== null && it.value !== undefined && it.value !== "");
  if (visible.length === 0) return <p className="text-[12px] text-gray-400">기록된 정보가 없습니다</p>;
  return (
    <dl className={cn("space-y-1.5 text-[12.5px]", className)}>
      {visible.map((it) => (
        <div key={it.label} className="flex gap-3">
          <dt className="w-22 shrink-0 text-gray-400">{it.label}</dt>
          <dd className={cn("min-w-0 flex-1 break-words text-gray-800", it.mono && "break-all font-mono text-[12px]")}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DrawerCard({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-gray-50 px-4 py-2.5">
        <h3 className="text-[13px] font-semibold text-gray-800">{title}</h3>
        {right}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
