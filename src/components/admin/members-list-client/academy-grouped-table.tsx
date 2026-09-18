"use client";

// 학원별 보기 — 데스크톱은 열 너비 조절이 되는 표(표 요소는 유지, 스타일은 DataTable 규약),
// 모바일은 학원 세로 카드. 현재 페이지의 학원 그룹만 받는다.

import Link from "next/link";
import { Building2, MoveRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table } from "@/components/ui/table";
import {
  DataTableBody,
  DataTableHeader,
  SortHeader,
  StatusBadge,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { ACADEMY_STATUS } from "@/lib/admin-labels";
import type { MemberListItem, MemberSortKey, SortOrder } from "@/actions/admin-members";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import type { ColumnId, ResizableColumnDef } from "./columns";
import { ColumnResizeHandle } from "./subcomponents";
import { BalanceCell, ExpiryCell, LatestPurchaseCell } from "./member-row";
import { academyGroupDetail } from "./member-hover-detail";
import { getInitials } from "./formatters";
import type { AcademyGroup } from "./member-list-model";

export type { AcademyGroup } from "./member-list-model";

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
  onResizeStart: (e: React.PointerEvent, id: ColumnId) => void;
}) {
  return (
    <>
      {/* 모바일: 가로 스크롤 대신 학원별 세로 카드 (트레이 위 분리된 카드) */}
      <ul className="space-y-2 bg-gray-50/60 p-2.5 lg:hidden">
        {groups.map((g) => {
          const selected = selectedIds.has(g.academyId);
          return (
            <li
              key={g.academyId}
              className={cn(
                "rounded-xl border bg-white px-4 py-3.5 transition-colors",
                selected ? "border-blue-200 bg-blue-50/40 ring-1 ring-blue-100" : "border-gray-100",
              )}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selected}
                  onCheckedChange={(v) => onToggleOne(g.academyId, v === true)}
                  aria-label={`${g.academyName} 선택`}
                  className="mt-2.5 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <AcademyIdentity g={g} />
                </div>
                <div className="shrink-0 pt-1 text-right">
                  <BalanceCell balance={g.creditBalance?.balance ?? null} />
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-gray-50/60 p-2.5">
                <MemberRows members={g.members} onMoveMember={onMoveMember} />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-[11px] text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <span className="text-gray-400">최근 구매</span>
                  <LatestPurchaseCell purchase={g.latestPurchase} />
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-gray-400">소멸</span>
                  <ExpiryCell expiresAt={g.creditBalance?.expiresAt ?? null} now={now} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* 데스크톱/태블릿: 열 너비 조절 표 (가로 폭 유지) */}
      <Table className="hidden w-max table-fixed text-[13px] lg:table">
        <DataTableHeader>
          <Tr className="hover:bg-transparent">
            <Th className="w-9 pr-0">
              <Checkbox
                checked={headerCheckState}
                onCheckedChange={onToggleAll}
                aria-label="현재 페이지의 학원 전체 선택"
                title="현재 페이지의 학원만 선택합니다"
              />
            </Th>
            {columns.map((col) => (
              <Th
                key={col.id}
                align={col.align}
                className="relative"
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
              </Th>
            ))}
          </Tr>
        </DataTableHeader>
        <DataTableBody>
          {groups.map((g) => (
            // 행 자체엔 클릭 동작이 없어 클릭 = 학원 상세 팝업(소속 회원 전체 포함).
            <AdminHoverDetail key={g.academyId} title={g.academyName} detail={academyGroupDetail(g)}>
              <Tr clickable selected={selectedIds.has(g.academyId)}>
                <Td className="w-9 pr-0" data-no-detail>
                  <Checkbox
                    checked={selectedIds.has(g.academyId)}
                    onCheckedChange={(v) => onToggleOne(g.academyId, v === true)}
                    aria-label={`${g.academyName} 선택`}
                  />
                </Td>

                {/* 학원 — 강조. 학원 상세(대표 원장 관점)로 이동. */}
                <Td>
                  <AcademyIdentity g={g} />
                </Td>

                {/* 소속 회원 — 약하게, 복수 지원 */}
                <Td>
                  <MemberRows members={g.members} onMoveMember={onMoveMember} />
                </Td>

                <Td>
                  <LatestPurchaseCell purchase={g.latestPurchase} />
                </Td>
                <Td align="right">
                  <BalanceCell balance={g.creditBalance?.balance ?? null} />
                </Td>
                <Td>
                  <ExpiryCell expiresAt={g.creditBalance?.expiresAt ?? null} now={now} />
                </Td>
              </Tr>
            </AdminHoverDetail>
          ))}
        </DataTableBody>
      </Table>
    </>
  );
}

/** 학원 아이콘 + 이름 + 상태뱃지 + slug·회원수 (표/카드 공용). */
function AcademyIdentity({ g }: { g: AcademyGroup }) {
  const repId = g.members[0]?.id;
  const body = (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"
        aria-hidden
      >
        <Building2 className="size-5" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "truncate text-[13px] font-semibold text-gray-900",
              repId && "group-hover/aca:text-blue-600",
            )}
          >
            {g.academyName}
          </span>
          <StatusBadge map={ACADEMY_STATUS} value={g.status} className="h-5 shrink-0" />
        </div>
        <div className="truncate text-[11px] text-gray-400">
          /{g.slug} · 회원 {g.members.length}명
        </div>
      </div>
    </div>
  );
  return repId ? (
    <Link
      href={`/admin/members/${repId}`}
      className="group/aca -m-1 block rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

/** 소속 회원 목록 (표/카드 공용). */
function MemberRows({
  members,
  onMoveMember,
}: {
  members: MemberListItem[];
  onMoveMember: (member: MemberListItem) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {members.map((m) => (
        <div key={m.id} className="group/mem flex min-w-0 items-center gap-2">
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500"
            aria-hidden
          >
            {getInitials(m.name)}
          </span>
          <Link
            href={`/admin/members/${m.id}`}
            className="-m-0.5 min-w-0 flex-1 rounded p-0.5 outline-none hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500/30"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[12px] text-gray-700">{m.name}</span>
              {!m.isActive && <span className="shrink-0 text-[11px] text-gray-400">비활성</span>}
            </span>
            <span className="block truncate text-[11px] text-gray-400">{m.email}</span>
          </Link>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onMoveMember(m)}
            className="shrink-0 text-gray-400 hover:bg-blue-50 hover:text-blue-600 focus-visible:opacity-100 lg:opacity-0 lg:group-hover/mem:opacity-100"
            title={`${m.name} 다른 학원으로 이동`}
          >
            <MoveRight className="size-3.5" strokeWidth={2} aria-hidden />
            이동
          </Button>
        </div>
      ))}
    </div>
  );
}
