import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  PackageX,
  Repeat2,
  ShieldCheck,
} from "lucide-react";
import {
  CREDIT_COSTS,
  OPERATION_LABELS,
  type OperationType,
} from "@/lib/credit-costs";
import { getCreditTopUpProducts } from "@/lib/credit-top-up-products";
import { prisma } from "@/lib/prisma";
import { getPlanPricingPreview } from "@/lib/subscription-plan-pricing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SMOAT 구독 및 크레딧 상품 정보 | SMOAT",
  description:
    "SMOAT 구독 요금제, 크레딧 상품 가격, 기능별 차감 크레딧, 지급 및 배송 정책을 안내합니다.",
};

export default async function CreditProductsPage() {
  const [products, subscriptionPlans] = await Promise.all([
    getCreditTopUpProducts(),
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const costEntries = Object.entries(CREDIT_COSTS) as [OperationType, number][];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <nav className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="text-[14px] font-black tracking-widest">
            SMOAT
          </Link>
          <div className="flex flex-wrap justify-end gap-3 text-[12px] font-semibold text-slate-500">
            <Link href="/terms" className="transition hover:text-slate-900">
              이용약관
            </Link>
            <Link
              href="/refund-policy"
              className="transition hover:text-slate-900"
            >
              환불 정책
            </Link>
          </div>
        </nav>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-blue-600">
            Product Information
          </p>
          <h1 className="mt-3 text-[30px] font-black tracking-tight text-slate-950 sm:text-[40px]">
            SMOAT 구독 및 크레딧
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-slate-600">
            SMOAT 구독 요금제는 30일 단위 디지털 서비스 이용권과 월 배정
            크레딧을 제공합니다. 신용카드 정기결제를 등록하면 포트원 빌링키로
            30일마다 자동 결제됩니다. 추가 크레딧 상품은 문제 생성, 자동 출제,
            지문 분석, OCR, 해설 생성 등 내부 AI 기능을 더 이용하기 위한
            디지털 이용권이며, 결제 승인 또는 가상계좌 입금 확인 후 서비스
            잔고에 즉시 지급됩니다.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ProductNotice
              icon={<Repeat2 className="size-4" strokeWidth={2} />}
              title="30일 정기결제"
              body="구독 요금제는 등록한 신용카드로 30일마다 자동 갱신됩니다."
            />
            <ProductNotice
              icon={<ShieldCheck className="size-4" strokeWidth={2} />}
              title="빌링키 방식"
              body="카드 원문 정보는 저장하지 않고 포트원 빌링키로 처리합니다."
            />
            <ProductNotice
              icon={<PackageX className="size-4" strokeWidth={2} />}
              title="배송 없음"
              body="실물 상품 배송, 배송비, 배송기간이 없는 온라인 상품입니다."
            />
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[20px] font-black tracking-tight text-slate-950">
                월 구독 요금제
              </h2>
              <p className="mt-1 text-[13px] text-slate-500">
                표시 금액은 30일 기준이며, 신용카드 정기결제 등록 시 동일
                금액으로 다음 이용 기간이 자동 갱신됩니다.
              </p>
            </div>
            <span className="text-[12px] font-semibold text-slate-400">
              VAT 포함 원화 결제
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {subscriptionPlans.map((plan) => {
              const pricing = getPlanPricingPreview(plan);
              const hasDiscount = pricing.discountAmount > 0;

              return (
                <article
                  key={plan.id}
                  className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[16px] font-black text-slate-950">
                        {plan.name}
                      </h3>
                      <p className="mt-1 text-[12px] font-medium text-slate-500">
                        {plan.monthlyCredits.toLocaleString("ko-KR")}C / 30일
                      </p>
                    </div>
                    {pricing.isPromotionActive && pricing.promotion && (
                      <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-bold text-emerald-700">
                        {pricing.promotion.discountRate}% 할인
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="text-[26px] font-black tracking-tight text-emerald-700">
                      {pricing.finalPrice.toLocaleString("ko-KR")}원
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
                      <span>30일 자동갱신</span>
                      {hasDiscount && (
                        <span className="line-through">
                          정가{" "}
                          {pricing.originalPrice.toLocaleString("ko-KR")}원
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5 text-[12px] leading-5 text-slate-600">
                    <p>학생 {plan.maxStudents.toLocaleString("ko-KR")}명</p>
                    <p>스태프 {plan.maxStaff.toLocaleString("ko-KR")}명</p>
                    <p>{plan.description ?? "SMOAT 월 구독 요금제입니다."}</p>
                  </div>
                </article>
              );
            })}

            {subscriptionPlans.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[13px] text-slate-400">
                현재 판매 중인 구독 요금제가 없습니다.
              </div>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[20px] font-black tracking-tight text-slate-950">
                크레딧 상품 및 가격
              </h2>
              <p className="mt-1 text-[13px] text-slate-500">
                표시 금액은 실제 결제 요청 및 포트원 사전등록 금액과 동일하게
                사용됩니다. 더 큰 크레딧 묶음을 구매할수록 1C당 구매 단가가
                낮아질 수 있습니다.
              </p>
            </div>
            <span className="text-[12px] font-semibold text-slate-400">
              VAT 포함 원화 결제
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {products.map((product) => (
              <article
                key={product.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[16px] font-black text-slate-950">
                      {product.name}
                    </h3>
                    <p className="mt-1 text-[12px] font-medium text-slate-500">
                      {product.creditAmount.toLocaleString("ko-KR")}C 제공
                    </p>
                  </div>
                  {product.isPromotionActive && (
                    <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                      {product.discountRate}% 할인
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  <div className="text-[26px] font-black tracking-tight text-blue-700">
                    {product.price.toLocaleString("ko-KR")}원
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
                    <span>
                      {product.perCredit.toLocaleString("ko-KR")}원/C
                    </span>
                    <span>
                      자동출제 약{" "}
                      {product.estimatedAutoQuestionCount.toLocaleString("ko-KR")}
                      문항 · {product.perAutoQuestion.toLocaleString("ko-KR")}
                      원/문항
                    </span>
                    {product.isPromotionActive && (
                      <span className="line-through">
                        정가 {product.basePrice.toLocaleString("ko-KR")}원
                      </span>
                    )}
                  </div>
                </div>

                <p className="mt-4 min-h-10 text-[12px] leading-5 text-slate-500">
                  {product.description ??
                    "SMOAT AI 기능 이용을 위한 디지털 이용권입니다."}
                </p>
              </article>
            ))}

            {products.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[13px] text-slate-400">
                현재 판매 중인 크레딧 상품이 없습니다.
              </div>
            )}
          </div>
        </section>

        <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-[20px] font-black tracking-tight text-slate-950">
              사용할 수 있는 기능
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              크레딧은 아래 AI 기능 실행 시 기능별 단가에 따라 차감됩니다.
              이 기준은 구매한 크레딧 상품, 결제금액, 프로모션 할인 여부와
              관계없이 동일합니다.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {costEntries.map(([key, cost]) => (
                <div
                  key={key}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="text-[13px] font-semibold text-slate-700">
                    {OPERATION_LABELS[key]}
                  </span>
                  <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[12px] font-black tabular-nums text-slate-950">
                    {cost}C
                  </span>
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-blue-950 shadow-sm sm:p-6">
            <h2 className="text-[18px] font-black tracking-tight">
              구매 전 확인사항
            </h2>
            <ul className="mt-4 space-y-3 text-[13px] leading-6">
              <CheckItem>
                결제 완료 후 지급된 크레딧은 SMOAT 서비스 내 디지털 기능
                실행에 사용됩니다.
              </CheckItem>
              <CheckItem>
                큰 단위로 구매하면 1C당 구매 단가는 낮아질 수 있지만, 기능별
                차감 크레딧은 동일하게 적용됩니다.
              </CheckItem>
              <CheckItem>
                배송이 없는 디지털 이용권이므로 배송지 입력, 배송비, 배송조회가
                없습니다.
              </CheckItem>
              <CheckItem>
                사용이 시작된 크레딧은 제공 완료된 디지털 서비스 이용분으로
                보며, 미사용 유상 크레딧은 환불 정책에 따라 처리됩니다.
              </CheckItem>
              <CheckItem>
                구독 정기결제는 등록한 카드의 포트원 빌링키로 처리되며, 서비스
                화면에서 다음 자동갱신을 해지할 수 있습니다.
              </CheckItem>
            </ul>
            <div className="mt-5 flex flex-wrap gap-2 text-[12px] font-bold">
              <Link
                href="/refund-policy"
                className="rounded-lg bg-white px-3 py-2 text-blue-700 shadow-sm transition hover:text-blue-900"
              >
                환불 정책 보기
              </Link>
              <Link
                href="/privacy"
                className="rounded-lg bg-white px-3 py-2 text-blue-700 shadow-sm transition hover:text-blue-900"
              >
                개인정보처리방침
              </Link>
            </div>
          </aside>
        </section>

      </div>
    </main>
  );
}

function ProductNotice({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-[13px] font-black text-slate-950">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
          {icon}
        </span>
        {title}
      </div>
      <p className="mt-2 text-[12px] leading-5 text-slate-500">{body}</p>
    </div>
  );
}

function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <CheckCircle2
        className="mt-0.5 size-4 shrink-0 text-blue-600"
        strokeWidth={2}
      />
      <span>{children}</span>
    </li>
  );
}
