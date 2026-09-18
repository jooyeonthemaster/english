"use client";

import { useState, useTransition } from "react";
import { Filter, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { TRANSACTION_TYPE, statusOf } from "@/lib/admin-labels";
import { getMemberTransactions } from "@/actions/admin-members";
import { formatKstDateTimeShort } from "@/lib/admin-kst-format";
import {
  getOperationTypeLabel,
  getTransactionLabel,
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

// 종류 필터 — 값(키)·색조는 레지스트리(TRANSACTION_TYPE)가 정본이고, 문구만
// getTransactionTypeLabel 을 쓴다. 26-09-17 실DB 분포 실측으로 정정된 라벨
// (ALLOCATION "가입·기본 지급" · TOP_UP "충전·보상 지급" · REFUND "환급·회수")이
// 정본이라서다 — 레지스트리 주석도 "admin-members-labels 와 같게 유지"를 약속한다.
// 레지스트리 라벨이 그 값으로 동기화되면 이 한 겹은 그대로 무해한 항등식이 된다.
const TYPE_OPTIONS = [
  { value: "all", label: "전체" },
  ...Object.keys(TRANSACTION_TYPE).map((value) => ({
    value,
    label: getTransactionTypeLabel(value),
  })),
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
        <TypeBadge type={tx.type} referenceType={tx.referenceType} />
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

// 행 단위 배지는 referenceType 까지 본다 — TOP_UP 167건 중 132건이 무료 지급
// (MISSION 116 · PRINTABLE_COUPON 14 · REFERRAL 2)이라 유형 라벨만으로는
// 유료 충전 35건과 한 덩어리로 보인다. 색조는 레지스트리(TRANSACTION_TYPE) 기준
// 그대로라 필터 드롭다운·다른 화면의 뱃지와 짝이 맞고, 유형 라벨은 title 로 남는다.
// (UI 규약: 뱃지는 StatusBadge 하나 — 파일 안에 색 표를 두지 않는다.)
function TypeBadge({
  type,
  referenceType,
}: {
  type: string;
  referenceType: string | null;
}) {
  const { tone } = statusOf(TRANSACTION_TYPE, type);
  return (
    <span title={`유형: ${getTransactionTypeLabel(type)}`}>
      <StatusBadge
        status={{ label: getTransactionLabel(type, referenceType), tone }}
      />
    </span>
  );
}

// 표시는 KST 고정 — 서버(Vercel)는 UTC 라 timeZone 없이 포맷하면 거래 시각이 9시간
// 이르게 찍힌다. 회원 상세의 다른 구역(member-block·purchases-section)이 쓰는
// admin-kst-format 과 같은 포매터를 써야 한 화면 안에서 표기가 갈리지 않는다.
// 게이트: `npx tsx scripts/analytics-gate-member-kst.ts` (TZ=UTC 로 실행).
const formatDateTime = formatKstDateTimeShort;
