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
import { TOPUP_STATUS, paymentMethodLabel, statusOf } from "@/lib/admin-labels";
import type { StatusMeta } from "@/lib/admin-labels";
// 표시는 KST 고정 — 서버(Vercel)는 UTC 라 결제일이 하루 이르게 찍힌다(paidAt UTC 15시 이후 6건).
// 상세 화면 공용 formatDate(./format)는 timeZone 을 주지 않아 이 축을 못 막는다.
import { formatKstDate } from "@/lib/admin-kst-format";
// 대기 상태(PENDING·WAITING_FOR_DEPOSIT) 자구는 결제 관리·무통장 화면과 같은 판정을 쓴다.
// 이 화면만 「입금 대기」로 남아 2.5개월 지난 주문이 아직 입금을 기다리는 것처럼 보였다.
import {
  TOPUP_PROGRESS_ACTIVE_LABEL,
  TOPUP_PROGRESS_STALE_LABEL,
  classifyTopUpProgress,
  topUpStaleTitle,
} from "@/lib/admin-topup-progress";
import type { MemberPurchaseItem } from "@/actions/admin-members";

const n = (v: number) => v.toLocaleString("ko-KR");

/**
 * 상태 표시 — 라벨·색조는 레지스트리(TOPUP_STATUS)에서만 가져오고,
 * 대기 상태만 「생성 경과」를 함께 본다(DB 상태는 바꾸지 않는다, 스펙 §9.2 D3).
 * 시간창 이내면 「진행 중」, 초과면 「미완료(이탈·만료)」.
 */
function purchaseStatus(
  status: string,
  createdAt: string,
  now: number,
): { meta: StatusMeta; title?: string } {
  const base = statusOf(TOPUP_STATUS, status);
  const progress = classifyTopUpProgress(status, createdAt, now);
  if (progress.state === "n/a") return { meta: base };
  if (progress.state === "in_progress") {
    return {
      meta: { label: TOPUP_PROGRESS_ACTIVE_LABEL, tone: "sky" },
      title: `원 상태: ${base.label}(${status}) · 생성 ${progress.windowMinutes}분 이내`,
    };
  }
  return {
    meta: { label: TOPUP_PROGRESS_STALE_LABEL, tone: "gray" },
    title: topUpStaleTitle(base.label, status, progress.windowMinutes),
  };
}

/** 구입 상품 이력 — 상태·결제수단 라벨은 레지스트리(TOPUP_STATUS·PAYMENT_METHOD)에서만. */
export function PurchasesSection({
  purchases,
}: {
  purchases: MemberPurchaseItem[];
}) {
  // 렌더 1회당 기준 시각 하나 — 같은 목록 안에서 행마다 경과 판정이 갈리지 않게 한다.
  const now = Date.now();
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
            {purchases.map((p) => {
              const st = purchaseStatus(p.status, p.createdAt, now);
              return (
                <Tr key={p.id}>
                  <Td className="font-medium text-gray-900">{p.name}</Td>
                  <Td>
                    {/* 판정 근거(원 상태·시간창)는 배지 위 툴팁으로 — 결제 관리 표와 같은 자구. */}
                    <span title={st.title} className="inline-flex">
                      <StatusBadge status={st.meta} />
                    </span>
                  </Td>
                  <Td align="right">{n(p.price)}원</Td>
                  <Td align="right">{n(p.creditAmount)} C</Td>
                  <Td muted>{paymentMethodLabel(p.paymentMethod)}</Td>
                  <Td muted className="tabular-nums">
                    {formatKstDate(p.purchasedAt)}
                  </Td>
                </Tr>
              );
            })}
          </DataTableBody>
        </DataTable>
      )}
    </SectionCard>
  );
}
