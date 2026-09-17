"use client";

// 프로모션 관리 — 전 상품의 프로모션 한 표. 행 클릭=편집 팝업, 호버=상세 팝오버.

import { useTransition } from "react";
import { Pencil, Plus, Tag } from "lucide-react";
import { toast } from "sonner";
import { setCreditPromotionActive } from "@/actions/admin/credit-products";
import type {
  AdminCreditProductView,
  AdminPromotionView,
} from "@/lib/credit-top-up-products";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  SectionCard,
  StatusBadge,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { ToggleSwitch, formatDate } from "@/components/admin/credit-promotion-editor";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { CopyLinkButton } from "./copy-link-button";
import { promotionRowDetail } from "./promotion-hover-detail";
import {
  audienceLabel,
  bonusLabel,
  discountLabel,
  promotionStatus,
} from "./promotion-labels";

export type PromotionRow = {
  product: AdminCreditProductView;
  promo: AdminPromotionView;
};

export function PromotionsTable({
  rows,
  origin,
  academyNameById,
  onEdit,
  onCreate,
  onProductChange,
}: {
  rows: PromotionRow[];
  origin: string;
  academyNameById: Map<string, string>;
  onEdit: (row: PromotionRow) => void;
  onCreate: () => void;
  onProductChange: (updated: AdminCreditProductView) => void;
}) {
  return (
    <SectionCard
      title="전체 프로모션"
      description={
        <>
          모든 충전 상품의 프로모션을 한 곳에서 관리합니다. 한 상품에 여러 개가 겹치면{" "}
          <b className="text-gray-600">링크 우선 → 우선순위 높은 순 → 혜택 큰 순</b>
          으로 하나가 적용됩니다.
        </>
      }
      padded={false}
    >
      <DataTable bare minWidth={960}>
        <DataTableHeader>
          <Tr>
            <Th>상품</Th>
            <Th>프로모션명</Th>
            <Th>할인</Th>
            <Th>보너스</Th>
            <Th>기간</Th>
            <Th>대상</Th>
            <Th>링크</Th>
            <Th align="right">우선순위</Th>
            <Th>상태</Th>
          </Tr>
        </DataTableHeader>
        <DataTableBody>
          {rows.length === 0 ? (
            <DataTableEmpty colSpan={9}>
              <AdminEmptyState
                icon={Tag}
                title="등록된 프로모션이 없습니다."
                description="오른쪽 위 '프로모션 추가'로 첫 프로모션을 만드세요."
                action={
                  <Button type="button" size="sm" onClick={onCreate}>
                    <Plus className="size-4" strokeWidth={2} />
                    프로모션 추가
                  </Button>
                }
              />
            </DataTableEmpty>
          ) : (
            rows.map(({ product, promo }) => (
              <AdminHoverDetail
                key={promo.id}
                title={promo.name?.trim() || "이름 없는 프로모션"}
                detail={promotionRowDetail(product, promo, academyNameById)}
                click="none"
              >
                <Tr clickable onClick={() => onEdit({ product, promo })}>
                  <Td>
                    <div className="font-semibold text-gray-900">{product.name}</div>
                    <div className="text-[11px] text-gray-400">
                      {product.creditAmount.toLocaleString("ko-KR")}C ·{" "}
                      {product.basePrice.toLocaleString("ko-KR")}원
                    </div>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-gray-800">
                      {promo.name?.trim() || "이름 없는 프로모션"}
                      <Pencil className="size-3 text-gray-300" strokeWidth={2} />
                    </span>
                  </Td>
                  <Td className="text-[12px] font-semibold text-rose-600">
                    {discountLabel(promo) ?? (
                      <span className="font-normal text-gray-300">-</span>
                    )}
                  </Td>
                  <Td className="text-[12px] font-semibold text-emerald-600">
                    {bonusLabel(promo) ?? (
                      <span className="font-normal text-gray-300">-</span>
                    )}
                  </Td>
                  <Td muted className="tabular-nums">
                    {formatDate(promo.startsAt)}
                    <br />~ {formatDate(promo.endsAt)}
                  </Td>
                  <Td muted>{audienceLabel(promo)}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {promo.linkToken ? (
                      <CopyLinkButton url={`${origin}/credits/promo/${promo.linkToken}`} />
                    ) : (
                      <span className="text-[12px] text-gray-300">없음</span>
                    )}
                  </Td>
                  <Td align="right">{promo.priority}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2.5">
                      <PromotionActiveToggle promo={promo} onProductChange={onProductChange} />
                      <StatusBadge status={promotionStatus(promo)} />
                    </div>
                  </Td>
                </Tr>
              </AdminHoverDetail>
            ))
          )}
        </DataTableBody>
      </DataTable>
    </SectionCard>
  );
}

/** 리스트 행의 활성 토글 — 모달 없이 즉시 서버 반영(기존 액션 재사용). */
function PromotionActiveToggle({
  promo,
  onProductChange,
}: {
  promo: AdminPromotionView;
  onProductChange: (updated: AdminCreditProductView) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <ToggleSwitch
      checked={promo.isActive}
      disabled={pending}
      text=""
      label={`${promo.name ?? "프로모션"} 활성`}
      onChange={(next) => {
        if (pending) return;
        startTransition(async () => {
          const res = await setCreditPromotionActive(promo.id, next);
          if (res.success && res.product) onProductChange(res.product);
          else toast.error(res.error ?? "상태 변경에 실패했습니다.");
        });
      }}
    />
  );
}
