import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import {
  couponEffectHeadline,
  effectTypeLabel,
  statusLabel,
  type PrintableCouponStatus,
} from "@/lib/printable-coupon-format";
import { formatDateTime } from "@/lib/utils";
import type { BatchListRow } from "@/actions/admin/printable-coupons";

// 실물 쿠폰 배치 행 → 호버/클릭 상세. 목록에 이미 실려 온 값만 쓴다(추가 조회 없음).

const STATUS_ORDER: PrintableCouponStatus[] = ["ACTIVE", "CLAIMED", "USED", "VOID"];
const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");

export function batchRowDetail(r: BatchListRow): AdminDetail {
  const claimed = r.counts.CLAIMED + r.counts.USED;
  return {
    title: r.batchName,
    subtitle: [r.title !== r.batchName && r.title, effectTypeLabel(r.effectType)].filter(Boolean).join(" · "),
    summary: [
      { label: "발급", value: `${r.quantity.toLocaleString("ko-KR")}장` },
      { label: "등록", value: `${claimed.toLocaleString("ko-KR")}장 (${pct(claimed, r.quantity)})` },
      { label: "사용", value: `${r.counts.USED.toLocaleString("ko-KR")}장` },
    ],
    fields: detailFields([
      ["효과", couponEffectHeadline(r)],
      ["지급 크레딧", r.grantCredits !== null && `${r.grantCredits.toLocaleString("ko-KR")}C`],
      ["크레딧 유효일수", r.grantExpiryDays !== null && `${r.grantExpiryDays.toLocaleString("ko-KR")}일`],
      ["크레딧 유효보장일", r.grantExpiryAt && formatDateTime(r.grantExpiryAt)],
      ["할인 금액", r.discountAmount !== null && `${r.discountAmount.toLocaleString("ko-KR")}원`],
      ["할인율", r.discountPercent !== null && `${r.discountPercent}%`],
      ["등록 마감", r.validUntil ? formatDateTime(r.validUntil) : "제한 없음"],
      ["학원당 등록 한도", `${r.perAcademyLimit.toLocaleString("ko-KR")}장`],
      ["상태", r.isActive ? "활성" : "일시중지"],
      ["발급 일시", formatDateTime(r.createdAt)],
      ["배치 ID", r.id, true],
    ]),
    sections: [
      {
        title: "코드 상태별 수량",
        columns: [
          { key: "status", label: "상태" },
          { key: "count", label: "수량", align: "right" },
          { key: "ratio", label: "비율", align: "right" },
        ],
        rows: STATUS_ORDER.map((s) => ({
          status: statusLabel(s),
          count: `${(r.counts[s] ?? 0).toLocaleString("ko-KR")}장`,
          ratio: pct(r.counts[s] ?? 0, r.quantity),
        })),
      },
    ],
  };
}
