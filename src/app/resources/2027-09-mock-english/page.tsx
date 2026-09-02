import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Download, FileText } from "lucide-react";
import { MarketingHeader } from "@/components/seo/marketing-header";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { absoluteUrl } from "@/lib/seo/config";
import { articleSchema, breadcrumbSchema, faqSchema } from "@/lib/seo/structured-data";
import {
  DOWNLOADS,
  FAQ,
  PAGE_PATH,
  PREVIEWS,
  PUBLISHED_ON,
  READING_STEPS,
  USAGE_TERMS,
  assetUrl,
  downloadUrl,
} from "./content";

/**
 * 2027학년도 9월 모의평가 영어 — 20지문 분석 학습지·수능 예측 리포트 무료 다운로드.
 *
 * /resources(무료자료실)의 "잉크 에디토리얼" 블록 문법을 그대로 잇는 서버 컴포넌트.
 * 다운로드가 제1 CTA. 파일은 Supabase 공개 버킷(content.ts 참조), 미리보기는 실제
 * PDF 쪽을 JPG 로 떠 온 것이라 next/image 원격 도메인 설정 없이 <img> 로 그린다.
 */

const INK_GRID_PATTERN =
  "[background-image:linear-gradient(to_right,rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:44px_44px]";

const TITLE = "2027학년도 9월 모평 영어 — 20지문 분석 학습지·수능 예측 리포트 무료 다운로드";
const DESCRIPTION =
  "2027학년도 9월 모의평가 영어 독해 20지문을 당일 분석한 학습지(교사판 140쪽·학생판 134쪽)와 2027 수능 영어 예측 리포트(82쪽) PDF를 무료로 내려받으세요. 4컷 웹툰·논증 도식·직독직해·어법 판서·실전 5문항·핵심 어휘 수록. 회원가입 없이 바로 다운로드.";

export const metadata: Metadata = buildMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PAGE_PATH,
  keywords: [
    "2027학년도 9월 모의평가 영어",
    "9월 모평 영어 분석",
    "9월 모의고사 영어 해설",
    "9월 모평 영어 지문 분석",
    "수능 영어 예측",
    "2027 수능 영어",
    "고3 9월 모의고사 영어 학습지",
    "모의고사 영어 직독직해",
  ],
});

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-600">
      <span aria-hidden className="size-1.5 bg-blue-600" />
      <span className="whitespace-nowrap">{children}</span>
    </p>
  );
}

export default function SeptMockEnglishResourcePage() {
  return (
    <div className="min-h-screen break-keep bg-white text-slate-900">
      <MarketingHeader />
      <JsonLd
        id="ld-resources-2027-09-mock-breadcrumb"
        data={breadcrumbSchema([
          { name: "스모트 SMOAT", url: "/" },
          { name: "무료자료실", url: "/resources" },
          { name: "2027학년도 9월 모평 영어 자료", url: PAGE_PATH },
        ])}
      />
      <JsonLd
        id="ld-resources-2027-09-mock-article"
        data={articleSchema({
          headline: TITLE,
          description: DESCRIPTION,
          url: absoluteUrl(PAGE_PATH),
          datePublished: PUBLISHED_ON,
        })}
      />
      <JsonLd
        id="ld-resources-2027-09-mock-faq"
        data={faqSchema(FAQ.map((f) => ({ question: f.q, answer: f.a })))}
      />

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
              className="flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-slate-500"
            >
              <Link href="/" className="whitespace-nowrap transition hover:text-white">
                스모트
              </Link>
              <span aria-hidden>›</span>
              <Link href="/resources" className="whitespace-nowrap transition hover:text-white">
                무료자료실
              </Link>
              <span aria-hidden>›</span>
              <span className="whitespace-nowrap text-slate-400">2027학년도 9월 모평 영어</span>
            </nav>

            <div className="mt-8 max-w-[1040px]">
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-blue-300">
                <span aria-hidden className="size-1.5 rounded-full bg-blue-400" />
                <span className="whitespace-nowrap">2027학년도 9월 모의평가 · 영어</span>
              </p>
              <h1 className="mt-5 text-[30px] font-black leading-[1.18] tracking-tight text-white sm:text-[42px] lg:text-[48px]">
                9월 모평 영어 20지문 분석 학습지
                <br className="hidden sm:block" /> + 2027 수능 예측 리포트 무료 다운로드
              </h1>
              <div className="mt-6 space-y-3.5">
                <p className="text-[16px] leading-[1.85] text-slate-300 sm:text-[17px]">
                  2026년 9월 2일 시행된 2027학년도 9월 모의평가 영어 영역 독해 20지문을
                  스모트 AI가 당일 전수 분석했습니다. 지문마다 실전 5문항 · 4컷 웹툰 ·
                  논증 도식 · 직독직해 · 어법 판서 · 핵심 어휘가 담긴 학습지와, 2015학년도
                  이후 기출 통계로 2027 수능을 예측한 리포트를 PDF로 배포합니다.
                </p>
                <p className="text-[14.5px] leading-[1.85] text-slate-400 sm:text-[15px]">
                  세 파일 모두 회원가입 없이 바로 내려받을 수 있습니다. 학원·학교 수업과
                  개인 학습에 자유롭게 쓰세요.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-[12.5px] font-bold text-slate-400">
                <span className="whitespace-nowrap">
                  학습지 교사판 <span className="text-white">140쪽</span>
                </span>
                <span aria-hidden className="hidden size-1 rounded-full bg-slate-600 sm:block" />
                <span className="whitespace-nowrap">
                  학습지 학생판 <span className="text-white">134쪽</span>
                </span>
                <span aria-hidden className="hidden size-1 rounded-full bg-slate-600 sm:block" />
                <span className="whitespace-nowrap">
                  예측 리포트 <span className="text-white">82쪽</span>
                </span>
                <span aria-hidden className="hidden size-1 rounded-full bg-slate-600 sm:block" />
                <span className="whitespace-nowrap">
                  <span className="text-white">회원가입 불필요</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* DOWNLOADS — 대형 카드(제1 CTA) */}
        <section className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8 sm:py-20">
          <Eyebrow>무료 배포 · PDF 3종</Eyebrow>
          <h2 className="mt-3 text-[22px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[27px]">
            지금 바로 내려받는 9월 모평 영어 자료 3종
          </h2>
          <p className="mt-2.5 max-w-2xl text-[14.5px] leading-7 text-slate-600">
            모든 파일은 A4 PDF입니다. 다운로드 버튼을 누르면 바로 저장됩니다. 모든
            쪽에 SMOAT 워터마크가 옅게 들어 있습니다.
          </p>

          <div className="mt-9 space-y-5">
            {DOWNLOADS.map((r, i) => (
              <article
                key={r.key}
                id={`download-${r.key}`}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_-42px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)]"
              >
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <span
                        aria-hidden
                        className="select-none text-[40px] font-black leading-[0.9] tracking-tight text-slate-200 tabular-nums sm:text-[48px]"
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="inline-flex h-7 items-center whitespace-nowrap rounded-md bg-blue-600/10 px-2.5 text-[11px] font-extrabold tracking-[0.08em] text-blue-700">
                          {r.badge}
                        </span>
                        <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-950 px-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white">
                          <FileText className="size-3.5 text-blue-300" />
                          PDF · {r.pages}쪽 · {r.size}
                        </span>
                      </div>
                    </div>
                    <h3 className="mt-5 text-[19px] font-black leading-[1.35] tracking-tight text-slate-950 transition-colors group-hover:text-blue-700 sm:text-[23px]">
                      {r.title}
                    </h3>
                    <p className="mt-3 text-[14.5px] leading-[1.85] text-slate-600 sm:text-[15px]">
                      {r.description}
                    </p>
                  </div>

                  <div className="flex flex-col border-t border-slate-200 bg-slate-50/60 p-6 sm:p-8 lg:border-l lg:border-t-0">
                    <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
                      <span aria-hidden className="size-1.5 bg-blue-600" />
                      <span className="whitespace-nowrap">포함 내용</span>
                    </p>
                    <ul className="mt-4 space-y-2.5">
                      {r.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2.5 text-[13.5px] leading-6 text-slate-700">
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
                    <div className="mt-7 lg:mt-auto lg:pt-7">
                      <a
                        href={downloadUrl(r.object, r.saveAs)}
                        className="inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-slate-950 px-6 text-[14.5px] font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-blue-600"
                      >
                        <Download className="size-4 shrink-0" />
                        무료 다운로드
                      </a>
                      <a
                        href={assetUrl(r.object)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2.5 inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-full border border-slate-300 px-6 text-[13px] font-bold text-slate-700 transition hover:border-blue-400 hover:text-blue-700"
                      >
                        브라우저에서 미리 보기
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* 브리지 인라인 CTA 밴드 */}
          <div className="relative mt-12 overflow-hidden rounded-2xl bg-slate-950 px-5 py-7 sm:px-8">
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(70%_120%_at_90%_-20%,rgba(37,99,235,0.35),transparent_60%)]"
            />
            <div className={`absolute inset-0 opacity-60 ${INK_GRID_PATTERN}`} aria-hidden />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-300">SMOAT AI</p>
                <p className="mt-1.5 text-[17px] font-black leading-6 text-white sm:text-[18px]">
                  우리 학원 지문으로도 같은 학습지를 만들 수 있습니다
                </p>
                <p className="mt-1.5 text-[13px] leading-6 text-slate-400">
                  교재·기출·자작 지문을 넣으면 직독직해 · 어법 판서 · 실전 문항 · 핵심
                  어휘 학습지와 지문 웹툰이 같은 구성으로 생성됩니다.
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
        </section>

        {/* PREVIEW — 실제 쪽 미리보기 */}
        <section className="border-t border-slate-100 bg-slate-50/70">
          <div className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8 sm:py-16">
            <Eyebrow>미리보기</Eyebrow>
            <h2 className="mt-3 text-[22px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[27px]">
              실제 쪽을 그대로 보여 드립니다
            </h2>
            <p className="mt-2.5 max-w-2xl text-[14.5px] leading-7 text-slate-600">
              학습지 20번(교육과 기술) 지문의 흐름과 예측 리포트의 통계 카드입니다.
              내려받은 PDF의 모든 지문이 같은 구성입니다.
            </p>
            <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {PREVIEWS.map((p) => (
                <li
                  key={p.object}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)]"
                >
                  <a href={assetUrl(p.object)} target="_blank" rel="noopener noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetUrl(p.object)}
                      alt={p.caption}
                      width={954}
                      height={1348}
                      loading="lazy"
                      className="aspect-[954/1348] w-full bg-slate-100 object-cover"
                    />
                    <div className="px-3.5 py-3">
                      <p className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-blue-600">
                        {p.source}
                      </p>
                      <p className="mt-1 text-[12.5px] font-bold leading-5 text-slate-800">{p.caption}</p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* READING ORDER — 한 지문을 읽는 순서 */}
        <section className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8 sm:py-16">
          <Eyebrow>학습지 구성</Eyebrow>
          <h2 className="mt-3 text-[22px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[27px]">
            한 지문을 읽는 순서 — 문제를 먼저 풀고, 그림으로 다시 읽고, 판서로 복습합니다
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {READING_STEPS.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)]"
              >
                <span
                  aria-hidden
                  className="select-none text-[34px] font-black leading-[0.9] tracking-tight text-slate-200 tabular-nums"
                >
                  {s.no}
                </span>
                <p className="mt-3 text-[15.5px] font-extrabold text-slate-950">{s.title}</p>
                <p className="mt-2 text-[13.5px] leading-6 text-slate-600">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* TERMS + FAQ */}
        <section className="border-t border-slate-100 bg-slate-50/70">
          <div className="mx-auto grid max-w-[1480px] grid-cols-1 gap-10 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div>
              <Eyebrow>이용 안내</Eyebrow>
              <h2 className="mt-3 text-[22px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[26px]">
                이렇게 쓰실 수 있습니다
              </h2>
              <ul className="mt-6 space-y-3">
                {USAGE_TERMS.map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-[14px] leading-7 text-slate-700">
                    <span
                      aria-hidden
                      className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-blue-600/10"
                    >
                      <Check className="size-3.5 text-blue-700" />
                    </span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Eyebrow>자주 묻는 질문</Eyebrow>
              <h2 className="mt-3 text-[22px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[26px]">
                궁금한 점
              </h2>
              <dl className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
                {FAQ.map((f) => (
                  <div key={f.q} className="px-5 py-4 sm:px-6">
                    <dt className="text-[15px] font-extrabold text-slate-950">{f.q}</dt>
                    <dd className="mt-1.5 text-[13.5px] leading-6 text-slate-600">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
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
              이 학습지를 만든 도구를 우리 학원 지문에 쓰세요
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[14.5px] leading-[1.85] text-slate-300">
              지문을 넣으면 문항 생성부터 분석 학습지, 지문 웹툰, Word·한글 시험지까지
              한 번에 끝납니다. 다음 모의고사 대비는 스모트와 함께 시작해 보세요.
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
                href="/features/passage-analysis"
                className="inline-flex h-12 items-center whitespace-nowrap rounded-full border border-white/25 px-7 text-[15px] font-extrabold text-white transition hover:border-white/50 hover:bg-white/10"
              >
                지문 분석 기능 살펴보기
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
