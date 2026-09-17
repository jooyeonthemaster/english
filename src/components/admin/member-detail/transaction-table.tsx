"use client";

import { useState, useTransition } from "react";
import { Filter, Loader2, RefreshCw } from "lucide-react";
import { cn, formatDateTime as kstDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableHeader,
  SectionCard,
  StatusBadge,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { TRANSACTION_TYPE } from "@/lib/admin-labels";
import { getMemberTransactions } from "@/actions/admin-members";
import { getOperationTypeLabel } from "@/lib/admin-members-labels";

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
  actorName: string | null;
  actorType: "staff" | "admin" | null;
  metadata: string | null;
  createdAt: Date | string;
}

interface TransactionTableProps {
  memberId: string;
  initial: { items: Transaction[]; nextCursor: string | null };
  knownOperationTypes: string[];
}

// 종류 필터 — 라벨은 레지스트리(TRANSACTION_TYPE)에서.
const TYPE_OPTIONS = [
  { value: "all", label: "전체" },
  ...Object.entries(TRANSACTION_TYPE).map(([value, meta]) => ({ value, label: meta.label })),
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
    // 진행 중 전환보다 먼저 커서를 지워, 필터 직후 "더 보기" 가 옛 커서를 읽지 않게 한다.
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

  const filtered = type !== "all" || operationType !== "all";

  return (
    <SectionCard
      title="거래 이력"
      icon={Filter}
      description={`${items.length}건${cursor ? "+" : ""}`}
      padded={false}
      actions={
        <>
          <FilterField label="종류">
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v);
                applyFilters(v, operationType);
              }}
            >
              <SelectTrigger className="h-8 min-w-[110px] text-[12px]">
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
              <SelectTrigger className="h-8 min-w-[140px] text-[12px]">
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
            type="button"
            variant="ghost"
            size="sm"
            className="text-gray-500"
            onClick={() => applyFilters(type, operationType)}
            disabled={isPending}
            aria-label="목록 새로고침"
          >
            <RefreshCw
              className={cn("size-3.5", isPending && "animate-spin")}
              strokeWidth={2}
              aria-hidden
            />
            새로고침
          </Button>
        </>
      }
    >
      {items.length === 0 ? (
        <AdminEmptyState
          compact
          title={filtered ? "조건에 맞는 거래가 없습니다" : "아직 거래 내역이 없습니다"}
        />
      ) : (
        <DataTable
          bare
          stickyHeader
          maxHeight={720}
          className={cn(isPending && "opacity-60")}
        >
          <DataTableHeader>
            <Tr>
              <Th className="w-[140px]">일시</Th>
              <Th className="w-[110px]">종류</Th>
              <Th className="min-w-[160px]">상품</Th>
              <Th className="w-[120px]">사용자</Th>
              <Th align="right" className="w-[110px]">
                변동
              </Th>
              <Th align="right" className="w-[110px]">
                잔고
              </Th>
              <Th className="min-w-[180px]">비고</Th>
            </Tr>
          </DataTableHeader>
          <DataTableBody>
            {items.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {(cursor || isPending) && items.length > 0 && (
        <div className="flex items-center justify-center border-t border-gray-50 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={loadMore}
            disabled={isPending || !cursor}
            className="text-gray-600"
          >
            {isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />
                불러오는 중
              </>
            ) : (
              "더 보기"
            )}
          </Button>
        </div>
      )}
    </SectionCard>
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
      <span className="text-[11px] font-medium text-gray-400">{label}</span>
      {children}
    </label>
  );
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const positive = tx.amount > 0;
  const adminAdjusted = tx.type === "ADJUSTMENT" && Boolean(tx.adminId);

  return (
    <Tr>
      <Td className="text-[12px] tabular-nums">{formatDateTime(tx.createdAt)}</Td>
      <Td>
        <StatusBadge map={TRANSACTION_TYPE} value={tx.type} />
      </Td>
      <Td className="text-[12px]">
        {tx.operationType ? (
          <span>{tx.operationLabel}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </Td>
      <Td className="text-[12px]">
        {tx.actorName ? (
          <span className="inline-flex items-center gap-1">
            <span className="truncate text-gray-700">{tx.actorName}</span>
            {tx.actorType === "admin" && (
              <span className="shrink-0 rounded bg-blue-50 px-1 py-px text-[10px] font-medium text-blue-600">
                관리자
              </span>
            )}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </Td>
      <Td
        align="right"
        className={cn("font-semibold", positive ? "text-emerald-600" : "text-rose-600")}
      >
        {/* 색만으로 방향을 구분하지 않도록 부호를 항상 표기한다. */}
        {positive ? "+" : "−"}
        {Math.abs(tx.amount).toLocaleString("ko-KR")}
      </Td>
      <Td align="right" className="font-normal text-gray-700">
        {tx.balanceAfter.toLocaleString("ko-KR")}
      </Td>
      <Td className="text-[12px] text-gray-500">
        <div className="line-clamp-2">
          {tx.description ?? <span className="text-gray-300">—</span>}
          {adminAdjusted && (
            <span className="ml-1.5 inline-flex items-center rounded bg-blue-50 px-1 py-px text-[11px] font-semibold uppercase tracking-wider text-blue-600">
              관리자
            </span>
          )}
        </div>
      </Td>
    </Tr>
  );
}

// 시각 표기는 KST 고정 포매터(lib/utils)를 쓴다 — toLocale* 는 서버(UTC)·브라우저(KST) 결과가
// 달라 hydration 이 깨진다.
function formatDateTime(d: Date | string): string {
  return kstDateTime(d);
}
