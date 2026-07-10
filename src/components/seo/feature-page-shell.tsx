import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { MarketingHeader } from "@/components/seo/marketing-header";

export type FeatureSection = {
  title: string;
  body: string;
  bullets?: string[];
};

export type FeatureFaqItem = { question: string; answer: string };

export type RelatedLink = {
  href: string;
  label: string;
  description?: string;
};

export type FeaturePageContent = {
  /** 작은 라벨 (예: "AI 문제 생성") */
  eyebrow: string;
  /** 핵심 키워드 헤드라인 (H1) */
  h1: string;
  /** 보조 설명 */
  subhead: string;
  heroBullets?: string[];
  sections: FeatureSection[];
  faq?: FeatureFaqItem[];
  ctaTitle: string;
  ctaBody: string;
  /** 기능 페이지 간 내부 링크 */
  related?: RelatedLink[];
};

const INK_GRID_PATTERN =
  "[background-image:linear-gradient(to_right,rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:44px_44px]";

/**
 * 기능/콘텐츠 랜딩 공통 셸(서버 컴포넌트 — 본문 전부 크롤가능 텍스트).
 *
 * 디자인: "잉크 에디토리얼" — 딥 네이비 잉크 히어로 + 챕터 numeral 섹션 리듬 +
 * 카드 hover lift + 말미 다크 CTA 밴드 (기준 구현: article-shell.tsx 의 문법을 복제).
 * 마케팅 헤더는 fixed 이므로 본문 상단 패딩을 둔다.
 * 사업자정보 푸터(GlobalBusinessFooter)는 루트 레이아웃에서 공개 경로에 자동 렌더된다.
 */
export function FeaturePageShell({ content }: { content: FeaturePageContent }) {
  return (
    // break-keep: 한국어 어절 중간 줄꺾임 방지(word-break 는 상속 — 셸 전체에 적용)
    <div className="min-h-screen break-keep bg-white text-slate-900">
      <MarketingHeader />

      <main className="pt-20">
        {/* HERO — 딥 네이비 잉크 */}
        <section className="relative overflow-hidden bg-[#070D1F]">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(70%_90%_at_85%_-15%,rgba(37,99,235,0.32),transparent_60%)]"
          />
          <div className={`absolute inset-0 ${INK_GRID_PATTERN}`} aria-hidden />
          <div className="relative mx-auto max-w-[1480px] px-5 pb-14 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-blue-300">
              <span aria-hidden className="size-1.5 rounded-full bg-blue-400" />
              {content.eyebrow}
            </p>
            <h1 className="mt-5 max-w-[1100px] text-balance text-[32px] font-black leading-[1.18] tracking-tight text-white sm:text-[44px] lg:text-[50px]">
              {content.h1}
            </h1>
            <p className="mt-6 max-w-[900px] text-[15.5px] leading-[1.85] text-slate-300 sm:text-[16.5px]">
              {content.subhead}
            </p>

            {content.heroBullets && content.heroBullets.length > 0 && (
              <ul className="mt-8 grid max-w-[1200px] grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                {content.heroBullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[13.5px] font-semibold leading-6 text-slate-200"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-blue-500/15"
                    >
                      <Check className="size-3.5 text-blue-300" />
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full bg-white px-7 text-[15px] font-extrabold text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50"
              >
                시작하기
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/credits/products"
                className="inline-flex h-12 items-center whitespace-nowrap rounded-full border border-white/25 px-7 text-[15px] font-extrabold text-white transition hover:border-white/50 hover:bg-white/10"
              >
                상품·요금 보기
              </Link>
            </div>
          </div>
        </section>

        {/* SECTIONS — 챕터 numeral 조판 */}
        <section className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8 sm:py-20">
          <div className="max-w-[1050px]">
            {content.sections.map((section, i) => (
              <article
                key={section.title}
                className="mt-14 border-t border-slate-200 pt-10 first:mt-0 first:border-t-0 first:pt-0"
              >
                <div className="flex items-start gap-4 sm:gap-5">
                  <span
                    aria-hidden
                    className="select-none text-[40px] font-black leading-[0.9] tracking-tight text-slate-200 tabular-nums sm:text-[52px]"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="pt-1 text-[21px] font-black leading-[1.3] tracking-tight text-slate-950 sm:pt-2 sm:text-[25px]">
                    {section.title}
                  </h2>
                </div>
                <p className="mt-6 max-w-[900px] text-[15.5px] leading-[1.9] text-slate-700 sm:text-[16px]">
                  {section.body}
                </p>
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {section.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5 text-[14px] leading-6 text-slate-700"
                      >
                        <span
                          aria-hidden
                          className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-blue-600/10"
                        >
                          <Check className="size-3.5 text-blue-700" />
                        </span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* RELATED (internal links) */}
        {content.related && content.related.length > 0 && (
          <section className="border-t border-slate-200 bg-slate-50">
            <div className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8 sm:py-16">
              <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-600">
                <span aria-hidden className="size-1.5 bg-blue-600" />
                함께 보면 좋은 기능
              </p>
              <h2 className="mt-3 text-[21px] font-black tracking-tight text-slate-950 sm:text-[24px]">
                스모트의 다른 기능도 함께 살펴보세요
              </h2>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {content.related.map((link, i) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="shrink-0 text-[11.5px] font-extrabold text-slate-400 tabular-nums transition-colors group-hover:text-blue-600">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                    </div>
                    <span className="mt-2.5 block text-[15px] font-extrabold leading-6 text-slate-950 transition-colors group-hover:text-blue-700">
                      {link.label}
                    </span>
                    {link.description && (
                      <p className="mt-1.5 text-[12.5px] leading-5 text-slate-500">
                        {link.description}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* FAQ */}
        {content.faq && content.faq.length > 0 && (
          <section className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8 sm:py-20">
            <div className="max-w-[1050px]">
              <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-600">
                <span aria-hidden className="size-1.5 bg-blue-600" />
                FAQ
              </p>
              <h2 className="mt-3 text-[21px] font-black tracking-tight text-slate-950 sm:text-[25px]">
                자주 묻는 질문
              </h2>
              <div className="mt-6 space-y-3">
                {content.faq.map((item) => (
                  <div
                    key={item.question}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-5 sm:px-6"
                  >
                    <h3 className="flex items-start gap-3 text-[15px] font-extrabold leading-6 text-slate-950">
                      <span
                        aria-hidden
                        className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-slate-950 text-[12px] font-black text-white"
                      >
                        Q
                      </span>
                      {item.question}
                    </h3>
                    <p className="mt-2.5 pl-9 text-[14px] leading-7 text-slate-600">
                      {item.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* FINAL CTA — 다크 잉크 밴드 */}
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
            <h2 className="mt-4 text-[26px] font-black leading-[1.25] tracking-tight text-white sm:text-[32px]">
              {content.ctaTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[14.5px] leading-[1.85] text-slate-300">
              {content.ctaBody}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full bg-white px-7 text-[15px] font-extrabold text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50"
              >
                시작하기
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/credits/products"
                className="inline-flex h-12 items-center whitespace-nowrap rounded-full border border-white/25 px-7 text-[15px] font-extrabold text-white transition hover:border-white/50 hover:bg-white/10"
              >
                상품·요금 보기
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
