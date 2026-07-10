import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingHeader } from "@/components/seo/marketing-header";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/structured-data";
import faqJson from "@/lib/seo/faq-content.json";

/** 통합 FAQ — 지식iN/카페에서 실제로 묻는 질문 표현을 그대로 문항화한다. */

type FaqGroup = {
  category: string;
  items: { question: string; answer: string }[];
};

const FAQ_GROUPS = faqJson as unknown as FaqGroup[];
const ALL_ITEMS = FAQ_GROUPS.flatMap((g) => g.items);

const INK_GRID_PATTERN =
  "[background-image:linear-gradient(to_right,rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:44px_44px]";

export const metadata: Metadata = buildMetadata({
  title: "자주 묻는 질문 — 영어 문제 생성·시험지 제작",
  description:
    "영어 변형문제 만들기, AI 문제 생성 품질, Word·한글 시험지 조판, 가격·크레딧까지 — 영어학원 선생님들이 스모트(SMOAT)에 대해 자주 묻는 질문을 모았습니다.",
  path: "/faq",
  keywords: [
    "영어 문제 생성 FAQ",
    "영어 변형문제 만들기",
    "AI 영어 문제 품질",
    "영어 시험지 제작 방법",
    "스모트 사용법",
  ],
});

export default function FaqPage() {
  return (
    <div className="min-h-screen break-keep bg-white text-slate-900">
      <MarketingHeader />
      <JsonLd
        id="ld-faq-page"
        data={[
          breadcrumbSchema([
            { name: "스모트 SMOAT", url: "/" },
            { name: "자주 묻는 질문", url: "/faq" },
          ]),
          ...(ALL_ITEMS.length > 0 ? [faqSchema(ALL_ITEMS)] : []),
        ]}
      />
      <main className="pt-20">
        {/* HERO — 딥 네이비 잉크 */}
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
              <span className="whitespace-nowrap text-slate-400">자주 묻는 질문</span>
            </nav>

            <div className="mt-8 max-w-[1000px]">
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-blue-300">
                <span aria-hidden className="size-1.5 rounded-full bg-blue-400" />
                FAQ
              </p>
              <h1 className="mt-5 text-[32px] font-black leading-[1.18] tracking-tight text-white sm:text-[44px] lg:text-[50px]">
                자주 묻는 질문
              </h1>
              <p className="mt-6 text-[16px] leading-[1.85] text-slate-300 sm:text-[17px]">
                영어 변형문제 제작, AI 문제 생성 품질, Word·한글 시험지 조판,
                가격까지 — 영어학원 선생님들이 스모트(SMOAT)에 대해 실제로 묻는
                질문과 답을 모았습니다.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-[12.5px] font-bold text-slate-400">
                <span className="whitespace-nowrap">
                  질문 <span className="text-white">{ALL_ITEMS.length}개</span>
                </span>
                <span
                  aria-hidden
                  className="hidden size-1 rounded-full bg-slate-600 sm:block"
                />
                <span className="whitespace-nowrap">
                  카테고리 <span className="text-white">{FAQ_GROUPS.length}개</span>
                </span>
                <span
                  aria-hidden
                  className="hidden size-1 rounded-full bg-slate-600 sm:block"
                />
                <span className="whitespace-nowrap">실제 검색·상담 질문 기반</span>
              </div>
            </div>
          </div>
        </section>

        {/* 카테고리 점프 칩 — 히어로 직하단, 스크롤 추적 */}
        {FAQ_GROUPS.length > 0 && (
          <nav
            aria-label="FAQ 카테고리 바로가기"
            className="sticky top-16 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl"
          >
            <div className="mx-auto max-w-[1480px] px-5 sm:px-8">
              {/* lg 미만: 스와이프 스크롤 / lg 이상: 전 칩 랩 노출(마우스 사용자는 숨은 칩에 도달 불가하므로) */}
              <div className="flex gap-2 overflow-x-auto py-3 [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-wrap lg:overflow-x-visible [&::-webkit-scrollbar]:hidden">
                {FAQ_GROUPS.map((group, i) => (
                  <a
                    key={group.category}
                    href={`#faq-cat-${i + 1}`}
                    className="group inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <span className="text-[11px] font-extrabold text-slate-400 tabular-nums transition-colors group-hover:text-blue-600">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {group.category}
                  </a>
                ))}
              </div>
            </div>
          </nav>
        )}

        {/* GROUPS — 챕터 numeral + Q 잉크 배지 카드 */}
        <section className="mx-auto max-w-[1480px] px-5 py-12 sm:px-8 sm:py-16">
          {FAQ_GROUPS.length === 0 ? (
            <p className="text-[15px] text-slate-500">콘텐츠를 준비 중입니다.</p>
          ) : (
            FAQ_GROUPS.map((group, gi) => (
              <section
                key={group.category}
                className="mt-14 border-t border-slate-200 pt-10 first:mt-0 first:border-t-0 first:pt-0"
              >
                <div className="flex items-start gap-4 sm:gap-5">
                  <span
                    aria-hidden
                    className="select-none text-[40px] font-black leading-[0.9] tracking-tight text-slate-200 tabular-nums sm:text-[52px]"
                  >
                    {String(gi + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 pt-1 sm:pt-2">
                    <h2
                      id={`faq-cat-${gi + 1}`}
                      className="scroll-mt-36 text-[21px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[25px]"
                    >
                      {group.category}
                    </h2>
                    <p className="mt-1.5 flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
                      <span aria-hidden className="size-1.5 bg-blue-600" />
                      <span className="whitespace-nowrap">
                        질문 {group.items.length}개
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-7 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {group.items.map((item) => (
                    <div
                      key={item.question}
                      className="rounded-2xl border border-slate-200 bg-white px-5 py-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)] sm:px-6"
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
              </section>
            ))
          )}
        </section>

        {/* FINAL CTA — 다크 밴드 */}
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
              읽는 것보다 만들어 보는 것이 빠릅니다
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[14.5px] leading-[1.85] text-slate-300">
              회원가입 후 지문 하나를 붙여넣으면 여기서 답한 기능을 그대로 확인할
              수 있습니다. 문제 생성부터 Word·한글 시험지 조판까지 실제 자료로
              직접 만들어 보시기 바랍니다.
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
      </main>
    </div>
  );
}
