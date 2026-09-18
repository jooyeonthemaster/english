"use client";

// 실물 쿠폰 배치 목록 표 — 행 호버/클릭=상세, 오른쪽 끝 버튼은 상세를 열지 않는다(data-no-detail).

import { Ban, Pause, Play, Ticket } from "lucide-react";
import type { BatchListRow } from "@/actions/admin/printable-coupons";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  StatusBadge,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { Button } from "@/components/ui/button";
import { activeFlag } from "@/lib/admin-labels";
import { couponEffectHeadline } from "@/lib/printable-coupon-format";
import { cn, formatDate } from "@/lib/utils";
import { batchRowDetail } from "./batch-hover-detail";
import { effectTypeStatus } from "./effect-options";

export function BatchTable({
  rows,
  loading,
  onToggleActive,
  onVoid,
}: {
  rows: BatchListRow[];
  loading: boolean;
  onToggleActive: (row: BatchListRow) => void;
  onVoid: (row: BatchListRow) => void;
}) {
  return (
    <DataTable bare minWidth={820} className={cn("transition-opacity", loading && "opacity-60")}>
      <DataTableHeader>
        <Tr>
          <Th>배치</Th>
          <Th>효과</Th>
          <Th>조건</Th>
          <Th align="right">발급</Th>
          <Th align="right">등록</Th>
          <Th align="right">사용</Th>
          <Th>상태</Th>
          <Th />
        </Tr>
      </DataTableHeader>
      <DataTableBody>
        {rows.length === 0 ? (
          <DataTableEmpty colSpan={8}>
            <AdminEmptyState
              icon={Ticket}
              title="발급된 배치가 없습니다."
              description="오른쪽 위 '쿠폰 발급'으로 첫 배치를 만드세요."
            />
          </DataTableEmpty>
        ) : (
          rows.map((r) => {
            const claimed = r.counts.CLAIMED + r.counts.USED;
            return (
              <AdminHoverDetail key={r.id} title={r.batchName} detail={batchRowDetail(r)}>
                <Tr clickable>
                  <Td>
                    <p className="font-semibold text-gray-800">{r.batchName}</p>
                    <p className="text-[11px] text-gray-400">{r.title}</p>
                  </Td>
                  <Td>
                    <StatusBadge status={effectTypeStatus(r.effectType)} />
                  </Td>
                  <Td className="text-[12px] text-gray-600">
                    {couponEffectHeadline(r)}
                    {r.effectType === "CREDIT_GRANT" && (
                      <span className="mt-0.5 block text-[11px] text-gray-400">
                        {r.grantExpiryAt
                          ? `${formatDate(r.grantExpiryAt)}까지 유효보장`
                          : "소멸일 미변경"}
                      </span>
                    )}
                  </Td>
                  <Td align="right">{r.quantity}</Td>
                  <Td align="right">
                    {claimed}
                    <span className="ml-1 text-[11px] font-normal text-gray-400">
                      ({r.quantity ? Math.round((claimed / r.quantity) * 100) : 0}%)
                    </span>
                  </Td>
                  <Td align="right">{r.counts.USED}</Td>
                  <Td>
                    <StatusBadge status={activeFlag(r.isActive, ["활성", "일시중지"])} />
                    {r.counts.VOID > 0 && (
                      <span className="ml-1.5 text-[11px] text-gray-400">
                        영구중지 {r.counts.VOID}
                      </span>
                    )}
                  </Td>
                  <Td data-no-detail>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onToggleActive(r)}
                        className={cn(
                          "text-[11px]",
                          r.isActive
                            ? "text-gray-500"
                            : "border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700",
                        )}
                        title={
                          r.isActive
                            ? "일시중지 — 되돌릴 수 있음(재개 시 등록·사용 부활)"
                            : "활성화(재개)"
                        }
                      >
                        {r.isActive ? (
                          <Pause className="size-3.5" strokeWidth={2} />
                        ) : (
                          <Play className="size-3.5" strokeWidth={2} />
                        )}
                        {r.isActive ? "일시중지" : "활성"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onVoid(r)}
                        disabled={r.counts.ACTIVE === 0}
                        className="border-rose-200 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        title="미등록 코드 영구중지 — 되돌릴 수 없음(이미 등록/사용분은 유지)"
                      >
                        <Ban className="size-3.5" strokeWidth={2} />
                        영구중지
                      </Button>
                    </div>
                  </Td>
                </Tr>
              </AdminHoverDetail>
            );
          })
        )}
      </DataTableBody>
    </DataTable>
  );
}
