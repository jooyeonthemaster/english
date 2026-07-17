import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { MarketingHeader } from "@/components/seo/marketing-header";

export type FeatureShot = {
  /** public/ 기준 절대 경로 (예: /features/shots/exam-builder/hero.png) */
  src: string;
  alt: string;
  /** 브라우저 프레임 URL 바에 표시할 캡션 (예: "시험지 편집") */
  caption?: string;
};

export type FeatureStat = {
  /** 강조 숫자 (파랑) */
  value: string;
  /** 숫자 뒤 단위 (잉크색) */
  unit?: string;
  label: string;
};

export type FeatureSection = {
  title: string;
  body: string;
  bullets?: string[];
  /** 실제 제품 캡처. 없으면 브랜드 추상 패널로 폴백 */
  image?: FeatureShot;
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
  /** 히어로 앰버 하이라이트 문구 (예: "10시간을 10분으로 줄입니다") */
  heroHighlight?: string;
  /** 히어로 목업 캡처 */
  heroImage?: FeatureShot;
  /** 목업 주변 플로팅 수치 카드 (최대 3개) */
  heroStats?: FeatureStat[];
  /** 챕터 도입부 (지그재그 섹션 위 센터 헤더) */
  sectionsTitle?: string;
  sectionsBody?: string;
  sections: FeatureSection[];
  faq?: FeatureFaqItem[];
  ctaTitle: string;
  ctaBody: string;
  /** 기능 페이지 간 내부 링크 */
  related?: RelatedLink[];
};

const INK_GRID_PATTERN =
  "[background-image:linear-gradient(to_right,rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:44px_44px]";

/** 브라우저 크롬 바 (신호등 + URL 필) */
function ShotChrome({ caption }: { caption?: string }) {
  return (
    <div className="flex h-10 items-center gap-3.5 border-b border-slate-200 bg-white px-4">
      <span aria-hidden className="flex gap-[7px]">
        <i className="size-[11px] rounded-full bg-slate-200" />
        <i className="size-[11px] rounded-full bg-slate-200" />
        <i className="size-[11px] rounded-full bg-slate-200" />
      </span>
      <span className="flex h-6 flex-1 items-center rounded-[7px] border border-slate-200 bg-slate-50 px-3 text-[11.5px] font-medium text-slate-400">
        smoat.co.kr{caption ? ` · ${caption}` : ""}
      </span>
    </div>
  );
}

/** 실제 제품 캡처 프레임 (16:10, 브라우저 크롬) */
function Shot({ shot, priority }: { shot: FeatureShot; priority?: boolean }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_40px_80px_-44px_rgba(15,23,42,0.45)]">
      <ShotChrome caption={shot.caption} />
      <div className="relative aspect-[16/10] w-full">
        <Image
          src={shot.src}
          alt={shot.alt}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 620px, 100vw"
          className="object-cover object-top"
        />
      </div>
    </figure>
  );
}

/** 캡처가 없는 섹션의 브랜드 추상 패널 폴백 */
function AbstractShot({ caption }: { caption?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_40px_80px_-44px_rgba(15,23,42,0.45)]">
      <ShotChrome caption={caption} />
      <div
        aria-hidden
        className={`relative flex aspect-[16/10] w-full items-center justify-center bg-slate-50 ${INK_GRID_PATTERN}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(59,130,246,0.1),transparent_70%)]" />
        <div className="relative flex flex-col items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-blue-600 text-[19px] font-black text-white shadow-[0_20px_40px_-18px_rgba(37,99,235,0.7)]">
            S
          </span>
          {caption && (
            <span className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[12px] font-bold text-slate-500">
              {caption}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** 에메랄드 체크 리스트 (시안 A checkList) */
function CheckList({ items, className = "" }: { items: string[]; className?: string }) {
  return (
    <ul className={`flex flex-col gap-2.5 ${className}`}>
      {items.map((b) => (
        <li key={b} className="flex items-start gap-2.5 text-[15px] leading-[1.65] text-slate-600">
          <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-500" strokeWidth={2.5} />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

/** 파랑 틴트 라운드 아이브로 칩 (시안 A eyebrow). responsiveDark = 모바일 다크·데스크톱 라이트 */
function Eyebrow({
  children,
  dark,
  responsiveDark,
}: {
  children: React.ReactNode;
  dark?: boolean;
  responsiveDark?: boolean;
}) {
  const tone = responsiveDark
    ? "bg-blue-500/15 text-blue-300 lg:bg-blue-50 lg:text-blue-700"
    : dark
      ? "bg-blue-500/15 text-blue-300"
      : "bg-blue-50 text-blue-700";
  const dot = responsiveDark
    ? "bg-blue-400 lg:bg-blue-600"
    : dark
      ? "bg-blue-400"
      : "bg-blue-600";
  return (
    <span
      className={`inline-flex h-[30px] items-center gap-2 rounded-full px-3.5 text-[13px] font-extrabold tracking-[0.02em] ${tone}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

/**
 * 기능/콘텐츠 랜딩 공통 셸(서버 컴포넌트 — 본문 전부 크롤가능 텍스트).
 *
 * 디자인: Claude Design "시안 A — 딥 네이비 지그재그 몰입형" 이식.
 * 네이비 라디얼 히어로(센터 정렬 + 제품 목업 + 플로팅 수치 카드) →
 * 고스트 numeral 지그재그 챕터(실제 캡처 브라우저 프레임) → FAQ → 네이비 CTA 밴드.
 * 마케팅 헤더는 fixed 이므로 본문 상단 패딩을 둔다.
 * 사업자정보 푸터(GlobalBusinessFooter)는 루트 레이아웃에서 공개 경로에 자동 렌더된다.
 */
export function FeaturePageShell({ content }: { content: FeaturePageContent }) {
  const stats = (content.heroStats ?? []).slice(0, 3);
  // 플로팅 카드 배치(시안 A): 좌상 / 우중 / 우하
  const statPos = [
    "lg:absolute lg:-left-7 lg:top-16 lg:w-[180px]",
    "lg:absolute lg:-right-7 lg:top-[150px] lg:w-[176px]",
    "lg:absolute lg:bottom-[-34px] lg:right-11 lg:w-[196px]",
  ];

  return (
    // break-keep: 한국어 어절 중간 줄꺾임 방지 + overflow-wrap:anywhere 로
    // "Word(.docx)" 같은 긴 영문 토큰이 좁은 화면에서 컨테이너를 밀어내지 않게 한다.
    <div className="min-h-screen break-keep bg-white text-slate-900 [overflow-wrap:anywhere]">
      <MarketingHeader />

      <main className="pt-20">
        {/* HERO — 네이비 라디얼 몰입형 */}
        <section className="relative overflow-hidden bg-[radial-gradient(120%_90%_at_50%_-10%,#1B2A4A_0%,#111C34_45%,#0B1220_100%)]">
          <div
            aria-hidden
            className="absolute -top-32 left-1/2 h-[420px] w-[760px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(59,130,246,0.35),transparent)] blur-[20px]"
          />
          <div className={`absolute inset-0 ${INK_GRID_PATTERN}`} aria-hidden />

          <div className="relative mx-auto max-w-[1480px] px-5 pb-12 pt-10 sm:px-8 sm:pb-24 sm:pt-20">
            <div className="mx-auto max-w-[940px] text-left lg:text-center">
              <Eyebrow dark>{content.eyebrow}</Eyebrow>
              <h1 className="mt-5 text-balance text-[34px] font-black leading-[1.16] tracking-tight text-white sm:mt-6 sm:text-[44px] lg:text-[52px]">
                {content.h1}
              </h1>
              <p className="mx-auto mt-6 max-w-[820px] text-[15.5px] leading-[1.85] text-slate-300 sm:text-[16.5px]">
                {content.subhead}
              </p>
              {content.heroHighlight && (
                <p className="mt-5">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-[18px] py-2 text-[15px] font-extrabold text-blue-800 sm:text-[17px]">
                    {content.heroHighlight}
                  </span>
                </p>
              )}
              <div className="mt-7 flex flex-col gap-2.5 sm:mt-9 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-3.5">
                <Link
                  href="/register"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-blue-500 px-7 text-[15px] font-extrabold text-white shadow-[0_16px_34px_-16px_rgba(59,130,246,0.8)] transition hover:-translate-y-0.5 hover:bg-blue-400 sm:w-auto"
                >
                  SMOAT 시작하기
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/credits/products"
                  className="inline-flex h-12 w-full items-center justify-center whitespace-nowrap rounded-full border border-white/[0.28] bg-white/[0.12] px-7 text-[15px] font-extrabold text-white transition hover:border-white/50 hover:bg-white/20 sm:w-auto"
                >
                  상품·요금 보기
                </Link>
              </div>
            </div>

            {content.heroBullets && content.heroBullets.length > 0 && (
              <ul className="mx-auto mt-10 grid max-w-[1200px] grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                {content.heroBullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-[13.5px] font-semibold leading-6 text-slate-200"
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

            {/* 제품 목업 + 플로팅 수치 카드 */}
            {content.heroImage && (
              <div className="relative mx-auto mt-12 max-w-[1080px] sm:mt-14">
                <Shot shot={content.heroImage} priority />
                {stats.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3 lg:mt-0 lg:contents">
                    {stats.map((s, i) => (
                      <div
                        key={s.label}
                        className={`rounded-2xl border border-white/[0.08] bg-[#16213B] px-3.5 py-4 lg:border-slate-200 lg:bg-white lg:p-5 lg:shadow-[0_20px_44px_-30px_rgba(15,23,42,0.35)] ${statPos[i]}`}
                      >
                        <div className="text-[24px] font-black leading-none tracking-[-0.02em] text-white tabular-nums lg:text-[30px] lg:text-slate-900">
                          <span className="text-blue-500 lg:text-blue-600">{s.value}</span>
                          {s.unit}
                        </div>
                        <div className="mt-1.5 text-[11.5px] font-semibold leading-snug text-[#8FA0BD] lg:text-[13.5px] lg:text-slate-500">
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* SECTIONS — 고스트 numeral 챕터 (모바일: 풀블리드 교차 배경 / lg: 지그재그) */}
        <section className="mx-auto max-w-[1480px] py-12 sm:px-8 sm:py-24">
          {(content.sectionsTitle || content.sectionsBody) && (
            <div className="mx-auto mb-10 max-w-[720px] px-5 text-center sm:px-0 lg:mb-20">
              <Eyebrow>핵심 기능</Eyebrow>
              {content.sectionsTitle && (
                <h2 className="mt-4 text-balance text-[28px] font-black leading-[1.2] tracking-tight text-slate-900 sm:text-[40px]">
                  {content.sectionsTitle}
                </h2>
              )}
              {content.sectionsBody && (
                <p className="mt-3.5 text-[15px] font-medium leading-[1.75] text-slate-600 sm:text-[17px]">
                  {content.sectionsBody}
                </p>
              )}
            </div>
          )}

          <div className="mx-auto flex max-w-[1180px] flex-col lg:gap-24">
            {content.sections.map((section, i) => {
              const reversed = i % 2 === 1;
              return (
                <article
                  key={section.title}
                  className={`grid grid-cols-1 items-center gap-8 px-5 py-10 lg:grid-cols-2 lg:gap-16 lg:bg-transparent lg:px-0 lg:py-0 ${
                    reversed ? "bg-slate-50" : "bg-white"
                  }`}
                >
                  <div className={reversed ? "lg:order-2" : ""}>
                    <div className="relative">
                      <span
                        aria-hidden
                        className={`pointer-events-none absolute -top-5 right-0 select-none text-[76px] font-black leading-[0.8] tracking-[-0.05em] text-transparent tabular-nums [-webkit-text-stroke:2px_#BFDBFE] lg:-top-[76px] lg:text-[130px] ${
                          reversed ? "" : "lg:left-0 lg:right-auto"
                        }`}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Eyebrow>{`STEP ${i + 1}`}</Eyebrow>
                    </div>
                    <h2 className="mt-4 text-balance text-[24px] font-black leading-[1.2] tracking-tight text-slate-900 sm:text-[32px]">
                      {section.title}
                    </h2>
                    <p className="mt-4 text-pretty text-[15.5px] leading-[1.8] text-slate-600 sm:text-[16.5px]">
                      {section.body}
                    </p>
                    {section.bullets && section.bullets.length > 0 && (
                      <CheckList items={section.bullets} className="mt-6" />
                    )}
                  </div>
                  <div className={reversed ? "lg:order-1" : ""}>
                    {section.image ? (
                      <Shot shot={section.image} />
                    ) : (
                      <AbstractShot caption={section.title} />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* RELATED (internal links) */}
        {content.related && content.related.length > 0 && (
          <section className="border-t border-slate-200 bg-slate-50">
            <div className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8 sm:py-16">
              <div className="text-center">
                <Eyebrow>함께 보면 좋은 기능</Eyebrow>
                <h2 className="mt-3 text-[21px] font-black tracking-tight text-slate-950 sm:text-[26px]">
                  스모트의 다른 기능도 함께 살펴보세요
                </h2>
              </div>
              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

        {/* FAQ — 모바일: 네이비 다크 섹션 / lg: 라이트 */}
        {content.faq && content.faq.length > 0 && (
          <section className="bg-[#0B1220] px-5 py-14 sm:px-8 lg:bg-transparent lg:py-24">
            <div className="mx-auto max-w-[820px]">
              <div className="mb-7 text-center lg:mb-11">
                <Eyebrow responsiveDark>FAQ</Eyebrow>
                <h2 className="mt-3 text-[24px] font-black tracking-tight text-white sm:text-[34px] lg:text-slate-950">
                  자주 묻는 질문
                </h2>
              </div>
              <div className="flex flex-col gap-3">
                {content.faq.map((item) => (
                  <div
                    key={item.question}
                    className="rounded-[14px] border border-white/[0.08] bg-[#16213B] px-5 py-5 sm:px-6 lg:border-slate-200 lg:bg-white"
                  >
                    <h3 className="flex items-start gap-3 text-[15.5px] font-extrabold leading-6 text-white sm:text-[16.5px] lg:text-slate-950">
                      <span
                        aria-hidden
                        className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-500 text-[12px] font-black text-white lg:bg-slate-950"
                      >
                        Q
                      </span>
                      {item.question}
                    </h3>
                    <p className="mt-2.5 pl-9 text-[14.5px] leading-[1.65] text-[#B6C2D9] lg:text-slate-600">
                      {item.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* FINAL CTA — 네이비 라디얼 밴드 */}
        <section className="relative overflow-hidden bg-[radial-gradient(120%_120%_at_50%_0%,#1B2A4A,#0B1220_60%)]">
          <div
            aria-hidden
            className="absolute -top-20 left-1/2 h-[340px] w-[620px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(59,130,246,0.4),transparent)] blur-[18px]"
          />
          <div className={`absolute inset-0 ${INK_GRID_PATTERN}`} aria-hidden />
          <div className="relative mx-auto max-w-[1000px] px-5 py-20 text-center sm:px-8 sm:py-24">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-blue-300">
              SMOAT — English AI Workbench
            </p>
            <h2 className="mt-4 text-balance text-[28px] font-black leading-[1.2] tracking-tight text-white sm:text-[40px]">
              {content.ctaTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-[1.85] text-slate-300 sm:text-[16px]">
              {content.ctaBody}
            </p>
            <div className="mt-7 flex flex-col gap-2.5 sm:mt-9 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-3.5">
              <Link
                href="/register"
                className="inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-blue-500 px-7 text-[15px] font-extrabold text-white shadow-[0_16px_34px_-16px_rgba(59,130,246,0.8)] transition hover:-translate-y-0.5 hover:bg-blue-400 sm:w-auto"
              >
                무료로 시작하기
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/credits/products"
                className="inline-flex h-12 w-full items-center justify-center whitespace-nowrap rounded-full border border-white/[0.28] bg-white/[0.12] px-7 text-[15px] font-extrabold text-white transition hover:border-white/50 hover:bg-white/20 sm:w-auto"
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
