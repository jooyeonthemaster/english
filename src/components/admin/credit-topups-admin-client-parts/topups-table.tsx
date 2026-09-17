"use client";

import { Coins } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  ResultCount,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { paymentMethodLabel } from "@/lib/admin-labels";
import { formatDate } from "@/components/admin/credit-promotion-editor";
import { topUpRowDetail } from "./topup-hover-detail";
import { formatOrderNo, getTopUpStatusMeta, TopUpStatusBadge } from "./topup-status";
import type { AdminTopUp } from "./types";

// 충전 내역 표 — 행 호버 = 요약 팝오버, 행 클릭 = 결제 상세 팝업(부모가 연다).

const COLUMN_COUNT = 9;

export function TopUpsTable({
  topUps,
  selectedId,
  onSelect,
  page,
  totalPages,
  total,
  pending,
  onPageChange,
}: {
  topUps: AdminTopUp[];
  selectedId: string | null;
  onSelect: (topUpId: string) => void;
  page: number;
  totalPages: number;
  total: number;
  /** 페이지 이동 중(표를 흐리게) */
  pending: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">충전 내역</h2>
          <p className="mt-0.5 text-[12px] text-gray-400">행을 클릭하면 결제 상세가 열립니다</p>
        </div>
        <ResultCount total={total} page={Math.min(page, totalPages)} totalPages={totalPages} />
      </div>

      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <DataTable bare minWidth={920}>
          <DataTableHeader>
            <Tr>
              <Th>주문번호</Th>
              <Th>일시</Th>
              <Th>학원</Th>
              <Th>상태</Th>
              <Th align="right">결제금액</Th>
              <Th align="right">크레딧</Th>
              <Th>결제수단</Th>
              <Th>포트원 결제 ID</Th>
              <Th align="right">충전 후 잔고</Th>
            </Tr>
          </DataTableHeader>
          <DataTableBody>
            {topUps.length === 0 ? (
              <DataTableEmpty colSpan={COLUMN_COUNT}>
                <AdminEmptyState icon={Coins} title="충전 내역이 없습니다" />
              </DataTableEmpty>
            ) : (
              topUps.map((topUp) => (
                <AdminHoverDetail
                  key={topUp.id}
                  title={topUp.academy.name}
                  detail={topUpRowDetail(topUp, {
                    status: getTopUpStatusMeta(topUp).label,
                    payMethod: paymentMethodLabel(topUp.paymentMethod),
                  })}
                  click="none"
                >
                  <Tr clickable selected={selectedId === topUp.id} onClick={() => onSelect(topUp.id)}>
                    <Td className="text-[12px] font-medium tabular-nums text-gray-600">
                      {formatOrderNo(topUp.id)}
                    </Td>
                    <Td muted>{formatDate(topUp.createdAt)}</Td>
                    <Td>
                      <div className="text-[13px] font-semibold text-gray-900">{topUp.academy.name}</div>
                      <div className="text-[11px] text-gray-400">
                        {topUp.academy.staff[0]?.name ?? "원장 미지정"}
                      </div>
                    </Td>
                    <Td>
                      <TopUpStatusBadge topUp={topUp} />
                    </Td>
                    <Td align="right" className="font-semibold">
                      {topUp.price.toLocaleString("ko-KR")}원
                    </Td>
                    <Td align="right" className="font-semibold text-blue-700">
                      {topUp.creditAmount.toLocaleString("ko-KR")}C
                    </Td>
                    <Td muted>{paymentMethodLabel(topUp.paymentMethod)}</Td>
                    <Td muted className="max-w-[190px] truncate">
                      {topUp.paymentId ?? "-"}
                    </Td>
                    <Td align="right" className="text-[12px] text-gray-600">
                      {topUp.creditTransaction
                        ? `${topUp.creditTransaction.balanceAfter.toLocaleString("ko-KR")}C`
                        : "-"}
                    </Td>
                  </Tr>
                </AdminHoverDetail>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </div>

      <AdminPagination page={page} totalPages={totalPages} disabled={pending} onChange={onPageChange} />
    </section>
  );
}
