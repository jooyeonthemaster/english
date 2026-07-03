import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
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

/**
 * 기능/콘텐츠 랜딩 공통 셸. 마케팅 헤더는 fixed 이므로 본문 상단 패딩을 둔다.
 * 사업자정보 푸터(GlobalBusinessFooter)는 루트 레이아웃에서 공개 경로에 자동 렌더된다.
 */
export function FeaturePageShell({ content }: { content: FeaturePageContent }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <MarketingHeader />

      <main className="pt-20">
        {/* HERO */}
        <section className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
          <div className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8 sm:py-24">
            <p className="text-[13px] font-black uppercase tracking-[0.18em] text-blue-600">
              {content.eyebrow}
            </p>
            <h1 className="mt-4 max-w-3xl text-[34px] font-black leading-[1.18] tracking-tight text-slate-950 sm:text-[48px]">
              {content.h1}
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-7 text-slate-600 sm:text-[18px]">
              {content.subhead}
            </p>

            {content.heroBullets && content.heroBullets.length > 0 && (
              <ul className="mt-7 grid max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
                {content.heroBullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2 text-[14px] font-semibold text-slate-700"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-blue-600" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-blue-600 px-6 text-[15px] font-black text-white shadow-[0_18px_44px_-22px_rgba(37,99,235,0.9)] transition hover:-translate-y-0.5 hover:bg-blue-700"
              >
                시작하기
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/credits/products"
                className="inline-flex h-12 items-center rounded-full border border-slate-200 px-6 text-[15px] font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                상품·요금 보기
              </Link>
            </div>
          </div>
        </section>

        {/* SECTIONS */}
        <section className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid grid-cols-1 gap-5">
            {content.sections.map((section) => (
              <article
                key={section.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
              >
                <h2 className="text-[22px] font-black tracking-tight text-slate-950 sm:text-[26px]">
                  {section.title}
                </h2>
                <p className="mt-3 max-w-3xl text-[15px] leading-7 text-slate-600">
                  {section.body}
                </p>
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {section.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-[14px] font-medium text-slate-700"
                      >
                        <Check className="mt-0.5 size-4 shrink-0 text-blue-600" />
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
          <section className="border-t border-slate-100 bg-slate-50">
            <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-8">
              <h2 className="text-[20px] font-black tracking-tight text-slate-950">
                함께 보면 좋은 기능
              </h2>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {content.related.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-200 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-black text-slate-950 group-hover:text-blue-700">
                        {link.label}
                      </span>
                      <ArrowRight className="size-4 text-slate-300 transition group-hover:text-blue-600" />
                    </div>
                    {link.description && (
                      <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
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
          <section className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8 sm:py-20">
            <h2 className="text-[24px] font-black tracking-tight text-slate-950 sm:text-[30px]">
              자주 묻는 질문
            </h2>
            <div className="mt-7 divide-y divide-slate-100 border-y border-slate-100">
              {content.faq.map((item) => (
                <div key={item.question} className="py-5">
                  <h3 className="text-[16px] font-black text-slate-900">
                    {item.question}
                  </h3>
                  <p className="mt-2 max-w-3xl text-[14px] leading-7 text-slate-600">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="border-t border-slate-100 bg-gradient-to-br from-[#0B1B3F] via-[#11296B] to-[#1D4ED8]">
          <div className="mx-auto max-w-[1100px] px-5 py-16 text-center sm:px-8 sm:py-20">
            <h2 className="text-[26px] font-black tracking-tight text-white sm:text-[34px]">
              {content.ctaTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-7 text-blue-100">
              {content.ctaBody}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-[15px] font-black text-blue-700 shadow-lg transition hover:-translate-y-0.5"
              >
                시작하기
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/credits/products"
                className="inline-flex h-12 items-center rounded-full border border-white/30 px-7 text-[15px] font-black text-white transition hover:bg-white/10"
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
