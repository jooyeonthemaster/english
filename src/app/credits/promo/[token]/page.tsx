import Link from "next/link";
import { headers } from "next/headers";
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
import { getPromoLandingProduct } from "@/lib/credit-top-up-products";
import { isValidPromoToken } from "@/lib/promo-link";
import {
  recordPromoLinkEvent,
  readClientHints,
} from "@/lib/promo-link-events";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-5 py-10">
      <div className="w-full max-w-[420px]">
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

function formatEnds(endsAt: string | null): string {
  if (!endsAt) return "";
  return new Date(endsAt).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PromoLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = isValidPromoToken(token)
    ? await getPromoLandingProduct(token)
    : null;
  const staff = await getStaffSession();
  const isDirector = staff?.role === "DIRECTOR";

  // 랜딩 방문(VIEW) 기록 — 유효한 프로모션에 한해. 실패해도 흐름을 막지 않음.
  if (data?.valid) {
    const { ip, userAgent } = readClientHints(await headers());
    await recordPromoLinkEvent({
      kind: "VIEW",
      targetType: "PROMO",
      linkRef: token,
      promotionId: data.promotionId,
      staff,
      ip,
      userAgent,
    });
  }

  // 만료·무효·없음 → 안내 후 기본 크레딧 페이지로.
  if (!data || !data.valid) {
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
            이 프로모션 링크는 만료되었거나 더 이상 유효하지 않습니다. 기본 크레딧
            관리 페이지에서 이용 가능한 상품을 확인하세요.
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

  const p = data.product;
  const remaining = dDay(data.endsAt);
  const hasDiscount = p.discountRate > 0 && p.price < p.basePrice;
  const hasBonus = p.bonusCredits > 0;

  return (
    <Shell>
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-6 py-5 text-white">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-100">
            <Sparkles className="size-3.5" strokeWidth={2.4} />
            {data.promotionName || "특별 프로모션"}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[20px] font-bold">{p.name}</span>
            <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[13px] font-bold tabular-nums">
              {p.grantedCreditAmount.toLocaleString("ko-KR")}C
            </span>
          </div>
          {remaining !== null && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-semibold">
              <CalendarClock className="size-3.5" strokeWidth={2.2} />
              {remaining === 0 ? "오늘 마감" : `마감까지 D-${remaining}`}
            </div>
          )}
        </div>

        {/* Benefit */}
        <div className="space-y-3 px-6 py-5">
          {hasBonus && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-3">
              <Coins className="size-5 shrink-0 text-emerald-600" strokeWidth={2} />
              <div className="text-[13px] leading-5 text-emerald-800">
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
            <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3">
              <Flame className="size-5 shrink-0 text-rose-500" strokeWidth={2} />
              <div className="text-[13px] leading-5 text-rose-700">
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

          {/* Price summary */}
          <div className="flex items-end justify-between border-t border-slate-100 pt-3">
            <span className="text-[12px] text-slate-400">결제 금액</span>
            <span className="text-[22px] font-bold tabular-nums text-slate-900">
              {p.price.toLocaleString("ko-KR")}원
            </span>
          </div>

          {/* CTA */}
          <Link
            href={`/credits/promo/${token}/claim`}
            className="mt-1 inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-[15px] font-bold text-white transition hover:bg-blue-700"
          >
            {isDirector ? "혜택 받고 충전하러 가기" : "가입(로그인)하고 혜택 받기"}
            <ArrowRight className="size-4" strokeWidth={2.4} />
          </Link>
          <p className="text-center text-[11.5px] leading-4 text-slate-400">
            {isDirector
              ? "크레딧 관리 페이지에서 이 혜택가로 바로 충전할 수 있어요."
              : "로그인·가입 후 크레딧 관리 페이지에서 자동으로 혜택이 적용됩니다."}
            {data.endsAt && ` · ${formatEnds(data.endsAt)}까지`}
          </p>
        </div>
      </div>
    </Shell>
  );
}
