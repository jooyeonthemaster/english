"use client";

// ============================================================================
// 프로모션·상품 편집 폼 공용 유틸 — 날짜 변환, 라벨 필드, 스위치, 단위 토글.
// credit-promotion-editor.tsx 가 re-export 하므로 상품 관리(credit-topups-admin-client)
// 도 같은 경로로 계속 가져다 쓴다(시그니처 유지).
// ============================================================================

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type PromoAcademy = { academyId: string; name: string; slug: string };

export function toDatetimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

// datetime-local 입력값(타임존 없는 벽시계 문자열)을 절대 시각(UTC ISO)으로 변환.
// 브라우저에서 실행되므로 관리자의 실제 타임존으로 해석된다 → 서버 타임존(UTC 등)에
// 상관없이 항상 같은 순간이 저장된다. (예전엔 서버에서 new Date(문자열)로 파싱해
// 프로덕션 UTC 서버에서 KST 관리자의 입력이 9시간 어긋나 "저장이 안 되는" 것처럼 보였음.)
export function fromDatetimeLocal(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

// datetime-local 기본값(신규 프로모션): 지금 ~ +7일.
export function nowDatetimeLocal(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function formatDate(value: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** on/off 스위치 — ui/switch 위에 옆 라벨(text)만 얹는다. text=옆에 붙는 라벨(기본 "노출"). */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  text = "노출",
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  text?: string;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text && (
        <span className="text-[12px] font-medium text-gray-500">{text}</span>
      )}
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
    </span>
  );
}

export function AdminField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[12px] font-semibold text-gray-500">{label}</span>
      {children}
    </label>
  );
}

const UNIT_OPTIONS = [
  { key: "PERCENT", label: "%" },
  { key: "AMOUNT", label: "정액" },
] as const;

/** 퍼센트/정액 단위 선택 토글(할인·크레딧 지급 공용). */
export function UnitToggle({
  value,
  onChange,
}: {
  value: "PERCENT" | "AMOUNT";
  onChange: (v: "PERCENT" | "AMOUNT") => void;
}) {
  return (
    <div className="inline-flex h-9 shrink-0 overflow-hidden rounded-lg border border-gray-200">
      {UNIT_OPTIONS.map((o) => (
        <Button
          key={o.key}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "h-full rounded-none px-2.5 text-[12px] font-semibold",
            value === o.key
              ? "bg-gray-900 text-white hover:bg-gray-900 hover:text-white"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-700",
          )}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
