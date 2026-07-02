"use client";

// ============================================================================
// 정렬 드롭다운 — 컬럼 헤더 정렬(SortHeader)과 같은 상태(sortKey+sortOrder)를
// 공유한다. 헤더 클릭에 익숙하지 않은 사용자를 위해 툴바에 정렬을 명시적으로 노출.
// ============================================================================

import { ArrowUpDown } from "lucide-react";
import type { MemberSortKey, SortOrder } from "@/actions/admin-members";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OPTIONS: Array<{
  value: string;
  label: string;
  key: MemberSortKey;
  order: SortOrder;
}> = [
  { value: "createdAt:desc", label: "가입일 최신순", key: "createdAt", order: "desc" },
  { value: "createdAt:asc", label: "가입일 오래된순", key: "createdAt", order: "asc" },
  { value: "lastActiveAt:desc", label: "최근활동 최신순", key: "lastActiveAt", order: "desc" },
  { value: "lastActiveAt:asc", label: "최근활동 오래된순", key: "lastActiveAt", order: "asc" },
  { value: "balance:asc", label: "잔고 낮은순", key: "balance", order: "asc" },
  { value: "balance:desc", label: "잔고 높은순", key: "balance", order: "desc" },
];

export function SortMenu({
  sortKey,
  sortOrder,
  onChange,
}: {
  sortKey: MemberSortKey;
  sortOrder: SortOrder;
  onChange: (key: MemberSortKey, order: SortOrder) => void;
}) {
  const current = `${sortKey}:${sortOrder}`;
  return (
    <Select
      value={current}
      onValueChange={(v) => {
        const opt = OPTIONS.find((o) => o.value === v);
        if (opt) onChange(opt.key, opt.order);
      }}
    >
      <SelectTrigger className="h-9 w-auto gap-1.5 border-gray-200 text-[12px] text-gray-700">
        <ArrowUpDown className="size-3.5 text-gray-400" strokeWidth={2} aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-[12px]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
