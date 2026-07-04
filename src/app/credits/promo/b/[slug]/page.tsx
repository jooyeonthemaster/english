import Link from "next/link";
import {
  Sparkles,
  Coins,
  Flame,
  CalendarClock,
  ArrowRight,
  CircleSlash,
} from "lucide-react";
import { BrandIcon } from "@/components/brand/brand-mark";
import { getStaffSession } from "@/lib/auth";
import {
  getPromoBundleLanding,
  type PromoBundleLandingItem,
} from "@/lib/credit-promotion-bundles";

// ============================================================================
// 프로모션 번들 랜딩 — /credits/promo/b/{slug}
//   단일 프로모션 랜딩(/credits/promo/{token})과 같은 디자인으로, 번들에 담긴
//   유효(활성+기간 내) 프로모션을 카드로 나열하고 CTA 하나로 한꺼번에 받는다.
// ============================================================================

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-5 py-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-5 flex items-center justify-center gap-2">
          <BrandIcon className="size-8 bg-blue-600 shadow-none" markClassName="size-[20px]" />
          <span className="text-[18px] font-bold tracking-tight text-slate-900">
            SMOAT
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}

function dDay(endsAt: string | null): number | null {
  if (!endsAt) return null;
  const diff = new Date(endsAt).getTime() - Date.now();
  return diff <= 0 ? 0 : Math.ceil(diff / 86_400_000);
}

/** 번들 구성원 프로모션 카드 — 단일 랜딩의 혜택 카드 디자인 재사용. */
function BundleItemCard({ item }: { item: PromoBundleLandingItem }) {
  const p = item.product;
  const remaining = dDay(item.endsAt);
  const hasDiscount = p.discountRate > 0 && p.price < p.basePrice;
  const hasBonus = p.bonusCredits > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-blue-600">
            <Sparkles className="size-3.5" strokeWidth={2.4} />
            {item.promotionName || "특별 프로모션"}
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="truncate text-[16px] font-bold text-slate-900">
              {p.name}
            </span>
            <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[12px] font-bold tabular-nums text-blue-700">
              {p.grantedCreditAmount.toLocaleString("ko-KR")}C
            </span>
          </div>
        </div>
        {remaining !== null && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
            <CalendarClock className="size-3.5" strokeWidth={2.2} />
            {remaining === 0 ? "오늘 마감" : `D-${remaining}`}
          </span>
        )}
      </div>

      <div className="space-y-2 px-5 py-4">
        {hasBonus && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
            <Coins className="size-4.5 shrink-0 text-emerald-600" strokeWidth={2} />
            <div className="text-[12.5px] leading-5 text-emerald-800">
              크레딧 보너스{" "}
              <span className="font-bold">
                +{p.bonusCredits.toLocaleString("ko-KR")}C
              </span>{" "}
              — 총{" "}
              <span className="font-bold">
                {p.grantedCreditAmount.toLocaleString("ko-KR")}C
              </span>{" "}
              지급
            </div>
          </div>
        )}

        {hasDiscount && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5">
            <Flame className="size-4.5 shrink-0 text-rose-500" strokeWidth={2} />
            <div className="text-[12.5px] leading-5 text-rose-700">
              <span className="font-bold">{p.discountRate}% 할인</span> —{" "}
              <span className="text-slate-400 line-through">
                {p.basePrice.toLocaleString("ko-KR")}원
              </span>{" "}
              <span className="font-bold text-slate-900">
                {p.price.toLocaleString("ko-KR")}원
              </span>
            </div>
          </div>
        )}

        <div className="flex items-end justify-between border-t border-slate-100 pt-2.5">
          <span className="text-[11.5px] text-slate-400">결제 금액</span>
          <span className="text-[18px] font-bold tabular-nums text-slate-900">
            {p.price.toLocaleString("ko-KR")}원
          </span>
        </div>
      </div>
    </div>
  );
}

export default async function PromoBundleLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bundle = await getPromoBundleLanding(slug);
  const staff = await getStaffSession();
  const isDirector = staff?.role === "DIRECTOR";

  // 번들 없음/비활성/유효 프로모션 0개 → 만료 안내(단일 랜딩과 동일 UI).
  if (!bundle || bundle.items.length === 0) {
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100">
            <CircleSlash className="size-6 text-slate-400" strokeWidth={1.8} />
          </div>
          <h1 className="text-[17px] font-bold text-slate-900">
            기간이 지난 프로모션입니다
          </h1>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
            이 프로모션 링크는 만료되었거나 더 이상 유효하지 않습니다. 기본
            크레딧 관리 페이지에서 이용 가능한 상품을 확인하세요.
          </p>
          <Link
            href="/director/credits"
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 text-[14px] font-semibold text-white transition hover:bg-slate-800"
          >
            크레딧 관리로 이동
            <ArrowRight className="size-4" strokeWidth={2.2} />
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* 번들 헤더 */}
      <div className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 px-6 py-5 text-white shadow-sm">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-100">
          <Sparkles className="size-3.5" strokeWidth={2.4} />
          프로모션 패키지
        </div>
        <div className="mt-1 text-[20px] font-bold">{bundle.name}</div>
        {bundle.description && (
          <p className="mt-1 text-[12.5px] leading-5 text-blue-100">
            {bundle.description}
          </p>
        )}
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-semibold">
          혜택 {bundle.items.length}개 한 번에 받기
        </div>
      </div>

      {/* 구성원 프로모션 카드들 */}
      <div className="space-y-3">
        {bundle.items.map((item) => (
          <BundleItemCard key={item.token} item={item} />
        ))}
      </div>

      {/* CTA 하나 — 번들 claim 으로 이동 */}
      <div className="mt-4">
        <Link
          href={`/credits/promo/b/${bundle.slug}/claim`}
          className="inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-[15px] font-bold text-white transition hover:bg-blue-700"
        >
          {isDirector ? "혜택 받고 충전하러 가기" : "가입(로그인)하고 혜택 받기"}
          <ArrowRight className="size-4" strokeWidth={2.4} />
        </Link>
        <p className="mt-2 text-center text-[11.5px] leading-4 text-slate-400">
          {isDirector
            ? "크레딧 관리 페이지에서 위 혜택가로 바로 충전할 수 있어요."
            : "로그인·가입 후 크레딧 관리 페이지에서 자동으로 혜택이 적용됩니다."}
        </p>
      </div>
    </Shell>
  );
}
