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
 * 2026학년도 9월 전국연합학력평가(2026-09-02 시행) 영어 — 고1·고2 20지문 분석 학습지
 * 무료 다운로드.
 *
 * /resources(무료자료실) · /resources/2027-09-mock-english 의 "잉크 에디토리얼" 블록
 * 문법을 그대로 잇는 서버 컴포넌트. 다운로드가 제1 CTA. 파일은 Supabase 공개 버킷
 * (content.ts 참조), 미리보기는 실제 PDF 쪽을 JPG 로 떠 온 것이라 next/image 원격
 * 도메인 설정 없이 <img> 로 그린다.
 *
 * 고3 페이지와 다른 점: 다운로드가 4종(고1·고2 × 교사판·학생판)이라 카드 그리드를
 * 학년별 2열로 묶는다. 묶음 판정은 파일명(object)의 `-g1-` / `-g2-` 토큰으로 한다 —
 * 버킷에 이미 올라간 실물 이름이라 키 작명 규칙보다 안전하다.
 */

const INK_GRID_PATTERN =
  "[background-image:linear-gradient(to_right,rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:44px_44px]";

const TITLE = "2026년 9월 고1·고2 학력평가 영어 — 20지문 분석 학습지 무료 다운로드";
const DESCRIPTION =
  "2026년 9월 2일 시행된 2026학년도 9월 전국연합학력평가 영어 독해 20지문을 고1·고2 학년별로 분석한 학습지 PDF(교사판·학생판)를 무료로 내려받으세요. 학년별 실전 5문항 100제, 4컷 웹툰 20편, 개념 도식 20장, 직독직해·어법 판서, 핵심 어휘 수록. 회원가입 없이 바로 다운로드.";

export const metadata: Metadata = buildMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PAGE_PATH,
  keywords: [
    "2026년 9월 고1 모의고사 영어",
    "9월 학력평가 영어 분석",
    "고2 9월 모의고사 영어 해설",
    "고1 영어 지문 분석",
    "고2 영어 지문 분석",
    "9월 전국연합학력평가 영어",
    "고1 영어 학습지",
    "고2 영어 학습지",
  ],
});

/** 학년 묶음 — 파일명 토큰으로 DOWNLOADS 를 가른다. */
const GRADE_SECTIONS = [
  {
    id: "g1",
    token: "-g1-",
    label: "고1",
    heading: "고등학교 1학년",
    note: "독해 20~45번 20지문 · 실전 100제 · 4컷 웹툰 20편",
  },
  {
    id: "g2",
    token: "-g2-",
    label: "고2",
    heading: "고등학교 2학년",
    note: "독해 20~45번 20지문 · 실전 100제 · 4컷 웹툰 20편",
  },
] as const;

/** 학년별 수록량(한 학년 기준). */
const VOLUME_STATS: Array<{ value: string; label: string }> = [
  { value: "20지문", label: "독해 20~45번 전수" },
  { value: "100제", label: "새로 출제한 실전 5문항" },
  { value: "20편", label: "4컷 웹툰" },
  { value: "20장", label: "개념 도식" },
  { value: "100개", label: "어법 포인트" },
  { value: "320개", label: "핵심 어휘" },
];

/** 이 자료가 다루는 시험. */
const EXAM_FACTS: Array<{ term: string; detail: string }> = [
  { term: "시험", detail: "2026학년도 9월 전국연합학력평가 영어 영역" },
  { term: "시행일", detail: "2026년 9월 2일" },
  { term: "주관", detail: "인천광역시교육청(16개 시·도교육청 공동)" },
  { term: "분석 범위", detail: "고1·고2 독해 20~45번 20지문(듣기·도표·안내문 제외)" },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-600">
      <span aria-hidden className="size-1.5 bg-blue-600" />
      <span className="whitespace-nowrap">{children}</span>
    </p>
  );
}

function DownloadCard({ item, no }: { item: (typeof DOWNLOADS)[number]; no: number }) {
  return (
    <article
      id={`download-${item.key}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_-42px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)]"
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <span
            aria-hidden
            className="select-none text-[36px] font-black leading-[0.9] tracking-tight text-slate-200 tabular-nums sm:text-[42px]"
          >
            {String(no).padStart(2, "0")}
          </span>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <span className="inline-flex h-7 items-center whitespace-nowrap rounded-md bg-blue-600/10 px-2.5 text-[11px] font-extrabold tracking-[0.08em] text-blue-700">
              {item.badge}
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-950 px-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white">
              <FileText className="size-3.5 text-blue-300" />
              PDF · {item.pages}쪽 · {item.size}
            </span>
          </div>
        </div>
        <h4 className="mt-5 text-[18px] font-black leading-[1.35] tracking-tight text-slate-950 transition-colors group-hover:text-blue-700 sm:text-[20px]">
          {item.title}
        </h4>
        <p className="mt-3 text-[14px] leading-[1.85] text-slate-600 sm:text-[14.5px]">
          {item.description}
        </p>
      </div>

      <div className="mt-auto border-t border-slate-200 bg-slate-50/60 p-6 sm:p-7">
        <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
          <span aria-hidden className="size-1.5 bg-blue-600" />
          <span className="whitespace-nowrap">포함 내용</span>
        </p>
        <ul className="mt-4 space-y-2.5">
          {item.bullets.map((b) => (
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
        <div className="mt-7">
          <a
            href={downloadUrl(item.object, item.saveAs)}
            aria-label={`${item.title} 무료 다운로드`}
            className="inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-slate-950 px-6 text-[14.5px] font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-blue-600"
          >
            <Download className="size-4 shrink-0" />
            무료 다운로드
          </a>
          <a
            href={assetUrl(item.object)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${item.title} 브라우저에서 미리 보기(새 창)`}
            className="mt-2.5 inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-full border border-slate-300 px-6 text-[13px] font-bold text-slate-700 transition hover:border-blue-400 hover:text-blue-700"
          >
            브라우저에서 미리 보기
          </a>
        </div>
      </div>
    </article>
  );
}

export default function SeptHakpyeongEnglishResourcePage() {
  const gradeGroups = GRADE_SECTIONS.map((g) => ({
    ...g,
    items: DOWNLOADS.filter((r) => r.object.includes(g.token)),
  })).filter((g) => g.items.length > 0);
  const ungrouped = DOWNLOADS.filter(
    (r) => !GRADE_SECTIONS.some((g) => r.object.includes(g.token)),
  );

  return (
    <div className="min-h-screen break-keep bg-white text-slate-900">
      <MarketingHeader />
      <JsonLd
        id="ld-resources-2026-09-hakpyeong-breadcrumb"
        data={breadcrumbSchema([
          { name: "스모트 SMOAT", url: "/" },
          { name: "무료자료실", url: "/resources" },
          { name: "2026년 9월 고1·고2 학력평가 영어 자료", url: PAGE_PATH },
        ])}
      />
      <JsonLd
        id="ld-resources-2026-09-hakpyeong-article"
        data={articleSchema({
          headline: TITLE,
          description: DESCRIPTION,
          url: absoluteUrl(PAGE_PATH),
          datePublished: PUBLISHED_ON,
        })}
      />
      <JsonLd
        id="ld-resources-2026-09-hakpyeong-faq"
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
              <span className="whitespace-nowrap text-slate-400">
                2026년 9월 고1·고2 학력평가 영어
              </span>
            </nav>

            <div className="mt-8 max-w-[1040px]">
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-blue-300">
                <span aria-hidden className="size-1.5 rounded-full bg-blue-400" />
                <span className="whitespace-nowrap">2026학년도 9월 전국연합학력평가 · 영어</span>
              </p>
              <h1 className="mt-5 text-[30px] font-black leading-[1.18] tracking-tight text-white sm:text-[42px] lg:text-[48px]">
                9월 학력평가 영어 20지문 분석 학습지
                <br className="hidden sm:block" /> 고1 · 고2 무료 다운로드
              </h1>
              <div className="mt-6 space-y-3.5">
                <p className="text-[16px] leading-[1.85] text-slate-300 sm:text-[17px]">
                  2026년 9월 2일 시행된 2026학년도 9월 전국연합학력평가(인천광역시교육청
                  주관, 16개 시·도교육청 공동) 영어 영역을 스모트 AI가 학년별로
                  분석했습니다. 고1·고2 각각 독해 20~45번 20지문을 지문마다 실전 5문항 ·
                  4컷 웹툰 · 개념 도식 · 직독직해 · 어법 판서 · 핵심 어휘로 풀어낸
                  학습지를 PDF로 배포합니다.
                </p>
                <p className="text-[14.5px] leading-[1.85] text-slate-400 sm:text-[15px]">
                  네 파일 모두 회원가입 없이 바로 내려받을 수 있습니다. 학원·학교 수업과
                  개인 학습에 자유롭게 쓰세요.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-[12.5px] font-bold text-slate-400">
                <span className="whitespace-nowrap">
                  <span className="text-white">PDF 4종</span> · 고1 · 고2 × 교사판 · 학생판
                </span>
                <span aria-hidden className="hidden size-1 rounded-full bg-slate-600 sm:block" />
                <span className="whitespace-nowrap">
                  학년별 <span className="text-white">20지문</span>
                </span>
                <span aria-hidden className="hidden size-1 rounded-full bg-slate-600 sm:block" />
                <span className="whitespace-nowrap">
                  변형 문항 <span className="text-white">200제</span> (두 학년 합계)
                </span>
                <span aria-hidden className="hidden size-1 rounded-full bg-slate-600 sm:block" />
                <span className="whitespace-nowrap">
                  <span className="text-white">회원가입 불필요</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* DOWNLOADS — 학년별 2열(제1 CTA) */}
        <section className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8 sm:py-20">
          <Eyebrow>무료 배포 · PDF 4종</Eyebrow>
          <h2 className="mt-3 text-[22px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[27px]">
            학년을 고르고 바로 내려받으세요
          </h2>
          <p className="mt-2.5 max-w-2xl text-[14.5px] leading-7 text-slate-600">
            모든 파일은 A4 PDF입니다. 다운로드 버튼을 누르면 바로 저장됩니다. 모든 쪽에
            SMOAT 워터마크가 옅게 들어 있습니다. 학생판은 교사판에서 권말 정답 일람표·해설만
            뺀 판입니다.
          </p>

          <div className="mt-9 grid grid-cols-1 gap-x-6 gap-y-10 lg:grid-cols-2">
            {gradeGroups.map((g) => (
              <div key={g.id} id={`grade-${g.id}`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-200 pb-4">
                  <span className="inline-flex h-8 items-center whitespace-nowrap rounded-full bg-slate-950 px-3.5 text-[13px] font-black tracking-tight text-white">
                    {g.label}
                  </span>
                  <h3 className="text-[18px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[20px]">
                    {g.heading}
                  </h3>
                  <p className="w-full text-[12.5px] font-bold leading-5 text-slate-500 sm:w-auto">
                    {g.note}
                  </p>
                </div>
                <div className="mt-5 space-y-5">
                  {g.items.map((item, i) => (
                    <DownloadCard key={item.key} item={item} no={i + 1} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {ungrouped.length > 0 && (
            <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
              {ungrouped.map((item, i) => (
                <DownloadCard key={item.key} item={item} no={i + 1} />
              ))}
            </div>
          )}

          {/* 학년별 수록량 */}
          <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50/70 p-6 sm:p-8">
            <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
              <span aria-hidden className="size-1.5 bg-blue-600" />
              <span className="whitespace-nowrap">한 학년 학습지에 담긴 것</span>
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
              {VOLUME_STATS.map((s) => (
                <div key={s.label}>
                  <dt className="text-[13px] font-bold leading-5 text-slate-500">{s.label}</dt>
                  <dd className="mt-1 text-[22px] font-black leading-tight tracking-tight text-slate-950 sm:text-[24px]">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
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
                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-300">
                  SMOAT AI
                </p>
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
              고1·고2 학습지에서 뽑은 실제 쪽입니다. 내려받은 PDF의 20지문이 모두 같은
              구성으로 이어집니다.
            </p>
            <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {PREVIEWS.map((p) => {
                // 캡션이 이미 학년으로 시작하면 대체 텍스트에서 학년을 겹쳐 읽지 않는다.
                const label = p.caption.startsWith(p.source)
                  ? p.caption
                  : `${p.source} ${p.caption}`;
                return (
                  <li
                    key={p.object}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)]"
                  >
                    <a
                      href={assetUrl(p.object)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${label} 미리보기 크게 보기(새 창)`}
                      className="block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={assetUrl(p.object)}
                        alt={`${label} 미리보기`}
                        width={1242}
                        height={1754}
                        loading="lazy"
                        className="aspect-[1242/1754] w-full bg-slate-100 object-cover"
                      />
                      <div className="px-3.5 py-3">
                        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-blue-600">
                          {p.source}
                        </p>
                        <p className="mt-1 text-[12.5px] font-bold leading-5 text-slate-800">
                          {p.caption}
                        </p>
                      </div>
                    </a>
                  </li>
                );
              })}
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

        {/* EXAM FACTS — 이 자료가 다루는 시험 */}
        <section className="border-t border-slate-100">
          <div className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8 sm:py-16">
            <Eyebrow>이 자료가 다루는 시험</Eyebrow>
            <h2 className="mt-3 text-[22px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[26px]">
              2026학년도 9월 전국연합학력평가 영어 영역
            </h2>
            <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {EXAM_FACTS.map((f) => (
                <div key={f.term} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <dt className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-600">
                    {f.term}
                  </dt>
                  <dd className="mt-2.5 text-[14.5px] font-bold leading-7 text-slate-800">
                    {f.detail}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 max-w-3xl text-[13.5px] leading-7 text-slate-500">
              전국연합학력평가의 학년도는 학교 학년도(2026년 3월~2027년 2월)를 따릅니다.
              그래서 2026학년도 9월 학력평가는 2026년 9월에 시행된 시험을 가리킵니다.
            </p>
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
              한 번에 끝납니다. 다음 학력평가 대비는 스모트와 함께 시작해 보세요.
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
