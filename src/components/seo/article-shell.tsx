import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { MarketingHeader } from "@/components/seo/marketing-header";
import { ArticleToc } from "@/components/seo/article-toc";
import { ArticleStickyCta } from "@/components/seo/article-sticky-cta";
import type {
  ArticleEntry,
  ArticleSample,
  ArticleSection,
} from "@/lib/seo/articles-content";
import { CONTENT_HUBS } from "@/lib/seo/articles-content";

/**
 * 정보성 장문 아티클 공통 셸(서버 컴포넌트 — 본문 전부 크롤가능 텍스트).
 *
 * 디자인: "잉크 에디토리얼" — 딥 네이비 히어로 + 챕터 numeral 조판 + 시험지 모형 샘플 블록.
 * 전환: 우측 레일 미니 CTA(xl) · 샘플 직후 인라인 CTA 밴드 · 하단 고정 CTA 바(읽기 진행률) ·
 *       말미 다크 CTA 밴드 — 어느 스크롤 위치에서도 전환 동선이 시야에 존재하게 설계.
 * 첫 도입 문단은 정의문(네이버 지식스니펫/구글 피처드스니펫 타깃) — 렌더 순서 유지.
 */

const CIRCLED = ["①", "②", "③", "④", "⑤"];

const INK_GRID_PATTERN =
  "[background-image:linear-gradient(to_right,rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:44px_44px]";

/** 한국어 기준 대략적 읽기 시간(분). 표·샘플 포함 전체 텍스트 길이 기반. */
function estimateReadingMinutes(article: ArticleEntry): number {
  let chars = article.intro.join("").length;
  for (const s of article.sections) {
    chars += s.heading.length;
    chars += s.paragraphs.join("").length;
    chars += (s.bullets ?? []).join("").length;
    if (s.table) chars += s.table.rows.flat().join("").length;
    if (s.callout) chars += s.callout.title.length + s.callout.body.length;
    if (s.sample) {
      chars +=
        s.sample.passage.length +
        s.sample.question.length +
        s.sample.explanation.length;
    }
  }
  for (const f of article.faq) chars += f.question.length + f.answer.length;
  return Math.max(3, Math.round(chars / 550));
}

function formatUpdatedAt(iso: string): string {
  return iso.replaceAll("-", ".");
}

/** 실물 시험지 모형 — 이중 프레임 + 잉크 탭 바 + serif 지문 + 원문자 선지 + 정답·해설 패널. */
function SampleQuestionBlock({ sample }: { sample: ArticleSample }) {
  return (
    <figure className="mt-8 rounded-2xl border border-slate-300 bg-white p-1.5 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.5)]">
      <div className="rounded-[10px] border border-slate-200">
        <figcaption className="flex items-center justify-between gap-3 rounded-t-[10px] bg-slate-950 px-4 py-2.5 sm:px-5">
          <span className="whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-300">
            예시 문항
          </span>
          <span className="truncate text-[11px] font-bold text-slate-400">
            스모트 AI 제작 창작 샘플 — 기출 인용 아님
          </span>
        </figcaption>

        <div className="px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-slate-950 text-[12px] font-black text-white"
            >
              Q
            </span>
            <p className="text-[15px] font-extrabold leading-7 text-slate-950">
              {sample.question}
            </p>
          </div>

          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-4 font-serif text-[14.5px] leading-[1.9] text-slate-800 sm:px-5">
            {sample.passage}
          </p>

          {sample.options && sample.options.length > 0 && (
            <ol className="mt-4 space-y-2">
              {sample.options.map((opt, i) => (
                <li
                  key={opt}
                  className="flex gap-2.5 text-[14.5px] leading-7 text-slate-700"
                >
                  <span className="shrink-0 font-black text-blue-600">
                    {CIRCLED[i] ?? `${i + 1}.`}
                  </span>
                  <span>{opt}</span>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-6 rounded-xl border-t-2 border-slate-950 bg-slate-50 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-md bg-slate-950 px-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white">
                정답
              </span>
              <span className="text-[14.5px] font-extrabold leading-6 text-slate-950">
                {sample.answer}
              </span>
            </div>
            <p className="mt-3 border-t border-slate-200 pt-3 text-[13.5px] leading-7 text-slate-600">
              {sample.explanation}
            </p>
          </div>
        </div>
      </div>
    </figure>
  );
}

/** 샘플 직후 1회 노출되는 인라인 전환 밴드. */
function InlineCtaBand() {
  return (
    <div className="relative mt-6 overflow-hidden rounded-2xl bg-slate-950 px-5 py-6 sm:px-7">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(70%_120%_at_90%_-20%,rgba(37,99,235,0.35),transparent_60%)]"
      />
      <div className={`absolute inset-0 opacity-60 ${INK_GRID_PATTERN}`} aria-hidden />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-300">
            SMOAT AI
          </p>
          <p className="mt-1.5 text-[17px] font-black leading-6 text-white sm:text-[18px]">
            이런 문제, 스모트가 1분 만에 만듭니다
          </p>
          <p className="mt-1.5 text-[13px] leading-6 text-slate-400">
            지문만 붙여넣으면 같은 유형·같은 설계 원리로 무한 출제됩니다.
          </p>
        </div>
        <Link
          href="/register"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start whitespace-nowrap rounded-full bg-white px-5 text-[13.5px] font-extrabold text-slate-950 transition hover:-translate-y-0.5 hover:bg-blue-50 sm:self-auto"
        >
          무료로 만들어 보기
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function SectionBlock({
  section,
  index,
  showInlineCta,
}: {
  section: ArticleSection;
  index: number;
  showInlineCta: boolean;
}) {
  const numeral = String(index + 1).padStart(2, "0");
  return (
    <section className="mt-14 border-t border-slate-200 pt-10 first:mt-0 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-4 sm:gap-5">
        <span
          aria-hidden
          className="select-none text-[40px] font-black leading-[0.9] tracking-tight text-slate-200 tabular-nums sm:text-[52px]"
        >
          {numeral}
        </span>
        <h2
          id={`s-${index + 1}`}
          className="scroll-mt-28 pt-1 text-[21px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[25px] sm:pt-2"
        >
          {section.heading}
        </h2>
      </div>

      <div className="mt-6 space-y-5">
        {section.paragraphs.map((p) => (
          <p
            key={p.slice(0, 40)}
            className="text-[15.5px] leading-[1.9] text-slate-700 sm:text-[16px]"
          >
            {p}
          </p>
        ))}
      </div>

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

      {section.table && (
        <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.5)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="bg-slate-950">
                  {section.table.headers.map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-3 text-[12.5px] font-extrabold tracking-wide text-white sm:px-5"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.table.rows.map((row) => (
                  <tr
                    key={row.join("|")}
                    className="border-t border-slate-100 even:bg-slate-50/60"
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={`${ci}-${cell.slice(0, 24)}`}
                        className={`break-keep px-4 py-3.5 align-top text-[13.5px] leading-6 sm:px-5 ${
                          ci === 0
                            ? "font-bold text-slate-950"
                            : "text-slate-600"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section.callout && (
        <div className="mt-7 rounded-r-2xl border-l-4 border-blue-600 bg-blue-50/50 px-5 py-5 sm:px-6">
          <p className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded bg-blue-600 px-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white">
              Point
            </span>
            <span className="text-[15px] font-extrabold text-slate-950">
              {section.callout.title}
            </span>
          </p>
          <p className="mt-2.5 text-[14px] leading-7 text-slate-700">
            {section.callout.body}
          </p>
        </div>
      )}

      {section.sample && <SampleQuestionBlock sample={section.sample} />}
      {section.sample && showInlineCta && <InlineCtaBand />}
    </section>
  );
}

export function ArticleShell({ article }: { article: ArticleEntry }) {
  const hub = CONTENT_HUBS[article.category];
  const readingMinutes = estimateReadingMinutes(article);
  const firstSampleIndex = article.sections.findIndex((s) => s.sample);

  const tocItems = [
    ...article.sections.map((s, i) => ({ id: `s-${i + 1}`, label: s.heading })),
    ...(article.faq.length > 0 ? [{ id: "faq", label: "자주 묻는 질문" }] : []),
  ];

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
            <nav
              aria-label="breadcrumb"
              className="flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-slate-400"
            >
              <Link href="/" className="whitespace-nowrap transition hover:text-white">
                스모트
              </Link>
              <span aria-hidden>›</span>
              <Link
                href={hub.path}
                className="whitespace-nowrap transition hover:text-white"
              >
                {hub.label}
              </Link>
              <span aria-hidden>›</span>
              <span className="text-slate-400">{article.eyebrow}</span>
            </nav>

            <div className="mt-8 max-w-[1000px]">
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-blue-300">
                <span aria-hidden className="size-1.5 rounded-full bg-blue-400" />
                {article.eyebrow}
              </p>
              <h1 className="mt-5 text-balance text-[32px] font-black leading-[1.18] tracking-tight text-white sm:text-[44px] lg:text-[50px]">
                {article.h1}
              </h1>
              <div className="mt-6 space-y-3.5">
                {article.intro.map((p, i) => (
                  <p
                    key={p.slice(0, 40)}
                    className={
                      i === 0
                        ? "text-[16px] leading-[1.85] text-slate-300 sm:text-[17px]"
                        : "text-[14.5px] leading-[1.85] text-slate-400 sm:text-[15px]"
                    }
                  >
                    {p}
                  </p>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-[12.5px] font-bold text-slate-400">
                <span className="whitespace-nowrap">
                  읽기 약 <span className="text-white">{readingMinutes}분</span>
                </span>
                <span aria-hidden className="hidden size-1 rounded-full bg-slate-600 sm:block" />
                <span className="whitespace-nowrap">
                  섹션 <span className="text-white">{article.sections.length}개</span>
                </span>
                <span aria-hidden className="hidden size-1 rounded-full bg-slate-600 sm:block" />
                <span className="whitespace-nowrap">
                  {formatUpdatedAt(article.updatedAt)} 업데이트
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* BODY — 본문 칼럼 + 우측 목차 레일(xl) */}
        <div className="mx-auto max-w-[1480px] px-5 py-12 sm:px-8 sm:py-16 xl:grid xl:grid-cols-[minmax(0,900px)_280px] xl:gap-x-28">
          <div className="min-w-0">
            {/* 모바일/태블릿 목차 카드 */}
            <nav
              aria-label="목차"
              className="rounded-2xl border border-slate-200 bg-slate-50/70 px-5 py-5 xl:hidden"
            >
              <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
                <span aria-hidden className="size-1.5 bg-blue-600" />
                목차
              </p>
              <ol className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {tocItems.map((item, i) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="group flex items-baseline gap-2.5 py-0.5 text-[13.5px] font-semibold leading-6 text-slate-700 transition hover:text-blue-700"
                    >
                      <span className="shrink-0 text-[11.5px] font-extrabold text-slate-400 tabular-nums group-hover:text-blue-600">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            {/* SECTIONS */}
            <div className="mt-12 xl:mt-0">
              {article.sections.map((section, i) => (
                <SectionBlock
                  key={section.heading}
                  section={section}
                  index={i}
                  showInlineCta={i === firstSampleIndex}
                />
              ))}
            </div>

            {/* FAQ */}
            {article.faq.length > 0 && (
              <section className="mt-14 border-t border-slate-200 pt-10">
                <h2
                  id="faq"
                  className="scroll-mt-28 text-[21px] font-black tracking-tight text-slate-950 sm:text-[25px]"
                >
                  자주 묻는 질문
                </h2>
                <div className="mt-6 space-y-3">
                  {article.faq.map((item) => (
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
              </section>
            )}

            {/* RELATED */}
            {article.related.length > 0 && (
              <section className="mt-14 border-t border-slate-200 pt-10">
                <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-400">
                  <span aria-hidden className="size-1.5 bg-blue-600" />
                  함께 보면 좋은 콘텐츠
                </p>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {article.related.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-[14.5px] font-extrabold leading-6 text-slate-950 transition-colors group-hover:text-blue-700">
                          {link.label}
                        </span>
                        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                      </div>
                      {link.description && (
                        <p className="mt-1.5 text-[12.5px] leading-5 text-slate-500">
                          {link.description}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* 우측 목차 레일 */}
          <aside className="hidden xl:block">
            <ArticleToc items={tocItems} />
          </aside>
        </div>

        {/* FINAL CTA */}
        <section
          id="article-final-cta"
          className="relative overflow-hidden bg-[#070D1F]"
        >
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
              {article.ctaTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[14.5px] leading-[1.85] text-slate-300">
              {article.ctaBody}
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
            <Link
              href={hub.path}
              className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-400 transition hover:text-white"
            >
              {hub.label} 전체 보기
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </section>
      </main>

      <ArticleStickyCta title={article.h1} />
    </div>
  );
}
