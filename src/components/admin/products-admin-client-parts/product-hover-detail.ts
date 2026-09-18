import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import { formatDateTime } from "@/lib/utils";
import type { AdminCreditProductView } from "@/lib/credit-top-up-products";
import { promoBenefitText } from "../promotions-admin-client-parts/promotion-hover-detail";

// 상품 관리 카드 헤더 → 호버 상세. 이미 가진 상품 뷰만 쓴다(추가 조회 없음).
// 접힌 카드에 안 보이는 코드·정가·크레딧 단가·유효기간·적용 프로모션 기간을 채운다.

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const dt = (v: string | null) => (v ? formatDateTime(v) : null);

export function productCardDetail(p: AdminCreditProductView): AdminDetail {
  const running = p.promotions.filter((x) => x.isInWindow).length;
  return {
    title: `${p.name} · ${p.creditAmount.toLocaleString("ko-KR")}C`,
    subtitle: `${p.code} · ${p.isActive ? "노출 중" : "비활성"}`,
    fields: detailFields([
      ["상품 코드", p.code],
      ["표시 라벨", p.label],
      ["정가", won(p.basePrice)],
      ["크레딧당 단가", `${p.perCredit.toLocaleString("ko-KR")}원`],
      ["크레딧 유효기간", p.expiryDays ? `${p.expiryDays.toLocaleString("ko-KR")}일` : "무기한"],
      ["적용 프로모션", p.isPromotionActive ? p.promotionName?.trim() || "이름 없음" : null],
      [
        "프로모션 기간",
        p.isPromotionActive && p.promotionStartsAt && `${dt(p.promotionStartsAt)} ~ ${dt(p.promotionEndsAt)}`,
      ],
      ["할인", p.discountAmount > 0 && `${p.discountRate}% (${won(p.discountAmount)})`],
      ["보너스", p.bonusCredits > 0 && `+${p.bonusRate}% (+${p.bonusCredits.toLocaleString("ko-KR")}C)`],
      ["정렬 순서", String(p.sortOrder)],
      ["현재 결제금액", won(p.price)],
      ["프로모션", `진행 중 ${running}개 · 등록 ${p.promotions.length}개`],
      ["설명", p.description, true],
      ["수정", dt(p.updatedAt)],
    ]),
    sections: p.promotions.length
      ? [
          {
            title: "등록된 프로모션",
            columns: [
              { key: "name", label: "프로모션" },
              { key: "benefit", label: "혜택" },
              { key: "window", label: "기간", wide: true },
              { key: "status", label: "상태" },
            ],
            rows: p.promotions.map((x) => ({
              name: x.name?.trim() || "이름 없음",
              benefit: promoBenefitText(x),
              window: `${dt(x.startsAt) ?? "-"} ~ ${dt(x.endsAt) ?? "-"}`,
              status: x.isInWindow ? "진행 중" : x.isActive ? "기간 외" : "비활성",
            })),
          },
        ]
      : undefined,
  };
}
