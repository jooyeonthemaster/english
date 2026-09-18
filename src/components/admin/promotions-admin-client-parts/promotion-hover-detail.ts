import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import { formatDateTime } from "@/lib/utils";
import type {
  AdminCreditProductView,
  AdminPromotionView,
} from "@/lib/credit-top-up-products";
import type { AdminBundleView } from "@/actions/admin/credit-promotion-bundles";

// 프로모션 관리 — 프로모션 행·번들 카드 → 호버 상세. 이미 가진 데이터만 쓴다(추가 조회 없음).
// 목록에 안 보이는 대상 학원 이름·정확한 기간(연도 포함)·상품 기본 정보를 채운다.

type PromoLike = {
  discountType: string;
  discountValue: number;
  bonusType: string;
  bonusValue: number;
};

const dt = (v: string | null) => (v ? formatDateTime(v) : null);
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function promoBenefitText(p: PromoLike): string {
  const parts: string[] = [];
  if (p.discountValue > 0) {
    parts.push(
      p.discountType === "AMOUNT" ? `${won(p.discountValue)} 할인` : `${p.discountValue}% 할인`,
    );
  }
  if (p.bonusValue > 0) {
    parts.push(
      p.bonusType === "AMOUNT"
        ? `크레딧 +${p.bonusValue.toLocaleString("ko-KR")}C`
        : `크레딧 +${p.bonusValue}%`,
    );
  }
  return parts.join(" · ") || "혜택 없음";
}

function promoStatusText(p: { isActive: boolean; isInWindow: boolean }) {
  if (p.isInWindow) return "진행 중";
  return p.isActive ? "기간 외(활성)" : "비활성";
}

export function promotionRowDetail(
  product: AdminCreditProductView,
  promo: AdminPromotionView,
  academyNameById: Map<string, string>,
): AdminDetail {
  const targets = promo.targetAcademyIds;
  return {
    title: promo.name?.trim() || "이름 없는 프로모션",
    subtitle: `${product.name} · ${promoStatusText(promo)}`,
    // 호버 미리보기는 앞 8개만 보이므로 목록에 없는 값(연도 포함 기간·대상·상품 정보)을 앞에 둔다.
    fields: detailFields([
      ["시작", dt(promo.startsAt)],
      ["종료", dt(promo.endsAt)],
      [
        "공개 범위",
        promo.audience === "TARGETED"
          ? `지정 학원/링크 전용 (지정 ${targets.length.toLocaleString("ko-KR")}곳)`
          : "전체 공개",
      ],
      ["상품", `${product.name} (${product.code})`],
      ["상품 정가", `${won(product.basePrice)} · ${product.creditAmount.toLocaleString("ko-KR")}C`],
      ["크레딧 유효기간", product.expiryDays ? `${product.expiryDays}일` : null],
      ["상품 노출", product.isActive ? "노출 중" : "비활성"],
      ["공유 링크", promo.linkToken ? "발급됨" : "없음"],
      ["상태", promoStatusText(promo)],
      ["혜택", promoBenefitText(promo)],
      ["우선순위", String(promo.priority)],
      ["프로모션 ID", promo.id, true],
    ]),
    sections:
      promo.audience === "TARGETED"
        ? [
            {
              title: `지정 학원 ${targets.length.toLocaleString("ko-KR")}곳`,
              columns: [
                { key: "name", label: "학원" },
                { key: "id", label: "학원 ID" },
              ],
              rows: targets.map((id) => ({
                name: academyNameById.get(id) ?? "(알 수 없음)",
                id,
              })),
              emptyText: "지정 학원 없음 — 링크로만 적용됩니다.",
            },
          ]
        : undefined,
  };
}

export function bundleCardDetail(bundle: AdminBundleView): AdminDetail {
  const running = bundle.items.filter((i) => i.isInWindow).length;
  return {
    title: bundle.name,
    subtitle: `/b/${bundle.slug} · ${bundle.isActive ? "활성" : "비활성"}`,
    fields: detailFields([
      ["상태", bundle.isActive ? `활성 · 진행 중 ${running}개` : "비활성"],
      ["포함 프로모션", `${bundle.items.length.toLocaleString("ko-KR")}개`],
      ["설명", bundle.description, true],
      ["생성", dt(bundle.createdAt)],
      ["수정", dt(bundle.updatedAt)],
    ]),
    sections: [
      {
        title: "포함 프로모션",
        columns: [
          { key: "product", label: "상품" },
          { key: "name", label: "프로모션" },
          { key: "benefit", label: "혜택" },
          { key: "window", label: "기간", wide: true },
          { key: "status", label: "상태" },
        ],
        rows: [...bundle.items]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((i) => ({
            product: i.productName,
            name: i.promotionName?.trim() || "이름 없음",
            benefit: promoBenefitText(i),
            window: `${formatDateTime(i.startsAt)} ~ ${formatDateTime(i.endsAt)}`,
            status: promoStatusText(i),
          })),
        emptyText: "포함된 프로모션이 없습니다.",
      },
    ],
  };
}
