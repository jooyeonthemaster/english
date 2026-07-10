import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { MarketingHeader } from "@/components/seo/marketing-header";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { absoluteUrl } from "@/lib/seo/config";
import { breadcrumbSchema } from "@/lib/seo/structured-data";
import glossaryJson from "@/lib/seo/glossary-content.json";

/**
 * 영어 내신·수능 용어사전 — "동형문제란", "변형문제 뜻" 류 정의형 검색을 정조준.
 * 각 항목은 정의문 우선(네이버 지식스니펫·구글 피처드스니펫 최적화 — 용어명 → 정의 첫 문장 순서 유지).
 *
 * 디자인: "잉크 에디토리얼" — 딥 네이비 히어로 + 초성 점프 내비 + 하이라인 초성 조판 + 용어 카드 그리드.
 * 서버 컴포넌트(전 텍스트 크롤가능). 초성 점프는 앵커 링크만으로 동작(JS 0).
 */

type GlossaryTerm = {
  term: string;
  termEn?: string;
  definition: string;
};

const TERMS = glossaryJson as unknown as GlossaryTerm[];

export const metadata: Metadata = buildMetadata({
  title: "영어 내신·수능 용어사전 — 변형문제·동형문제·킬러문항",
  description:
    "변형문제, 동형문제, 킬러문항, 오답률, 연계교재 등 영어 내신·수능에서 쓰이는 용어를 한 줄 정의와 함께 정리한 용어사전입니다. 영어학원 AI 올인원 스모트(SMOAT).",
  path: "/glossary",
  keywords: [
    "변형문제 뜻",
    "동형문제란",
    "킬러문항 뜻",
    "영어 내신 용어",
    "수능 영어 용어",
    "EBS 연계교재란",
  ],
});

function definedTermSetSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: "영어 내신·수능 용어사전",
    url: absoluteUrl("/glossary"),
    hasDefinedTerm: TERMS.map((t) => ({
      "@type": "DefinedTerm",
      name: t.term,
      ...(t.termEn ? { alternateName: t.termEn } : {}),
      description: t.definition,
    })),
  } as const;
}

/* ------------------------------------------------------------------ */
/* 초성 그룹핑(렌더 전용 — 데이터 원본은 그대로)                          */
/* ------------------------------------------------------------------ */

const CHOSEONG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

/** 쌍자음은 기본 자음 그룹으로 병합(사전 관례). */
const CHOSEONG_MERGE: Record<string, string> = {
  ㄲ: "ㄱ",
  ㄸ: "ㄷ",
  ㅃ: "ㅂ",
  ㅆ: "ㅅ",
  ㅉ: "ㅈ",
};

const GROUP_ORDER = [
  "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ",
  "ㅋ", "ㅌ", "ㅍ", "ㅎ", "#",
] as const;

function initialGroupKey(term: string): string {
  const code = term.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const cho = CHOSEONG[Math.floor((code - 0xac00) / 588)];
    return CHOSEONG_MERGE[cho] ?? cho;
  }
  return "#";
}

type GlossaryGroup = {
  key: string;
  /** 섹션 제목·칩에 쓰는 라벨. */
  label: string;
  /** 칩 전용 짧은 라벨. */
  chipLabel: string;
  /** 좌측 거대 헤어라인 문자. */
  display: string;
  terms: GlossaryTerm[];
};

function buildGroups(terms: GlossaryTerm[]): GlossaryGroup[] {
  const byKey = new Map<string, GlossaryTerm[]>();
  for (const t of terms) {
    const key = initialGroupKey(t.term);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(t);
    else byKey.set(key, [t]);
  }
  return GROUP_ORDER.filter((key) => byKey.has(key)).map((key) => ({
    key,
    label: key === "#" ? "영문·숫자" : key,
    chipLabel: key === "#" ? "A·0–9" : key,
    display: key,
    terms: (byKey.get(key) ?? [])
      .slice()
      .sort((a, b) => a.term.localeCompare(b.term, "ko")),
  }));
}

/** "ㄱ으로 / 영문·숫자로" — 받침 유무에 맞춘 조사. */
function groupJosa(key: string): string {
  if (key === "#") return "로";
  if (key === "ㄹ") return "로";
  return "으로";
}

/**
 * 정의 첫 문장 분리(시각 강조 전용 — 텍스트 순서·내용은 원문 그대로).
 * 지식스니펫 타깃인 첫 문장을 잉크 톤으로 세운다.
 */
function splitFirstSentence(definition: string): [string, string] {
  const m = definition.match(/^([\s\S]*?다\.)\s+([\s\S]*)$/);
  if (!m) return [definition, ""];
  return [m[1], m[2]];
}

const INK_GRID_PATTERN =
  "[background-image:linear-gradient(to_right,rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.09)_1px,transparent_1px)] [background-size:44px_44px]";

const RELATED_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  description: string;
}> = [
  {
    href: "/types",
    label: "유형백과",
    description: "수능·내신 전 유형의 출제 원리를 해부합니다.",
  },
  {
    href: "/faq",
    label: "자주 묻는 질문",
    description: "스모트 도입 전 궁금한 점을 정리했습니다.",
  },
  {
    href: "/guides",
    label: "제작 가이드",
    description: "문제·시험지 제작 실전 노하우를 담았습니다.",
  },
];

function TermCard({ term, order }: { term: GlossaryTerm; order: number }) {
  const [first, rest] = splitFirstSentence(term.definition);
  return (
    <div className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)] sm:p-6">
      <dt className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="flex items-start gap-2 text-[17px] font-black leading-6 tracking-tight text-slate-950 transition-colors group-hover:text-blue-700">
            <span aria-hidden className="mt-[9px] size-1.5 shrink-0 bg-blue-600" />
            {term.term}
          </span>
          {term.termEn && (
            <span className="text-[12px] font-semibold leading-5 text-slate-500">
              {term.termEn}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className="shrink-0 select-none text-[12px] font-black leading-6 text-slate-300 tabular-nums"
        >
          {String(order).padStart(2, "0")}
        </span>
      </dt>
      <dd className="mt-3.5 border-t border-slate-100 pt-3.5 text-[14px] leading-[1.85] text-slate-600">
        <span className="font-semibold text-slate-800">{first}</span>
        {rest ? ` ${rest}` : null}
      </dd>
    </div>
  );
}

export default function GlossaryPage() {
  const groups = buildGroups(TERMS);

  return (
    <div className="min-h-screen break-keep bg-white text-slate-900">
      <MarketingHeader />
      <JsonLd
        id="ld-glossary"
        data={[
          breadcrumbSchema([
            { name: "스모트 SMOAT", url: "/" },
            { name: "용어사전", url: "/glossary" },
          ]),
          ...(TERMS.length > 0 ? [definedTermSetSchema()] : []),
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
          <div className="relative mx-auto max-w-[1480px] px-5 pb-14 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
            <nav
              aria-label="breadcrumb"
              className="flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-slate-400"
            >
              <Link href="/" className="whitespace-nowrap transition hover:text-white">
                스모트
              </Link>
              <span aria-hidden>›</span>
              <span className="whitespace-nowrap text-slate-400">용어사전</span>
            </nav>

            <div className="mt-8 max-w-[1000px]">
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-blue-300">
                <span aria-hidden className="size-1.5 rounded-full bg-blue-400" />
                Glossary — 용어사전
              </p>
              <h1 className="mt-5 text-[32px] font-black leading-[1.18] tracking-tight text-white sm:text-[44px] lg:text-[50px]">
                영어 내신·수능 용어사전
              </h1>
              <div className="mt-6 space-y-3.5">
                <p className="text-[16px] leading-[1.85] text-slate-300 sm:text-[17px]">
                  변형문제, 동형문제, 킬러문항, 연계교재 — 영어 내신과 수능
                  대비에서 매일 쓰이는 용어를 정확한 정의와 함께 정리했습니다.
                </p>
                <p className="text-[14.5px] leading-[1.85] text-slate-400 sm:text-[15px]">
                  모든 항목은 정의문을 먼저 제시합니다. 초성 점프로 원하는
                  용어를 바로 찾아 확인할 수 있습니다.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-[12.5px] font-bold text-slate-400">
                <span className="whitespace-nowrap">
                  수록 용어 <span className="text-white">{TERMS.length}개</span>
                </span>
                <span aria-hidden className="hidden size-1 rounded-full bg-slate-600 sm:block" />
                <span className="whitespace-nowrap">
                  초성 그룹 <span className="text-white">{groups.length}개</span>
                </span>
                <span aria-hidden className="hidden size-1 rounded-full bg-slate-600 sm:block" />
                <span className="whitespace-nowrap">정의문 우선 구성</span>
              </div>
            </div>
          </div>
        </section>

        {TERMS.length === 0 ? (
          <section className="mx-auto max-w-[1480px] px-5 py-16 sm:px-8">
            <p className="text-[15px] text-slate-500">콘텐츠를 준비 중입니다.</p>
          </section>
        ) : (
          <>
            {/* 초성 점프 내비 — 앵커만으로 동작(md 이상 sticky) */}
            <nav
              aria-label="초성 점프"
              className="border-b border-slate-200 bg-white md:sticky md:top-16 md:z-30"
            >
              <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-2 px-5 py-3.5 sm:px-8">
                <p className="mr-2 flex items-center gap-2 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
                  <span aria-hidden className="size-1.5 bg-blue-600" />
                  초성 점프
                </p>
                {groups.map((group, gi) => (
                  <a
                    key={group.key}
                    href={`#group-${gi + 1}`}
                    className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3.5 text-[13px] font-extrabold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {group.chipLabel}
                    <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                      {group.terms.length}
                    </span>
                  </a>
                ))}
              </div>
            </nav>

            {/* 초성 그룹 섹션 */}
            <div className="mx-auto max-w-[1480px] px-5 py-12 sm:px-8 sm:py-16">
              {groups.map((group, gi) => (
                <section
                  key={group.key}
                  id={`group-${gi + 1}`}
                  className="mt-14 scroll-mt-24 border-t border-slate-200 pt-10 first:mt-0 first:border-t-0 first:pt-0 md:scroll-mt-48 lg:scroll-mt-36"
                >
                  <div className="flex items-center gap-4 sm:gap-5">
                    <span
                      aria-hidden
                      className="select-none text-[44px] font-black leading-[0.9] tracking-tight text-slate-200 sm:text-[56px]"
                    >
                      {group.display}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-600">
                        <span aria-hidden className="size-1.5 bg-blue-600" />
                        Index {String(gi + 1).padStart(2, "0")}
                      </p>
                      <h2 className="mt-1 text-[19px] font-black leading-[1.3] tracking-tight text-slate-950 sm:text-[23px]">
                        {group.label}
                        {groupJosa(group.key)} 시작하는 용어
                      </h2>
                    </div>
                    <span className="ml-auto whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-extrabold text-slate-500 tabular-nums">
                      {group.terms.length}개
                    </span>
                  </div>

                  <dl className="mt-6 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                    {group.terms.map((t, ti) => (
                      <TermCard key={t.term} term={t} order={ti + 1} />
                    ))}
                  </dl>
                </section>
              ))}
            </div>

            {/* 함께 보면 좋은 콘텐츠 */}
            <section className="border-t border-slate-200 bg-slate-50/60">
              <div className="mx-auto max-w-[1480px] px-5 py-14 sm:px-8">
                <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-400">
                  <span aria-hidden className="size-1.5 bg-blue-600" />
                  함께 보면 좋은 콘텐츠
                </p>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {RELATED_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_20px_60px_-40px_rgba(37,99,235,0.45)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="whitespace-nowrap text-[14.5px] font-extrabold leading-6 text-slate-950 transition-colors group-hover:text-blue-700">
                          {link.label}
                        </span>
                        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                      </div>
                      <p className="mt-1.5 text-[12.5px] leading-5 text-slate-500">
                        {link.description}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          </>
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
              용어를 알았다면, 이제 문제로 만들 차례입니다
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[14.5px] leading-[1.85] text-slate-300">
              변형문제·동형문제·서술형 — 방금 확인한 그 용어들을 스모트가 실제
              문항으로 만들어 드립니다. 지문만 붙여넣으면 수능·내신 전 유형이 1분
              안에 출제됩니다.
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
