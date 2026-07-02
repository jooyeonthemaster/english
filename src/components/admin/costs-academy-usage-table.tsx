"use client";

import type { ReactNode } from "react";
import { useRef, useState, useTransition } from "react";
import { Filter, Loader2, RefreshCw, X } from "lucide-react";
import {
  getAcademyCostTransactions,
  type AcademyTransactionListItem,
} from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  getOperationTypeLabel,
  getTransactionTypeLabel,
} from "@/lib/admin-members-labels";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

type AcademyUsageRow = {
  academyId: string | null;
  name: string;
  directorName: string | null;
  directorEmail: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costKrw: number;
};

type GroupBy = "academy" | "member";

interface CostsAcademyUsageTableProps {
  academies: AcademyUsageRow[];
  summaryLabel: string;
  variableCostKrw: number;
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
  { value: "EXPIRATION", label: getTransactionTypeLabel("EXPIRATION") },
];

export function CostsAcademyUsageTable({
  academies,
  summaryLabel,
  variableCostKrw,
}: CostsAcademyUsageTableProps) {
  const requestIdRef = useRef(0);
  const [groupBy, setGroupBy] = useState<GroupBy>("academy");
  const [selectedAcademy, setSelectedAcademy] = useState<AcademyUsageRow | null>(
    null,
  );
  const [items, setItems] = useState<AcademyTransactionListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [operationTypes, setOperationTypes] = useState<string[]>([]);
  const [type, setType] = useState("all");
  const [operationType, setOperationType] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const operationOptions = [
    { value: "all", label: "전체" },
    ...operationTypes.map((op) => ({
      value: op,
      label: getOperationTypeLabel(op),
    })),
  ];

  function loadTransactions(
    academy: AcademyUsageRow,
    nextType: string,
    nextOperationType: string,
    options: { cursor?: string | null; append?: boolean } = {},
  ) {
    if (!academy.academyId) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setError(null);

    if (!options.append) {
      setItems([]);
      setCursor(null);
    }

    startTransition(async () => {
      const res = await getAcademyCostTransactions(academy.academyId!, {
        type: nextType,
        operationType: nextOperationType,
        cursor: options.cursor,
        limit: 30,
      });

      if (requestIdRef.current !== requestId) return;

      if (res.kind === "ok") {
        setItems((prev) => (options.append ? [...prev, ...res.items] : res.items));
        setCursor(res.nextCursor);
        setOperationTypes(res.operationTypes);
        setError(null);
      } else {
        setItems([]);
        setCursor(null);
        setOperationTypes([]);
        setError(
          res.kind === "not_found"
            ? "학원을 찾을 수 없습니다."
            : res.error,
        );
      }
    });
  }

  function selectAcademy(academy: AcademyUsageRow) {
    if (!academy.academyId) return;
    setSelectedAcademy(academy);
    setType("all");
    setOperationType("all");
    loadTransactions(academy, "all", "all");
  }

  function applyFilters(nextType: string, nextOperationType: string) {
    if (!selectedAcademy) return;
    loadTransactions(selectedAcademy, nextType, nextOperationType);
  }

  function refresh() {
    if (!selectedAcademy) return;
    loadTransactions(selectedAcademy, type, operationType);
  }

  function loadMore() {
    if (!selectedAcademy || !cursor) return;
    loadTransactions(selectedAcademy, type, operationType, {
      cursor,
      append: true,
    });
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white">
      <div className="flex flex-col gap-3 border-b border-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-gray-800">
            {groupBy === "member" ? "회원별 사용량" : "학원별 사용량"}
          </h2>
          <p className="mt-1 text-[12px] text-gray-400">
            {summaryLabel} API 원가 기준 · {formatNumber(academies.length)}개{" "}
            {groupBy === "member" ? "회원(원장)" : "학원"}
            {groupBy === "member" && " · 원가는 학원 단위 집계"}
          </p>
        </div>
        <div className="inline-flex h-8 w-fit items-center rounded-lg border border-gray-200 bg-white p-0.5">
          {(
            [
              { key: "academy", label: "학원별" },
              { key: "member", label: "회원별" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setGroupBy(tab.key)}
              className={cn(
                "inline-flex h-7 items-center rounded-md px-3 text-[12px] font-semibold transition-colors",
                groupBy === tab.key
                  ? "bg-slate-900 text-white"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 pl-5 text-[12px] font-medium text-gray-400">
                {groupBy === "member" ? "회원" : "학원"}
              </TableHead>
              <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                원가
              </TableHead>
              <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                비중
              </TableHead>
              <TableHead className="h-9 text-right text-[12px] font-medium text-gray-400">
                API
              </TableHead>
              <TableHead className="h-9 pr-5 text-right text-[12px] font-medium text-gray-400">
                토큰
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {academies.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-[13px] text-gray-400"
                >
                  집계된 {groupBy === "member" ? "회원별" : "학원별"} 사용량이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              academies.map((academy) => {
                const denominator = Math.max(variableCostKrw, 1);
                const ratio = Math.min(100, (academy.costKrw / denominator) * 100);
                const selected = selectedAcademy?.academyId === academy.academyId;
                const clickable = Boolean(academy.academyId);

                return (
                  <TableRow
                    key={academy.academyId ?? "__unassigned__"}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-selected={selected || undefined}
                    className={cn(
                      "hover:bg-gray-50/50",
                      clickable && "cursor-pointer outline-none focus-visible:bg-blue-50/60",
                      selected && "bg-blue-50/60 hover:bg-blue-50/80",
                    )}
                    onClick={() => selectAcademy(academy)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectAcademy(academy);
                      }
                    }}
                  >
                    <TableCell className="pl-5 text-[13px] font-medium text-gray-800">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate">
                            {groupBy === "member"
                              ? academy.directorName ?? "원장 미지정"
                              : academy.name}
                          </span>
                          {clickable ? (
                            <span className="shrink-0 text-[11px] font-normal text-blue-500">
                              거래 이력
                            </span>
                          ) : (
                            <span className="shrink-0 text-[11px] font-normal text-gray-300">
                              조회 불가
                            </span>
                          )}
                        </div>
                        {groupBy === "member" && (
                          <div className="truncate text-[11px] font-normal text-gray-400">
                            {academy.name}
                            {academy.directorEmail
                              ? ` · ${academy.directorEmail}`
                              : ""}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-[13px] font-semibold text-gray-900">
                      <p>{formatCurrency(academy.costKrw)}</p>
                      <p className="mt-0.5 text-[11px] font-normal text-gray-400">
                        ${academy.costUsd.toFixed(4)}
                      </p>
                    </TableCell>
                    <TableCell className="text-right text-[13px] text-gray-500">
                      {formatPercent(ratio)}
                    </TableCell>
                    <TableCell className="text-right text-[13px] text-gray-500">
                      {formatNumber(academy.calls)}회
                    </TableCell>
                    <TableCell className="pr-5 text-right text-[13px] text-gray-500">
                      {formatNumber(academy.inputTokens + academy.outputTokens)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {selectedAcademy && (
        <div className="border-t border-gray-100 bg-gray-50/40">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-gray-400" strokeWidth={1.8} />
              <h3 className="text-[14px] font-semibold text-gray-800">
                {selectedAcademy.name} 거래 이력
              </h3>
              <span className="text-[11px] tabular-nums text-gray-400">
                · {items.length}건{cursor ? "+" : ""}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FilterField label="종류">
                <Select
                  value={type}
                  onValueChange={(value) => {
                    setType(value);
                    applyFilters(value, operationType);
                  }}
                >
                  <SelectTrigger className="h-8 min-w-[110px] bg-white text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="text-[12px]"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>

              <FilterField label="상품">
                <Select
                  value={operationType}
                  onValueChange={(value) => {
                    setOperationType(value);
                    applyFilters(type, value);
                  }}
                >
                  <SelectTrigger className="h-8 min-w-[140px] bg-white text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operationOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="text-[12px]"
                      >
                        {option.label}
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
                  className={cn("mr-1 size-3.5", isPending && "animate-spin")}
                  strokeWidth={2}
                  aria-hidden
                />
                새로고침
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-gray-400 hover:text-gray-700"
                onClick={() => setSelectedAcademy(null)}
                aria-label="거래 이력 닫기"
              >
                <X className="size-3.5" strokeWidth={2} />
              </Button>
            </div>
          </div>

          {error ? (
            <div className="px-5 py-10 text-center text-[13px] text-rose-500">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-gray-400">
              {isPending
                ? "거래 이력을 불러오는 중입니다"
                : type !== "all" || operationType !== "all"
                  ? "조건에 맞는 거래가 없습니다"
                  : "아직 거래 내역이 없습니다"}
            </div>
          ) : (
            <div className="overflow-x-auto bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-50 hover:bg-transparent">
                    <TableHead className="h-9 w-[140px] pl-5 text-[11px] font-medium text-gray-400">
                      일시
                    </TableHead>
                    <TableHead className="h-9 w-[110px] text-[11px] font-medium text-gray-400">
                      종류
                    </TableHead>
                    <TableHead className="h-9 min-w-[160px] text-[11px] font-medium text-gray-400">
                      상품
                    </TableHead>
                    <TableHead className="h-9 w-[110px] text-right text-[11px] font-medium text-gray-400">
                      변동
                    </TableHead>
                    <TableHead className="h-9 w-[110px] text-right text-[11px] font-medium text-gray-400">
                      잔고
                    </TableHead>
                    <TableHead className="h-9 min-w-[180px] pr-5 text-[11px] font-medium text-gray-400">
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
            <div className="flex items-center justify-center border-t border-gray-100 bg-white px-5 py-3">
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
                      className="mr-1.5 size-3.5 animate-spin"
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
      )}
    </section>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-gray-400">{label}</span>
      {children}
    </label>
  );
}

function TransactionRow({ tx }: { tx: AcademyTransactionListItem }) {
  const positive = tx.amount > 0;
  const adminAdjusted = tx.type === "ADJUSTMENT" && Boolean(tx.adminId);

  return (
    <TableRow className="border-b border-gray-50/60 last:border-0 hover:bg-gray-50/50">
      <TableCell className="pl-5 text-[12px] tabular-nums text-gray-700">
        {formatDateTime(tx.createdAt)}
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
          "text-right text-[13px] font-semibold tabular-nums",
          positive ? "text-emerald-600" : "text-rose-600",
        )}
      >
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
            <span className="ml-1.5 inline-flex rounded bg-blue-50 px-1 py-px text-[11px] font-semibold uppercase tracking-wider text-blue-600">
              관리자
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-0 px-2 text-[11px] font-medium", typeBadgeClass(type))}
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
    case "EXPIRATION":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function formatPercent(value: number) {
  return `${Math.round(value * 10) / 10}%`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
