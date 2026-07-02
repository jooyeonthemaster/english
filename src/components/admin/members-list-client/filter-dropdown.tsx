"use client";

// ============================================================================
// 회원 관리 필터 공용 토글 드롭다운. 모든 필터 축(가입경로·상태·플랜·크레딧·마케팅·
// 문자발송·가입일)을 이 하나의 트리거+팝오버 패턴으로 통일한다.
//   · 트리거: 기본은 카테고리명, 값이 걸리면 "카테고리 · 요약" + 파란 활성 스타일.
//   · 팝오버 본문: 옵션은 공용 FilterPill(Toss형) 또는 커스텀(가입일 범위 등).
// 각 축의 "전체" 옵션이 그 축의 초기화 역할을 겸한다(툴바의 '전체 초기화'는 일괄).
// ============================================================================

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function FilterDropdown({
  label,
  active,
  summary,
  children,
  align = "start",
  contentClassName,
}: {
  label: string;
  active: boolean;
  /** 값이 걸렸을 때 트리거에 덧붙일 요약(예: "Google", "저잔고"). */
  summary?: string;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[12px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
          active
            ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
        )}
      >
        <span className={cn(active ? "text-blue-400" : "font-medium")}>
          {label}
        </span>
        {active && summary && (
          <span className="font-semibold text-blue-700">{summary}</span>
        )}
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform",
            open && "rotate-180",
            active ? "text-blue-400" : "text-gray-400",
          )}
          strokeWidth={2}
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn("w-auto min-w-[200px] p-3", contentClassName)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** 드롭다운 본문 — 옵션 pill 을 감싸는 표준 래퍼(선택 안내 라벨 옵션). */
export function DropdownOptions({
  hint,
  children,
}: {
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {hint && (
        <span className="text-[11px] font-semibold text-slate-500">{hint}</span>
      )}
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
