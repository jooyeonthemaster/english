import type { Metadata } from "next";
import Link from "next/link";
import {
  CREDIT_COSTS,
  OPERATION_LABELS,
  type OperationType,
} from "@/lib/credit-costs";
import { getCreditTopUpProducts } from "@/lib/credit-top-up-products";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { BUSINESS_INFO } from "@/lib/legal/business-info";
import {
  CREDIT_TOP_UP_CARD_ONLY,
  CREDIT_TOP_UP_COMPLETION_TEXT,
} from "@/lib/legal/payment-processor";
import { prisma } from "@/lib/prisma";
import { getPlanPricingPreview } from "@/lib/subscription-plan-pricing";

export const dynamic = "force-dynamic";

const SUBSCRIPTION_BILLING_ENABLED = FEATURE_FLAGS.SHOW_SUBSCRIPTION_BILLING;
const BANK_DEPOSIT_ENABLED =
  process.env.NEXT_PUBLIC_BANK_DEPOSIT_ENABLED === "true";

export const metadata: Metadata = {
  title: SUBSCRIPTION_BILLING_ENABLED
    ? "크레딧 및 구독 환불 정책"
    : "크레딧 환불 정책",
  alternates: { canonical: "/refund-policy" },
  description: SUBSCRIPTION_BILLING_ENABLED
    ? "SMOAT 크레딧과 구독 요금제의 구매, 사용, 청약철회, 환불 기준을 안내합니다."
    : "SMOAT 크레딧의 구매, 사용, 청약철회, 환불 기준을 안내합니다.",
};

const UPDATED_AT = "2026년 6월 9일";

const POLICY_SECTIONS = [
  {
    title: "1. 크레딧의 성격",
    body: [
      "SMOAT 크레딧은 SMOAT 서비스 내부의 AI 기능을 이용하기 위한 디지털 서비스 이용권입니다.",
      "크레딧은 현금, 전자화폐, 선불전자지급수단 또는 외부 결제수단이 아니며, 현금 환전, 양도, 판매, 담보 제공, 제3자 상품·서비스 결제에 사용할 수 없습니다.",
      "무료 지급, 이벤트, 보너스, 관리자 보정 등 대가 없이 지급된 크레딧은 유상 구매 크레딧과 구분되며 환불 대상에 포함되지 않습니다.",
    ],
  },
  {
    title: "2. 지급 및 사용",
    body: [
      `${CREDIT_TOP_UP_COMPLETION_TEXT} 크레딧이 지급됩니다.`,
      ...(!CREDIT_TOP_UP_CARD_ONLY
        ? [
            "가상계좌 결제는 계좌 발급 시점이 아니라 실제 입금 완료 및 결제 상태 확인 후 크레딧이 지급됩니다.",
          ]
        : []),
      ...(BANK_DEPOSIT_ENABLED
        ? [
            "무통장입금(계좌이체)은 회원이 회사가 지정한 계좌로 입금하고, 회사가 입금자명과 입금 금액을 대조하여 입금이 확인된 후 크레딧이 지급됩니다. 입금 전에는 크레딧이 지급되지 않습니다.",
          ]
        : []),
      "크레딧은 사용자가 AI 기능 실행을 요청하여 결과 생성, 분석, 추출, 수정 등의 디지털 서비스 제공이 시작될 때 기능별 단가에 따라 차감됩니다.",
      "구매 상품, 결제금액, 프로모션 할인 여부에 따라 1C당 원화 구매 단가는 달라질 수 있으나, 동일한 AI 기능 실행 시 차감되는 크레딧 수는 동일하게 적용됩니다.",
    ],
  },
  ...(SUBSCRIPTION_BILLING_ENABLED
    ? [
        {
          title: "3. 구독 요금제 결제 및 30일 갱신",
          body: [
            "구독 요금제는 결제 승인일 또는 회사가 별도로 승인한 이용 개시일을 기준으로 30일 이용 기간이 시작됩니다.",
            "신용카드 정기결제를 등록한 경우 회원의 동의 후 포트원이 발급한 빌링키로 30일마다 다음 이용 기간의 요금이 자동 청구됩니다.",
            "회사는 카드번호, 유효기간, CVC 등 신용카드 원문 정보를 직접 저장하지 않으며, 카드 등록·결제·삭제 처리는 포트원 및 PG사의 보안 기준에 따라 진행됩니다.",
            "월 배정 크레딧은 각 30일 이용 기간 단위로 제공되며, 요금제의 이월 정책이 명시된 경우를 제외하고 갱신 시 미사용 월 배정 크레딧은 초기화될 수 있습니다.",
            "회원이 다음 갱신을 원하지 않는 경우 갱신일 전에 자동갱신을 해지해야 하며, 해지 시 예약된 다음 결제는 취소되고 현재 이용 기간은 종료일까지 유지됩니다.",
            "이미 시작된 이용 기간의 환불은 본 정책의 환불 가능 기준에 따라 판단합니다.",
          ],
        },
      ]
    : []),
  {
    title: `${SUBSCRIPTION_BILLING_ENABLED ? "4" : "3"}. 청약철회 및 환불 가능 기준`,
    body: [
      "결제일로부터 7일 이내이고 구매한 유상 크레딧을 전혀 사용하지 않은 경우 전액 환불을 요청할 수 있습니다.",
      "구매한 유상 크레딧을 일부 사용한 경우, 사용된 크레딧 상당액과 이미 제공된 디지털 서비스 이용분을 제외한 미사용 유상 크레딧에 한해 환불을 요청할 수 있습니다.",
      ...(SUBSCRIPTION_BILLING_ENABLED
        ? [
            "구독 요금제는 결제일로부터 7일 이내이고 해당 이용 기간의 월 배정 크레딧 또는 유료 기능을 사용하지 않은 경우 전액 환불을 요청할 수 있습니다.",
            "구독 요금제의 일부 이용 기간이 경과했거나 월 배정 크레딧을 사용한 경우, 실제 이용 기간과 사용된 크레딧 상당액을 제외한 범위에서 환불 가능 금액을 산정할 수 있습니다.",
          ]
        : []),
      "결제일로부터 7일이 지난 단순 변심 환불은 제한될 수 있으며, 관계 법령상 청약철회 또는 계약해제가 인정되는 경우에는 해당 법령을 우선 적용합니다.",
      "서비스 장애, 중복 결제, 과오금, 표시된 상품 내용과 다른 결제 등 회사의 귀책 또는 법령상 환불 사유가 있는 경우 사용 여부와 관계없이 확인 후 환불 또는 보정 처리합니다.",
    ],
  },
  {
    title: `${SUBSCRIPTION_BILLING_ENABLED ? "5" : "4"}. 환불 제한 기준`,
    body: [
      "이미 차감된 크레딧으로 AI 결과물 생성, 학습지 생성, 텍스트 추출, 문제 수정 등 디지털 서비스 제공이 완료된 사용분은 환불되지 않습니다.",
      "무상 크레딧, 이벤트 크레딧, 보너스 크레딧, 관리자 수동 지급 크레딧은 현금 환불되지 않습니다.",
      "부정 결제, 타인의 결제수단 무단 사용, 서비스 이용약관 위반, 비정상적 사용 패턴이 확인되는 경우 환불 처리가 보류되거나 제한될 수 있습니다.",
      ...(!CREDIT_TOP_UP_CARD_ONLY
        ? [
            "가상계좌는 입금 전까지 발급 계좌 말소 또는 결제 취소가 가능하며, 입금 후에는 일반 환불 기준을 따릅니다.",
          ]
        : []),
      ...(BANK_DEPOSIT_ENABLED
        ? [
            "무통장입금(계좌이체)으로 생성한 충전 주문은 입금 전(미입금) 상태에서는 크레딧이 지급되지 않으며, 안내된 입금 시간이 지나면 자동으로 만료·취소될 수 있습니다. 입금 후에는 일반 환불 기준을 따릅니다.",
          ]
        : []),
    ],
  },
  {
    title: `${SUBSCRIPTION_BILLING_ENABLED ? "6" : "5"}. 환불 금액 산정`,
    body: [
      "부분 환불 금액은 실제 결제금액을 기준으로 산정합니다.",
      "산식: 환불 가능 금액 = 실제 결제금액 × 미사용 유상 크레딧 / 구매 유상 크레딧",
      "여러 크레딧 상품의 1C당 구매 단가가 서로 다른 경우에도 환불 가능 금액은 해당 결제 건의 실제 결제금액과 미사용 유상 크레딧 비율을 기준으로 계산합니다.",
      ...(SUBSCRIPTION_BILLING_ENABLED
        ? [
            "구독 요금제의 부분 환불이 인정되는 경우 실제 결제금액, 30일 이용 기간 중 경과일, 제공 또는 사용된 월 배정 크레딧, 이미 제공된 디지털 서비스 이용분을 종합하여 산정합니다.",
          ]
        : []),
      CREDIT_TOP_UP_CARD_ONLY
        ? "카드사 및 PG사 정책, 부분취소 가능 여부, 환불 계좌 확인 필요 여부에 따라 환불 방식과 처리 기간이 달라질 수 있습니다."
        : "결제수단별 PG사 정책, 카드사 정책, 부분취소 가능 여부, 환불 계좌 확인 필요 여부에 따라 환불 방식과 처리 기간이 달라질 수 있습니다.",
    ],
  },
  {
    title: `${SUBSCRIPTION_BILLING_ENABLED ? "7" : "6"}. 환불 절차`,
    body: [
      `환불 요청은 고객센터 이메일(${BUSINESS_INFO.email}) 또는 서비스 내 문의 채널로 접수합니다.`,
      "접수 시 학원명, 요청자명, 결제일, 결제금액, 결제수단, 환불 사유를 함께 알려주시면 확인이 빠릅니다.",
      "회사는 결제 내역, 크레딧 사용 내역, 포트원·PG 결제 상태를 확인한 뒤 환불 가능 여부와 환불 예정 금액을 안내합니다.",
      CREDIT_TOP_UP_CARD_ONLY
        ? "환불 가능 건은 확인 완료 후 원 결제수단 취소를 원칙으로 처리하며, 계좌 환불이 필요한 예외적인 경우에만 예금주, 은행, 계좌번호 등 환불에 필요한 최소 정보를 요청할 수 있습니다."
        : "환불 가능 건은 확인 완료 후 원 결제수단 취소를 원칙으로 처리하며, 가상계좌·계좌이체 등 환불계좌가 필요한 경우 예금주, 은행, 계좌번호 등 환불에 필요한 최소 정보를 요청할 수 있습니다.",
      ...(BANK_DEPOSIT_ENABLED
        ? [
            "무통장입금(계좌이체)으로 결제한 건은 원 결제수단 취소가 적용되지 않으므로 환불 시 회원 명의의 환불 계좌로 처리하며, 예금주, 은행, 계좌번호 등 환불에 필요한 최소 정보를 요청할 수 있습니다.",
          ]
        : []),
    ],
  },
  {
    title: `${SUBSCRIPTION_BILLING_ENABLED ? "8" : "7"}. 분쟁 및 기타`,
    body: [
      "본 정책에서 정하지 않은 사항은 전자상거래 등에서의 소비자보호에 관한 법률, 콘텐츠산업 진흥법, 기타 관계 법령 및 PG사 정책을 따릅니다.",
      "기업·학원 단위로 별도 서면 계약을 체결한 경우, 관계 법령에 반하지 않는 범위에서 별도 계약이 우선 적용될 수 있습니다.",
      "정책 변경 시 변경일, 변경 내용, 적용일을 서비스 화면 또는 공지사항으로 안내합니다.",
    ],
  },
];

export default async function RefundPolicyPage() {
  const [products, subscriptionPlans] = await Promise.all([
    getCreditTopUpProducts(),
    SUBSCRIPTION_BILLING_ENABLED
      ? prisma.subscriptionPlan.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  const costEntries = Object.entries(CREDIT_COSTS) as [OperationType, number][];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <nav className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-[14px] font-black tracking-widest">
            SMOAT
          </Link>
          <Link
            href="/director/credits"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
          >
            크레딧 관리
          </Link>
        </nav>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-blue-600">
            Refund Policy
          </p>
          <h1 className="mt-3 text-[30px] font-black tracking-tight text-slate-950 sm:text-[40px]">
            {SUBSCRIPTION_BILLING_ENABLED
              ? "SMOAT 크레딧 및 구독 환불 정책"
              : "SMOAT 크레딧 환불 정책"}
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-slate-600">
            본 정책은 SMOAT의 유상 크레딧 구매, 디지털 서비스 이용, 청약철회
            및 환불 처리 기준을 명확히 안내하기 위한
            문서입니다. 결제 전 아래 내용을 반드시 확인해주세요.
          </p>
          <p className="mt-5 text-[12px] font-medium text-slate-400">
            최종 업데이트: {UPDATED_AT}
          </p>
        </section>

        {SUBSCRIPTION_BILLING_ENABLED && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-[16px] font-bold text-slate-900">
              월 구독 요금제
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-slate-400">
              아래 금액은 30일 기준입니다. 신용카드 정기결제 등록 시 동일 주기로
              자동 청구됩니다.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {subscriptionPlans.map((plan) => {
                const pricing = getPlanPricingPreview(plan);
                return (
                  <div
                    key={plan.id}
                    className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4"
                  >
                    <div className="text-[14px] font-bold text-slate-900">
                      {plan.name}
                    </div>
                    <div className="mt-1 text-[12px] text-slate-400">
                      {plan.monthlyCredits.toLocaleString("ko-KR")}C · 30일
                    </div>
                    <div className="mt-3 text-[18px] font-black tabular-nums text-emerald-700">
                      {pricing.finalPrice.toLocaleString("ko-KR")}원
                    </div>
                    {pricing.discountAmount > 0 && (
                      <div className="mt-1 text-[11px] font-medium tabular-nums text-slate-400 line-through">
                        {pricing.originalPrice.toLocaleString("ko-KR")}원
                      </div>
                    )}
                  </div>
                );
              })}
              {subscriptionPlans.length === 0 && (
                <div className="col-span-full py-6 text-[13px] text-slate-400">
                  현재 노출 중인 구독 요금제가 없습니다.
                </div>
              )}
            </div>
          </section>
        )}

        <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-[16px] font-bold text-slate-900">
              유상 크레딧 상품
            </h2>
            <div className="mt-4 divide-y divide-slate-100">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <div className="text-[14px] font-bold text-slate-900">
                      {product.name}
                    </div>
                    <div className="text-[12px] text-slate-400">
                      {product.creditAmount.toLocaleString("ko-KR")}C ·{" "}
                      자동출제 약{" "}
                      {product.estimatedAutoQuestionCount.toLocaleString("ko-KR")}
                      문항 · {product.perAutoQuestion.toLocaleString("ko-KR")}
                      원/문항
                    </div>
                    {product.isPromotionActive && (
                      <div className="mt-1 text-[11px] font-semibold text-emerald-700">
                        {product.promotionName || "프로모션"}{" "}
                        {product.discountRate}% 할인 적용 중
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[14px] font-black tabular-nums text-blue-700">
                      {product.price.toLocaleString("ko-KR")}원
                    </div>
                    {product.isPromotionActive && (
                      <div className="mt-1 text-[11px] font-medium tabular-nums text-slate-400 line-through">
                        {product.basePrice.toLocaleString("ko-KR")}원
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {products.length === 0 && (
                <div className="py-6 text-[13px] text-slate-400">
                  현재 노출 중인 크레딧 상품이 없습니다.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-[16px] font-bold text-slate-900">
              주요 기능별 차감 기준
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-slate-400">
              아래 기준은 구매한 크레딧 상품의 원화 단가와 관계없이 동일하게
              적용됩니다.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {costEntries.map(([key, cost]) => (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="truncate pr-3 text-[12px] font-medium text-slate-600">
                    {OPERATION_LABELS[key]}
                  </span>
                  <span className="shrink-0 text-[12px] font-black tabular-nums text-slate-900">
                    {cost}C
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5 space-y-4">
          {POLICY_SECTIONS.map((section) => (
            <article
              key={section.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <h2 className="text-[17px] font-bold text-slate-950">
                {section.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {section.body.map((line) => (
                  <li
                    key={line}
                    className="flex gap-2 text-[14px] leading-7 text-slate-600"
                  >
                    <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-[13px] leading-6 text-blue-900">
          <h2 className="font-bold">구매 전 확인</h2>
          <p className="mt-2">
            SMOAT 크레딧은 배송이 없는 디지털 서비스 이용권입니다. 결제 완료 후
            지급된 크레딧을 사용하여 AI 기능을 실행하면 해당 사용분은 서비스
            제공이 시작되거나 완료된 것으로 보며, 미사용 유상 크레딧에 한해
            환불 기준이 적용됩니다.
          </p>
        </section>

      </div>
    </main>
  );
}
