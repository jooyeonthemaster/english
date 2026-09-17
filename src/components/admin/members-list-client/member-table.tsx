"use client";

// 회원별 보기 — 데스크톱은 열 너비 조절이 되는 표(표 요소는 유지, 스타일은 DataTable 규약),
// 모바일은 세로 카드 목록. 둘 다 현재 페이지의 회원만 받는다.

import type { CSSProperties, RefObject } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Table } from "@/components/ui/table";
import { DataTableBody, DataTableHeader, SortHeader, Th, Tr } from "@/components/admin/kit";
import { cn } from "@/lib/utils";
import type { MemberListItem, MemberSortKey, SortOrder } from "@/actions/admin-members";
import { COLUMN_DEFS, type ColumnId } from "./columns";
import { MemberCard, MemberRow } from "./member-row";
import { ColumnResizeHandle } from "./subcomponents";

export function MemberTable({
  members,
  selectedIds,
  onToggleOne,
  headerCheckState,
  onToggleAll,
  now,
  sortKey,
  sortOrder,
  onToggleSort,
  ariaSortFor,
  onResizeStart,
  wrapRef,
  columnCssVars,
}: {
  members: MemberListItem[];
  selectedIds: Set<string>;
  onToggleOne: (memberId: string, checked: boolean) => void;
  headerCheckState: boolean | "indeterminate";
  onToggleAll: () => void;
  now: number;
  sortKey: MemberSortKey | null;
  sortOrder: SortOrder;
  onToggleSort: (key: MemberSortKey) => void;
  ariaSortFor: (key: MemberSortKey) => "ascending" | "descending" | "none";
  onResizeStart: (e: React.PointerEvent, id: ColumnId) => void;
  wrapRef: RefObject<HTMLDivElement | null>;
  columnCssVars: CSSProperties;
}) {
  return (
    <>
      {/* 모바일: 가로 스크롤 대신 회원 세로 카드 (트레이 위 분리된 카드) */}
      <ul className="space-y-2 bg-gray-50/60 p-2.5 lg:hidden">
        {members.map((m) => (
          <MemberCard
            key={m.id}
            member={m}
            now={now}
            selected={selectedIds.has(m.id)}
            onSelectChange={(checked) => onToggleOne(m.id, checked)}
          />
        ))}
      </ul>

      {/* 데스크톱/태블릿: 열 너비 조절 표 (가로 폭 유지) */}
      <div className="hidden overflow-x-auto lg:block" ref={wrapRef} style={columnCssVars}>
        <Table className="w-max table-fixed text-[13px]">
          <DataTableHeader>
            <Tr className="hover:bg-transparent">
              <Th className="w-9 pr-0">
                <Checkbox
                  checked={headerCheckState}
                  onCheckedChange={onToggleAll}
                  aria-label="현재 페이지의 회원 전체 선택"
                  title="현재 페이지의 회원만 선택합니다"
                />
              </Th>
              {COLUMN_DEFS.map((col) => (
                <Th
                  key={col.id}
                  align={col.align}
                  className={cn("relative", col.responsive)}
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
              <Th className="w-[60px]" />
            </Tr>
          </DataTableHeader>
          <DataTableBody>
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                now={now}
                selected={selectedIds.has(m.id)}
                onSelectChange={(checked) => onToggleOne(m.id, checked)}
              />
            ))}
          </DataTableBody>
        </Table>
      </div>
    </>
  );
}
