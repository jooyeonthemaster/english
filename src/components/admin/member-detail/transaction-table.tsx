"use client";

import { useState, useTransition } from "react";
import { Loader2, Filter, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMemberTransactions } from "@/actions/admin-members";
import {
  getOperationTypeLabel,
  getTransactionTypeLabel,
} from "@/lib/admin-members-labels";

interface Transaction {
  id: string;
  type: string;
  typeLabel: string;
  amount: number;
  balanceAfter: number;
  operationType: string | null;
  operationLabel: string;
  description: string | null;
  referenceId: string | null;
  referenceType: string | null;
  staffId: string | null;
  adminId: string | null;
  metadata: string | null;
  createdAt: Date | string;
}

interface TransactionTableProps {
  memberId: string;
  initial: { items: Transaction[]; nextCursor: string | null };
  knownOperationTypes: string[];
}

const TYPE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "ALLOCATION", label: getTransactionTypeLabel("ALLOCATION") },
  { value: "CONSUMPTION", label: getTransactionTypeLabel("CONSUMPTION") },
  { value: "TOP_UP", label: getTransactionTypeLabel("TOP_UP") },
  { value: "ADJUSTMENT", label: getTransactionTypeLabel("ADJUSTMENT") },
  { value: "REFUND", label: getTransactionTypeLabel("REFUND") },
  { value: "RESET", label: getTransactionTypeLabel("RESET") },
  { value: "ROLLOVER", label: getTransactionTypeLabel("ROLLOVER") },
];

export function TransactionTable({
  memberId,
  initial,
  knownOperationTypes,
}: TransactionTableProps) {
  const [items, setItems] = useState<Transaction[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [type, setType] = useState<string>("all");
  const [operationType, setOperationType] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const operationOptions = [
    { value: "all", label: "전체" },
    ...knownOperationTypes.map((op) => ({
      value: op,
      label: getOperationTypeLabel(op),
    })),
  ];

  function applyFilters(nextType: string, nextOp: string) {
    // Sync-reset cursor BEFORE the in-flight transition so a "더 보기" click
    // racing the filter cannot read a stale cursor from the previous filter.
    setCursor(null);
    startTransition(async () => {
      const res = await getMemberTransactions(memberId, {
        type: nextType,
        operationType: nextOp,
        limit: 30,
      });
      if (res.kind === "ok") {
        setItems(res.items);
        setCursor(res.nextCursor);
      } else {
        setItems([]);
        setCursor(null);
      }
    });
  }

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const res = await getMemberTransactions(memberId, {
        type,
        operationType,
        cursor,
        limit: 30,
      });
      if (res.kind === "ok") {
        setItems((prev) => [...prev, ...res.items]);
        setCursor(res.nextCursor);
      }
    });
  }

  function refresh() {
    applyFilters(type, operationType);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-gray-400" strokeWidth={1.8} aria-hidden />
          <h3 className="text-[14px] font-semibold text-gray-800">거래 이력</h3>
          <span className="text-[11px] text-gray-400 tabular-nums">
            · {items.length}건
            {cursor ? "+" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <FilterField label="종류">
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v);
                applyFilters(v, operationType);
              }}
            >
              <SelectTrigger className="h-8 text-[12px] min-w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-[12px]">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="상품">
            <Select
              value={operationType}
              onValueChange={(v) => {
                setOperationType(v);
                applyFilters(type, v);
              }}
            >
              <SelectTrigger className="h-8 text-[12px] min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operationOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-[12px]">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[12px] text-gray-500"
            onClick={refresh}
            disabled={isPending}
            aria-label="목록 새로고침"
          >
            <RefreshCw
              className={cn("size-3.5 mr-1", isPending && "animate-spin")}
              strokeWidth={2}
              aria-hidden
            />
            새로고침
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-12 text-center text-[12px] text-gray-400">
          {type !== "all" || operationType !== "all"
            ? "조건에 맞는 거래가 없습니다"
            : "아직 거래 내역이 없습니다"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-gray-50">
                <TableHead className="text-[11px] text-gray-400 font-medium h-9 pl-5 w-[140px]">
                  일시
                </TableHead>
                <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[110px]">
                  종류
                </TableHead>
                <TableHead className="text-[11px] text-gray-400 font-medium h-9 min-w-[160px]">
                  상품
                </TableHead>
                <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[110px] text-right">
                  변동
                </TableHead>
                <TableHead className="text-[11px] text-gray-400 font-medium h-9 w-[110px] text-right">
                  잔고
                </TableHead>
                <TableHead className="text-[11px] text-gray-400 font-medium h-9 min-w-[180px] pr-5">
                  비고
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(cursor || isPending) && items.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadMore}
            disabled={isPending || !cursor}
            className="text-[12px] text-gray-600"
          >
            {isPending ? (
              <>
                <Loader2
                  className="size-3.5 mr-1.5 animate-spin"
                  strokeWidth={2}
                  aria-hidden
                />
                불러오는 중
              </>
            ) : (
              "더 보기"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-[11px] text-gray-400 font-medium">{label}</span>
      {children}
    </label>
  );
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const positive = tx.amount > 0;
  const adminAdjusted = tx.type === "ADJUSTMENT" && Boolean(tx.adminId);

  return (
    <TableRow className="hover:bg-gray-50/50 border-b border-gray-50/60 last:border-0">
      <TableCell className="pl-5 text-[12px] text-gray-700 tabular-nums">
        <div>{formatDateTime(tx.createdAt)}</div>
      </TableCell>
      <TableCell>
        <TypeBadge type={tx.type} />
      </TableCell>
      <TableCell className="text-[12px] text-gray-700">
        {tx.operationType ? (
          <span>{tx.operationLabel}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </TableCell>
      <TableCell
        className={cn(
          "text-right text-[13px] tabular-nums font-semibold",
          positive ? "text-emerald-600" : "text-rose-600",
        )}
      >
        {/* Always render explicit sign so amount direction is not color-only. */}
        {positive ? "+" : "−"}
        {Math.abs(tx.amount).toLocaleString("ko-KR")}
      </TableCell>
      <TableCell className="text-right text-[13px] tabular-nums text-gray-700">
        {tx.balanceAfter.toLocaleString("ko-KR")}
      </TableCell>
      <TableCell className="pr-5 text-[12px] text-gray-500">
        <div className="line-clamp-2">
          {tx.description ?? <span className="text-gray-300">—</span>}
          {adminAdjusted && (
            <span className="ml-1.5 inline-flex items-center text-[11px] text-blue-600 bg-blue-50 px-1 py-px rounded font-semibold uppercase tracking-wider">
              관리자
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function TypeBadge({ type }: { type: string }) {
  const cls = typeBadgeClass(type);
  return (
    <Badge
      variant="secondary"
      className={cn("text-[11px] font-medium border-0 px-2", cls)}
    >
      {getTransactionTypeLabel(type)}
    </Badge>
  );
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case "CONSUMPTION":
      return "bg-rose-50 text-rose-700";
    case "ALLOCATION":
      return "bg-emerald-50 text-emerald-700";
    case "TOP_UP":
      return "bg-blue-50 text-blue-700";
    case "ADJUSTMENT":
      return "bg-slate-100 text-slate-800";
    case "REFUND":
      return "bg-sky-50 text-sky-700";
    case "RESET":
      return "bg-gray-100 text-gray-600";
    case "ROLLOVER":
      return "bg-indigo-50 text-indigo-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
