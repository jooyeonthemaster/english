"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import type { Tone } from "@/lib/admin-labels/tone";
import { cn } from "@/lib/utils";
import { TONE_ICON_BOX, TONE_TEXT } from "./tones";

/**
 * 통계 카드 한 종류. md=상단 지표(아이콘 박스·큰 숫자), sm=보조 지표(작게 한 줄 아래 값).
 * 호버 상세는 AdminHoverDetail 로 감싸서 붙인다(카드는 모른다).
 */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "gray",
  valueTone,
  delta,
  size = "md",
  alert = false,
  className,
  ...rest
}: {
  label: string;
  value: ReactNode;
  /** 값 아래 보조 설명 */
  sub?: ReactNode;
  icon?: LucideIcon;
  /** 아이콘 박스 색 */
  tone?: Tone;
  /** 값 글자색(기본 gray-900) */
  valueTone?: Tone;
  /** 어제 대비 등 증감 — 숫자면 %로 표시, 노드면 그대로 */
  delta?: { today: number; yesterday: number } | ReactNode;
  size?: "md" | "sm";
  /** 주의가 필요한 상태(테두리·배경을 옅은 로즈로) */
  alert?: boolean;
  className?: string;
  /** 나머지 props 는 루트 div 로 전달 — AdminHoverDetail 로 바로 감쌀 수 있게. */
} & Omit<ComponentProps<"div">, "children">) {
  const valueClass = cn(
    "font-bold tracking-tight tabular-nums",
    valueTone ? TONE_TEXT[valueTone] : "text-gray-900",
    size === "md" ? "text-[26px] leading-none" : "text-[18px] leading-none",
  );
  return (
    <div
      className={cn(
        "rounded-xl border bg-white",
        alert ? "border-rose-200 bg-rose-50/60" : "border-gray-100",
        size === "md" ? "p-5" : "px-4 py-3",
        className,
      )}
      {...rest}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-gray-400">{label}</span>
        {Icon &&
          (size === "md" ? (
            <span
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
                TONE_ICON_BOX[tone],
              )}
            >
              <Icon className="size-4" strokeWidth={1.8} aria-hidden />
            </span>
          ) : (
            <Icon className="size-3.5 shrink-0 text-gray-300" strokeWidth={1.8} aria-hidden />
          ))}
      </div>
      <div className={cn(size === "md" ? "mt-3" : "mt-1.5", valueClass)}>{value}</div>
      {(sub || delta) && (
        <div className="mt-2 flex items-center gap-2 text-[12px] text-gray-400">
          {isDeltaInput(delta) ? <Delta {...delta} /> : delta}
          {sub}
        </div>
      )}
    </div>
  );
}

function isDeltaInput(v: unknown): v is { today: number; yesterday: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    "today" in v &&
    "yesterday" in v &&
    typeof (v as { today: unknown }).today === "number"
  );
}

/** 어제 대비 증감 배지 */
export function Delta({ today, yesterday }: { today: number; yesterday: number }) {
  if (yesterday === 0) {
    if (today === 0) return <span className="text-gray-300">어제 0</span>;
    return (
      <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600">
        <TrendingUp className="size-3.5" strokeWidth={2} />
        신규
      </span>
    );
  }
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct === 0) return <span className="text-gray-400">어제와 같음</span>;
  const up = pct > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold",
        up ? "text-emerald-600" : "text-rose-500",
      )}
    >
      {up ? (
        <TrendingUp className="size-3.5" strokeWidth={2} />
      ) : (
        <TrendingDown className="size-3.5" strokeWidth={2} />
      )}
      {Math.abs(pct)}%
    </span>
  );
}

/** 통계 카드 줄 — 열 수는 카드 수에 맞춰 지정 */
export function StatGrid({
  children,
  cols = 4,
  className,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  const colClass = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 xl:grid-cols-4",
    5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
    6: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
  }[cols];
  return <div className={cn("grid grid-cols-1 gap-3", colClass, className)}>{children}</div>;
}
