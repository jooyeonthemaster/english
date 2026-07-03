"use client";

import Link from "next/link";
import { AlertTriangle, Building2, MoveRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  MemberListItem,
  MemberSortKey,
  SortOrder,
} from "@/actions/admin-members";
import type { ResizableColumnDef } from "../members-list-client";
import { SortHeader, ColumnResizeHandle } from "./subcomponents";
import { LatestPurchaseCell } from "./member-row";
import { formatDate, getInitials } from "./formatters";

const LOW_BALANCE_THRESHOLD = 50;

// 학원 상태 → 가입 경로 중심의 직관적 뱃지. 자가 가입(온보딩)=TRIAL,
// 관리자 승인 가입=ACTIVE. 정지/비활성은 계정 상태를 그대로 표기.
const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  TRIAL: { label: "자가 가입", className: "bg-sky-50 text-sky-600" },
  ACTIVE: { label: "관리자 승인", className: "bg-emerald-50 text-emerald-600" },
  SUSPENDED: { label: "정지", className: "bg-rose-50 text-rose-600" },
  DEACTIVATED: { label: "비활성", className: "bg-gray-100 text-gray-500" },
};

/**
 * 학원별 보기 전용 행 모델 — 한 학원과 거기 소속된 회원(원장)들.
 * 학원(크레딧·플랜·소멸시효의 실제 단위)을 앞·강조로, 소속 회원을 옆에 약하게.
 */
export interface AcademyGroup {
  academyId: string;
  academyName: string;
  slug: string;
  status: string;
  memo: string | null;
  latestPurchase: MemberListItem["latestPurchase"];
  creditBalance: MemberListItem["creditBalance"];
  members: MemberListItem[];
}

export function AcademyGroupedTable({
  groups,
  columns,
  selectedIds,
  onToggleOne,
  headerCheckState,
  onToggleAll,
  now,
  onMoveMember,
  sortKey,
  sortOrder,
  onToggleSort,
  ariaSortFor,
  onResizeStart,
}: {
  groups: AcademyGroup[];
  columns: ResizableColumnDef[];
  selectedIds: Set<string>;
  onToggleOne: (academyId: string, checked: boolean) => void;
  headerCheckState: boolean | "indeterminate";
  onToggleAll: () => void;
  now: number;
  onMoveMember: (member: MemberListItem) => void;
  sortKey: MemberSortKey | null;
  sortOrder: SortOrder;
  onToggleSort: (key: MemberSortKey) => void;
  ariaSortFor: (key: MemberSortKey) => "ascending" | "descending" | "none";
  onResizeStart: (e: React.PointerEvent, id: ResizableColumnDef["id"]) => void;
}) {
  return (
    <Table className="w-max table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent border-b border-gray-50">
          <TableHead className="h-9 pl-5 pr-0 w-9">
            <Checkbox
              checked={headerCheckState}
              onCheckedChange={onToggleAll}
              aria-label="화면의 학원 전체 선택"
            />
          </TableHead>
          {columns.map((col) => (
            <TableHead
              key={col.id}
              className={cn(
                "relative text-[11px] text-gray-400 font-medium h-9",
                col.headPad,
                col.align === "right" && "text-right",
              )}
              style={{ width: `var(--mw-${col.id})` }}
              aria-sort={ariaSortFor(col.sortKey)}
            >
              <SortHeader
                label={col.label}
                active={sortKey === col.sortKey}
                order={sortOrder}
                onClick={() => onToggleSort(col.sortKey)}
              />
              <ColumnResizeHandle onPointerDown={(e) => onResizeStart(e, col.id)} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => {
          const badge = STATUS_BADGE[g.status];
          return (
            <TableRow
              key={g.academyId}
              className={cn(
                "border-b border-gray-50/60 last:border-0 align-top",
                selectedIds.has(g.academyId) ? "bg-blue-50/40" : "hover:bg-gray-50/50",
              )}
            >
              <TableCell className="pl-5 pr-0 pt-4">
                <Checkbox
                  checked={selectedIds.has(g.academyId)}
                  onCheckedChange={(v) => onToggleOne(g.academyId, v === true)}
                  aria-label={`${g.academyName} 선택`}
                />
              </TableCell>

              {/* 학원 — 강조 */}
              <TableCell className="py-3 pl-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="size-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"
                    aria-hidden
                  >
                    <Building2 className="size-5" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[14px] font-semibold text-gray-900 truncate">
                        {g.academyName}
                      </span>
                      {badge && (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "border-0 text-[10px] px-1.5 h-4 font-medium shrink-0",
                            badge.className,
                          )}
                        >
                          {badge.label}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">
                      /{g.slug} · 회원 {g.members.length}명
                    </div>
                  </div>
                </div>
              </TableCell>

              {/* 소속 회원 — 약하게, 복수 지원 */}
              <TableCell className="py-3">
                <div className="flex flex-col gap-1.5">
                  {g.members.map((m) => (
                    <div key={m.id} className="group/mem flex items-center gap-2 min-w-0">
                      <span
                        className="size-6 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold flex items-center justify-center shrink-0"
                        aria-hidden
                      >
                        {getInitials(m.name)}
                      </span>
                      <Link
                        href={`/admin/members/${m.id}`}
                        className="min-w-0 flex-1 rounded -m-0.5 p-0.5 outline-none hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500/30"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[12.5px] text-gray-700 truncate">
                            {m.name}
                          </span>
                          {!m.isActive && (
                            <span className="text-[10px] text-gray-400 shrink-0">
                              비활성
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] text-gray-400 truncate">
                          {m.email}
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => onMoveMember(m)}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-gray-400 opacity-0 transition-all hover:bg-blue-50 hover:text-blue-600 group-hover/mem:opacity-100 focus-visible:opacity-100 shrink-0"
                        title={`${m.name} 다른 학원으로 이동`}
                      >
                        <MoveRight className="size-3.5" strokeWidth={2} aria-hidden />
                        이동
                      </button>
                    </div>
                  ))}
                </div>
              </TableCell>

              <TableCell className="pt-4">
                <LatestPurchaseCell purchase={g.latestPurchase} />
              </TableCell>
              <TableCell className="text-right pt-4">
                <BalanceCell balance={g.creditBalance?.balance ?? null} />
              </TableCell>
              <TableCell className="pt-4">
                <ExpiryCell expiresAt={g.creditBalance?.expiresAt ?? null} now={now} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ExpiryCell({
  expiresAt,
  now,
}: {
  expiresAt: Date | string | null;
  now: number;
}) {
  if (!expiresAt) return <span className="text-[11px] text-gray-300">—</span>;
  const days = Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
  return (
    <div className="tabular-nums leading-tight">
      <div className="text-[12px] text-gray-600">{formatDate(expiresAt)}</div>
      <div
        className={cn(
          "text-[11px]",
          days < 0 ? "text-gray-300" : days <= 7 ? "text-rose-500" : "text-gray-400",
        )}
      >
        {days < 0 ? "만료" : `D-${days}`}
      </div>
    </div>
  );
}

function BalanceCell({ balance }: { balance: number | null }) {
  if (balance === null)
    return <span className="text-[11px] text-gray-300">미생성</span>;
  const isLow = balance < LOW_BALANCE_THRESHOLD;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 tabular-nums",
        isLow ? "text-rose-600" : "text-gray-800",
      )}
      title={isLow ? "잔고가 낮습니다" : undefined}
    >
      {isLow && (
        <AlertTriangle
          className="size-3 text-rose-500 shrink-0"
          strokeWidth={2}
          aria-hidden="true"
        />
      )}
      <span className="text-[14px] font-semibold leading-none">
        {balance.toLocaleString("ko-KR")}
      </span>
      <span className="text-[11px] text-gray-400 font-normal">C</span>
    </span>
  );
}
