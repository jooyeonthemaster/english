import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { MarketingHeader } from "@/components/seo/marketing-header";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo/structured-data";
import {
  articlesByCategory,
  articlePath,
  CONTENT_HUBS,
  type ArticleCategory,
} from "@/lib/seo/articles-content";

/**
 * 콘텐츠 허브 인덱스 공통 셸(서버 컴포넌트 — 전 텍스트 크롤가능).
 *
 * 디자인: "잉크 에디토리얼" — 딥 네이비 히어로(실데이터 메타 카운트) +
 * 대형 피처드 카드 + tabular 순번·eyebrow 칩·화살표 마이크로모션 카드 그리드 +
 * 교차 허브 내부링크 + 말미 다크 CTA 밴드.
 * 히어로/그리드/CTA 블록은 /guides 인덱스가 그대로 재사용한다(단일 시각 언어).
 */

const INK_GRID_PATTERN =
  "[background-image:linear-gradient(to_right,rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:44px_44px]";

const CARD_HOVER =
  "transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)]";

export type HubCard = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
};

export type HubHeroMetaItem = {
  /** 앞쪽 라벨(슬레이트). */
  label: string;
  /** 강조 값(화이트) — 실데이터 카운트 등. */
  value: string;
};

/** 딥 네이비 잉크 히어로 — kicker·H1·lede + 하단 실데이터 메타 라인. */
export function HubHero({
  crumbLabel,
  kicker,
  headline,
  lede,
  metaItems,
}: {
  crumbLabel: string;
  kicker: string;
  headline: string;
  lede: string;
  metaItems: HubHeroMetaItem[];
}) {
  return (
    <section className="relative overflow-hidden bg-[#070D1F]">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(70%_90%_at_85%_-15%,rgba(37,99,235,0.32),transparent_60%)]"
      />
      <div className={`absolute inset-0 ${INK_GRID_PATTERN}`} aria-hidden />
      <div className="relative mx-auto max-w-[1480px] px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-16">
        <nav
          aria-label="breadcrumb"
          className="flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-slate-400"
        >
          <Link href="/" className="whitespace-nowrap transition hover:text-white">
            스모트
          </Link>
          <span aria-hidden>›</span>
          <span className="whitespace-nowrap text-slate-400">{crumbLabel}</span>
        </nav>

        <div className="mt-8 max-w-[1080px]">
          <p className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-blue-300">
            <span aria-hidden className="size-1.5 rounded-full bg-blue-400" />
            <span className="whitespace-nowrap">{kicker}</span>
          </p>
          <h1 className="mt-5 break-keep text-balance text-[30px] font-black leading-[1.2] tracking-tight text-white [overflow-wrap:anywhere] sm:text-[42px] lg:text-[48px]">
            {headline}
          </h1>
          <p className="mt-5 max-w-[900px] break-keep text-[15px] leading-[1.85] text-slate-300 [overflow-wrap:anywhere] sm:text-[16.5px]">
            {lede}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-[12.5px] font-bold text-slate-400">
            {metaItems.map((m, i) => (
              <Fragment key={`${m.label}-${m.value}`}>
                {i > 0 && (
                  <span
                    aria-hidden
                    className="hidden size-1 rounded-full bg-slate-600 sm:block"
                  />
                )}
                <span className="whitespace-nowrap">
                  {m.label} <span className="text-white">{m.value}</span>
                </span>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** 대형 피처드 카드 — 헤어라인 numeral 워터마크 + 이중 칩 + 확대 타이포. */
function FeaturedCard({ card, badge }: { card: HubCard; badge: string }) {
  return (
    <Link
      href={card.href}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.5)] sm:p-9 ${CARD_HOVER}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-6 right-3 select-none text-[110px] font-black leading-none tracking-tighter text-slate-100 tabular-nums sm:-top-8 sm:text-[160px]"
      >
        01
      </span>
      <div className="relative max-w-[1050px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-slate-950 px-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-white">
            {badge}
          </span>
          <span className="inline-flex h-6 min-w-0 max-w-full items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-blue-700">
            <span className="truncate">{card.eyebrow}</span>
          </span>
        </div>
        <span className="mt-4 block break-keep text-[21px] font-black leading-[1.32] tracking-tight text-slate-950 transition-colors [overflow-wrap:anywhere] group-hover:text-blue-700 sm:text-[26px]">
          {card.title}
        </span>
        <p className="mt-3 line-clamp-3 text-[14px] leading-7 text-slate-600 sm:text-[14.5px]">
          {card.description}
        </p>
        <span className="mt-6 inline-flex items-center gap-1.5 whitespace-nowrap text-[13.5px] font-extrabold text-blue-600">
          자세히 보기
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

/** 일반 인덱스 카드 — tabular 순번 + eyebrow 칩 + 하단 화살표 마이크로모션. */
function IndexCard({ card, order }: { card: HubCard; order: number }) {
  return (
    <Link
      href={card.href}
      className={`group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 ${CARD_HOVER}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden
          className="select-none text-[22px] font-black leading-none tracking-tight text-slate-200 tabular-nums transition-colors group-hover:text-blue-300"
        >
          {String(order).padStart(2, "0")}
        </span>
        <span className="inline-flex h-6 min-w-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-slate-500 transition-colors group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-700">
          <span className="truncate">{card.eyebrow}</span>
        </span>
      </div>
      <span className="mt-4 break-keep text-[16px] font-black leading-[1.45] text-slate-950 transition-colors [overflow-wrap:anywhere] group-hover:text-blue-700 sm:text-[16.5px]">
        {card.title}
      </span>
      {/* line-clamp 는 flex-1 스트레치와 충돌(4번째 줄 누출) — 여분 높이는 푸터 행의 mt-auto 가 흡수 */}
      <p className="mb-5 mt-2.5 line-clamp-3 text-[13px] leading-6 text-slate-500">
        {card.description}
      </p>
      <span className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="whitespace-nowrap text-[12.5px] font-extrabold text-blue-600">
          자세히 보기
        </span>
        <ArrowRight className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" />
      </span>
    </Link>
  );
}

/** 피처드 1장 + 순번 그리드. 슬레이트 밴드 위 화이트 카드로 위계를 분리한다. */
export function HubCardGrid({
  cards,
  kicker = "전체 콘텐츠",
  featuredBadge = "대표 콘텐츠",
  emptyText = "콘텐츠를 준비 중입니다.",
  countUnit = "편",
}: {
  cards: HubCard[];
  kicker?: string;
  featuredBadge?: string;
  emptyText?: string;
  countUnit?: string;
}) {
  const [featured, ...rest] = cards;
  return (
    <section className="border-b border-slate-200/70 bg-slate-50/70">
      <div className="mx-auto max-w-[1480px] px-5 py-12 sm:px-8 sm:py-16">
        {cards.length === 0 ? (
          <p className="text-[15px] text-slate-500">{emptyText}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
                <span aria-hidden className="size-1.5 bg-blue-600" />
                <span className="whitespace-nowrap">{kicker}</span>
              </h2>
              <span className="whitespace-nowrap text-[12px] font-bold tabular-nums text-slate-400">
                총 {cards.length}
                {countUnit}
              </span>
            </div>

            <div className="mt-5">
              <FeaturedCard card={featured} badge={featuredBadge} />
              {rest.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {rest.map((card, i) => (
                    <IndexCard key={card.href} card={card} order={i + 2} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** 교차 허브 내부링크 스트립 — 현재 허브를 제외한 나머지 라이브러리로 순환. */
export function HubCrossLinks({ exclude }: { exclude?: ArticleCategory }) {
  const hubs = (Object.keys(CONTENT_HUBS) as ArticleCategory[]).filter(
    (key) => key !== exclude,
  );
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1480px] px-5 py-12 sm:px-8 sm:py-14">
        <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
          <span aria-hidden className="size-1.5 bg-blue-600" />
          <span className="whitespace-nowrap">다른 콘텐츠 라이브러리</span>
        </p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {hubs.map((key) => {
            const hub = CONTENT_HUBS[key];
            return (
              <Link
                key={hub.path}
                href={hub.path}
                className={`group rounded-2xl border border-slate-200 bg-white p-5 ${CARD_HOVER}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="whitespace-nowrap text-[14.5px] font-extrabold leading-6 text-slate-950 transition-colors group-hover:text-blue-700">
                    {hub.label}
                  </span>
                  <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                </div>
                <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 text-slate-500">
                  {hub.description}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** 말미 다크 CTA 밴드 — primary /register · secondary /features/ai-question-generation. */
export function HubCtaBand({
  title = "읽은 출제 원리 그대로, 1분 안에 문제가 됩니다",
  body = "지문만 붙여넣으면 스모트 AI가 방금 읽은 설계 원리 그대로 수능·내신 전 유형을 출제합니다. 지금 무료로 시작해 보시기 바랍니다.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-[#070D1F]">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(60%_100%_at_50%_120%,rgba(37,99,235,0.4),transparent_65%)]"
      />
      <div className={`absolute inset-0 ${INK_GRID_PATTERN}`} aria-hidden />
      <div className="relative mx-auto max-w-[1000px] px-5 py-16 text-center sm:px-8 sm:py-20">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-blue-300">
          SMOAT — English AI Workbench
        </p>
        <h2 className="mt-4 break-keep text-[24px] font-black leading-[1.3] tracking-tight text-white [overflow-wrap:anywhere] sm:text-[30px]">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl break-keep text-[14.5px] leading-[1.85] text-slate-300 [overflow-wrap:anywhere]">
          {body}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full bg-white px-7 text-[15px] font-extrabold text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50"
          >
            무료로 시작하기
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/features/ai-question-generation"
            className="inline-flex h-12 items-center whitespace-nowrap rounded-full border border-white/25 px-7 text-[15px] font-extrabold text-white transition hover:border-white/50 hover:bg-white/10"
          >
            AI 문제 생성 살펴보기
          </Link>
        </div>
      </div>
    </section>
  );
}

/** 카테고리 허브 인덱스 공통 셸. 해당 카테고리 아티클을 전부 나열한다. */
export function HubIndexShell({
  category,
  headline,
  lede,
}: {
  category: ArticleCategory;
  /** H1 (기본: 허브 title). */
  headline?: string;
  /** 도입 문단(기본: 허브 description). */
  lede?: string;
}) {
  const hub = CONTENT_HUBS[category];
  const articles = articlesByCategory(category);

  const cards: HubCard[] = articles.map((a) => ({
    href: articlePath(a),
    eyebrow: a.eyebrow,
    title: a.h1,
    description: a.metaDescription,
  }));

  const latestUpdatedAt = articles.reduce(
    (max, a) => (a.updatedAt > max ? a.updatedAt : max),
    "",
  );

  const metaItems: HubHeroMetaItem[] = [
    { label: "아티클", value: `${articles.length}편` },
    ...(latestUpdatedAt
      ? [
          {
            label: "최근 업데이트",
            value: latestUpdatedAt.replaceAll("-", "."),
          },
        ]
      : []),
    { label: "전체", value: "무료 열람" },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <MarketingHeader />
      <JsonLd
        id={`ld-hub-${category}`}
        data={breadcrumbSchema([
          { name: "스모트 SMOAT", url: "/" },
          { name: hub.label, url: hub.path },
        ])}
      />
      <main className="pt-20">
        <HubHero
          crumbLabel={hub.label}
          kicker={hub.label}
          headline={headline ?? hub.title}
          lede={lede ?? hub.description}
          metaItems={metaItems}
        />
        <HubCardGrid cards={cards} featuredBadge="대표 아티클" />
        <HubCrossLinks exclude={category} />
        <HubCtaBand />
      </main>
    </div>
  );
}
