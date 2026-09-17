import { ShoppingBag } from "lucide-react";
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
import { TOPUP_STATUS, paymentMethodLabel } from "@/lib/admin-labels";
import { formatDate } from "./format";
import type { MemberPurchaseItem } from "@/actions/admin-members";

const n = (v: number) => v.toLocaleString("ko-KR");

/** 구입 상품 이력 — 상태·결제수단 라벨은 레지스트리(TOPUP_STATUS·PAYMENT_METHOD)에서만. */
export function PurchasesSection({
  purchases,
}: {
  purchases: MemberPurchaseItem[];
}) {
  return (
    <SectionCard title="구입 상품 이력" icon={ShoppingBag} padded={false}>
      {purchases.length === 0 ? (
        <AdminEmptyState compact icon={ShoppingBag} title="구입 이력이 없습니다" />
      ) : (
        <DataTable bare stickyHeader maxHeight={360}>
          <DataTableHeader>
            <Tr>
              <Th>상품</Th>
              <Th>상태</Th>
              <Th align="right">금액</Th>
              <Th align="right">크레딧</Th>
              <Th>결제수단</Th>
              <Th>구입일</Th>
            </Tr>
          </DataTableHeader>
          <DataTableBody>
            {purchases.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium text-gray-900">{p.name}</Td>
                <Td>
                  <StatusBadge map={TOPUP_STATUS} value={p.status} />
                </Td>
                <Td align="right">{n(p.price)}원</Td>
                <Td align="right">{n(p.creditAmount)} C</Td>
                <Td muted>{paymentMethodLabel(p.paymentMethod)}</Td>
                <Td muted className="tabular-nums">
                  {formatDate(p.purchasedAt)}
                </Td>
              </Tr>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </SectionCard>
  );
}
