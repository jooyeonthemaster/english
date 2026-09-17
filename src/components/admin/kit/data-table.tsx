"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * 관리자 표 한 종류 — ui/table 위에 헤더·셀·행 스타일을 고정한다.
 * 숫자 열은 align="right"(tabular-nums), 행 클릭은 clickable, 호버 상세는 AdminHoverDetail 로 <Tr> 를 감싼다.
 *
 * <DataTable>
 *   <DataTableHeader><Tr><Th>학원</Th><Th align="right">금액</Th></Tr></DataTableHeader>
 *   <DataTableBody>{rows.map(r => <Tr key clickable><Td>…</Td><Td align="right">…</Td></Tr>)}</DataTableBody>
 * </DataTable>
 */
export function DataTable({
  children,
  minWidth,
  stickyHeader = false,
  maxHeight,
  className,
  bare = false,
}: {
  children: ReactNode;
  /** 열이 많을 때 가로 스크롤 하한(px) */
  minWidth?: number;
  stickyHeader?: boolean;
  /** 표 안에서 세로 스크롤(px) — stickyHeader 와 함께 */
  maxHeight?: number;
  className?: string;
  /** 바깥 카드(테두리·흰 배경) 없이 — 이미 카드 안일 때 */
  bare?: boolean;
}) {
  return (
    <div
      className={cn(
        !bare && "overflow-hidden rounded-xl border border-gray-100 bg-white",
        stickyHeader && "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10",
        className,
      )}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
    >
      <Table className="text-[13px]" style={minWidth ? { minWidth } : undefined}>
        {children}
      </Table>
    </div>
  );
}

export function DataTableHeader({ children }: { children: ReactNode }) {
  return (
    <TableHeader className="bg-gray-50/70 [&_tr]:border-gray-100 [&_tr]:hover:bg-transparent">
      {children}
    </TableHeader>
  );
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return <TableBody className="[&_tr]:border-gray-50">{children}</TableBody>;
}

export function Tr({
  children,
  clickable = false,
  selected = false,
  className,
  ...props
}: React.ComponentProps<"tr"> & { clickable?: boolean; selected?: boolean }) {
  return (
    <TableRow
      className={cn(
        "transition-colors hover:bg-gray-50/60",
        clickable && "cursor-pointer",
        selected && "bg-blue-50/50 hover:bg-blue-50/60",
        className,
      )}
      {...props}
    >
      {children}
    </TableRow>
  );
}

export function Th({
  children,
  align = "left",
  className,
  ...props
}: React.ComponentProps<"th"> & { align?: "left" | "right" | "center" }) {
  return (
    <TableHead
      className={cn(
        "h-10 px-4 text-[12px] font-medium text-gray-400 first:pl-5 last:pr-5",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    >
      {children}
    </TableHead>
  );
}

export function Td({
  children,
  align = "left",
  muted = false,
  className,
  ...props
}: React.ComponentProps<"td"> & {
  align?: "left" | "right" | "center";
  /** 보조 정보(회색·작게) */
  muted?: boolean;
}) {
  return (
    <TableCell
      className={cn(
        "px-4 py-3 align-middle text-gray-700 first:pl-5 last:pr-5",
        align === "right" && "text-right font-medium tabular-nums text-gray-900",
        align === "center" && "text-center",
        muted && "text-[12px] text-gray-400",
        className,
      )}
      {...props}
    >
      {children}
    </TableCell>
  );
}

/** 정렬 가능한 헤더 라벨 */
export function SortHeader({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: "asc" | "desc";
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : order === "desc" ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30",
        active ? "text-gray-700" : "text-gray-400 hover:text-gray-600",
      )}
    >
      {label}
      <Icon className="size-3" strokeWidth={2} aria-hidden />
    </button>
  );
}

/** 표 안 빈 상태 한 줄 */
export function DataTableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="p-0">
        {children}
      </TableCell>
    </TableRow>
  );
}
