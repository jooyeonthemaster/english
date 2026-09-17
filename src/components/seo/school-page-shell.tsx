import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, ExternalLink } from "lucide-react";
import { MarketingHeader } from "@/components/seo/marketing-header";
import { SchoolChartBlock } from "@/components/seo/school-charts";
import { SchoolToc, SchoolConversionRail, SchoolStickyBar } from "@/components/seo/school-rails";
import {
  SCHOOL_HUB,
  schoolPath,
  sidoPath,
  textbookHrefFor,
  type SchoolPageEntry,
  type SchoolSummary,
} from "@/lib/seo/schools-content";

/**
 * 학교별 내신 페이지 셸(서버 컴포넌트 — 본문 전부 크롤가능 텍스트).
 *
 * 레이아웃 원칙 — 「가운데 좁은 한 줄」을 버린다.
 *   · 컨테이너 1560px. xl 이상에서 [목차 200 | 본문 1fr | 전환레일 340] 3분할.
 *   · 차트는 본문 폭을 꽉 채워 2~3열로 편다(데이터는 넓을수록 읽힌다).
 *   · 전환 동선을 4겹으로 깐다: 히어로 · 우측 상시 레일 · 본문 중간 인라인 밴드 ·
 *     하단 고정 바(+ 말미 대형 CTA). 어느 스크롤 위치에서도 진입로가 보인다.
 */

/**
 * 일정 배지 — 브랜드 블루 계열 안에서만 구분한다.
 * 학교 자체 시험(중간·기말)은 채도를 주고, 외부 시행(모의고사·학평)은 중립으로 눕힌다.
 */
const KIND_STYLE: Record<string, string> = {
  중간고사: "border-blue-600 bg-blue-600 text-white",
  기말고사: "border-blue-200 bg-blue-50 text-blue-700",
  모의고사: "border-slate-200 bg-slate-100 text-slate-500",
  학력평가: "border-slate-200 bg-slate-100 text-slate-500",
  기타: "border-slate-200 bg-slate-50 text-slate-400",
};

/**
 * 목차 라벨 — 글자수로 자르지 않는다.
 * 「—」「(」 같은 구분자 앞의 의미 단위만 취하고, 그래도 길면 CSS truncate 가 처리한다.
 * (slice(0,22) 로 자르면 「영어 이수 구」처럼 단어가 토막 난다.)
 */
function tocLabel(heading: string): string {
  const cut = heading.split(/\s*[—–(（\[「]/)[0].trim();
  return cut.replace(/[\s·,]+$/, "") || heading;
}

/** 히어로 지표 스트립에 올릴 값 3~4개를 데이터에서 뽑는다. */
function heroStats(page: SchoolPageEntry) {
  const out: { k: string; v: string; sub?: string }[] = [];

  const exam = page.timeline.find((t) => t.kind === "중간고사" || t.kind === "기말고사");
  if (exam) out.push({ k: "다음 정기시험", v: exam.when, sub: exam.what.slice(0, 22) });

  // 서답형/논술형 배점을 다루는 차트에서 최대값을 끌어온다.
  const seodap = page.charts.find((c) => /서답형|논술형|서·논술/.test(c.title));
  if (seodap && seodap.series.length > 0) {
    const top = seodap.series.reduce((a, b) => (b.value > a.value ? b : a));
    out.push({ k: "서답형 배점", v: `${top.value}${seodap.unit ?? ""}`, sub: top.label.slice(0, 22) });
  }

  if (page.publisher) out.push({ k: "채택 교과서", v: page.publisher });
  if (page.textbooks.length > 0) out.push({ k: "확인된 교재", v: `${page.textbooks.length}종` });
  if (out.length < 3) out.push({ k: "자료 충실도", v: page.richness, sub: `공시 근거 ${page.citedRatio}%` });

  return out.slice(0, 4);
}

/**
 * 「1학기 1회고사 — 4월 27일~30일 (학년별 시작일 상이)」 같은 한 문장을
 * 라벨/디테일로 쪼갠다. 좁은 레일에서 문장이 두 줄로 꺾이는 걸 구조적으로 막는다.
 */
function splitExam(what: string): { label: string; detail: string | null } {
  const noParen = what.replace(/\s*[(（][^)）]*[)）]\s*/g, " ").trim();
  const parts = noParen.split(/\s*[—–-]\s*/);
  const label = (parts[0] ?? noParen).trim();
  const detail = parts.length > 1 ? parts.slice(1).join(" ").trim() : null;
  return { label: label || what, detail: detail || null };
}

/** 우측 레일에 띄울 후킹 한 줄 — 그 학교 숫자를 근거로 말한다. */
function railHook(page: SchoolPageEntry): { statLabel: string; stat: string; line: string } | null {
  const seodap = page.charts.find((c) => /서답형|논술형|서·논술/.test(c.title));
  if (seodap && seodap.series.length > 0) {
    const top = seodap.series.reduce((a, b) => (b.value > a.value ? b : a));
    return {
      statLabel: "서답형 최대",
      stat: `${top.value}${seodap.unit ?? ""}`,
      line: "서술형 문항 없이는 대비가 반쪽입니다.",
    };
  }
  if (page.textbooks.length > 0) {
    return {
      statLabel: "확인된 교재",
      stat: `${page.textbooks.length}종`,
      line: "지문만 넣으면 변형문제가 나옵니다.",
    };
  }
  return null;
}

export function SchoolPageShell({
  page,
  siblingsPublisher,
  siblingsSido,
}: {
  page: SchoolPageEntry;
  siblingsPublisher: SchoolSummary[];
  siblingsSido: SchoolSummary[];
}) {
  const textbookHref = textbookHrefFor(page.publisher);
  const updated = page.updatedAt.toISOString().slice(0, 10).replaceAll("-", ".");
  const stats = heroStats(page);
  const hook = railHook(page);
  const nextExam = page.timeline.find((t) => t.kind === "중간고사" || t.kind === "기말고사") ?? null;

  const toc = [
    ...(page.charts.length ? [{ id: "overview", label: "한눈에 보기", full: "한눈에 보기" }] : []),
    ...(page.timeline.length ? [{ id: "schedule", label: "시험 일정", full: "시험 일정" }] : []),
    ...(page.comparisonTable?.rows?.length ? [{ id: "table", label: "과목 구성", full: "과목 구성" }] : []),
    ...page.sections.map((s, i) => ({ id: `s-${i}`, label: tocLabel(s.heading), full: s.heading })),
    ...(page.checklist.length ? [{ id: "checklist", label: "대비 체크리스트", full: "대비 체크리스트" }] : []),
    ...(page.faq.length ? [{ id: "faq", label: "자주 묻는 질문", full: "자주 묻는 질문" }] : []),
  ];

  const mid = Math.min(2, Math.max(0, page.sections.length - 1));

  return (
    <div className="bg-white">
      <MarketingHeader />

      {/* ── 히어로: 좌 타이틀 / 우 지표판 ── */}
      <header className="relative overflow-hidden bg-slate-950">
        <div
          aria-hidden
          className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.07)_1px,transparent_1px)] [background-size:52px_52px]"
        />
        <div
          aria-hidden
          className="absolute -right-40 -top-40 size-[520px] rounded-full bg-blue-600/15 blur-3xl"
        />
        <div className="relative mx-auto max-w-[1560px] px-5 py-14 sm:px-8 lg:py-20">
          <nav aria-label="위치" className="flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-slate-400">
            <Link href="/" className="transition hover:text-white">스모트</Link>
            <span aria-hidden>/</span>
            <Link href={SCHOOL_HUB.path} className="transition hover:text-white">{SCHOOL_HUB.label}</Link>
            <span aria-hidden>/</span>
            <Link href={sidoPath(page.sido)} className="transition hover:text-white">{page.sido}</Link>
          </nav>

          <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
            <div>
              <h1 className="text-balance break-keep text-[30px] font-black leading-[1.15] tracking-tight text-white sm:text-[42px] lg:text-[50px]">
                {page.h1}
              </h1>
              <p className="mt-4 text-[13px] font-semibold text-slate-400">
                {[page.schoolType, page.region].filter(Boolean).join(" · ")}
                <span className="mx-2 text-slate-600">|</span>
                갱신 {updated}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[14.5px] font-black text-slate-950 transition hover:bg-blue-50"
                >
                  {page.slug} 대비 자료 만들기
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                {page.homepage ? (
                  <a
                    href={page.homepage}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3.5 text-[14px] font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    학교 홈페이지
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </div>
            </div>

            {/* 지표판 — 칩 나열 대신 수치를 세로로 정렬 */}
            {stats.length > 0 ? (
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                {stats.map((s) => (
                  <div key={s.k} className="bg-slate-950 px-5 py-5">
                    <dt className="text-[10.5px] font-black uppercase tracking-[0.14em] text-slate-500">{s.k}</dt>
                    <dd className="mt-2 font-mono text-[21px] font-black tabular-nums leading-none text-white">
                      {s.v}
                    </dd>
                    {s.sub ? (
                      <dd className="mt-1.5 truncate text-[11.5px] font-semibold text-slate-400">{s.sub}</dd>
                    ) : null}
                  </div>
                ))}
              </dl>
            ) : null}
          </div>

          {page.intro[0] ? (
            <p className="mt-10 max-w-4xl text-pretty break-keep text-[16px] leading-[1.9] text-slate-300 lg:text-[17.5px]">
              {page.intro[0]}
            </p>
          ) : null}
        </div>
      </header>

      {/* ── 3분할 본문 ── */}
      <div className="mx-auto max-w-[1560px] px-5 pb-24 pt-12 sm:px-8 lg:pt-16">
        <div className="grid gap-x-12 gap-y-10 xl:grid-cols-[190px_minmax(0,1fr)_330px]">
          <div className="hidden xl:block">
            <SchoolToc items={toc} />
          </div>

          <main className="min-w-0">
            {page.intro.slice(1).map((p, i) => (
              <p key={i} className="mb-4 text-pretty break-keep text-[16px] leading-[1.95] text-slate-700">
                {p}
              </p>
            ))}

            {/* 차트 */}
            {page.charts.length > 0 ? (
              <section aria-labelledby="overview" className="scroll-mt-28 pt-6" id="overview">
                <SectionHead n="01" title={`한눈에 보는 ${page.slug} 영어 내신`} />
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {page.charts.map((c) => (
                    <SchoolChartBlock key={c.title} chart={c} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* 시험 일정 */}
            {page.timeline.length > 0 ? (
              <section aria-labelledby="schedule" className="scroll-mt-28 pt-16" id="schedule">
                <SectionHead n="02" title={`${page.slug} 시험 일정`} />
                <ol className="mt-6 grid gap-x-8 gap-y-0 sm:grid-cols-2">
                  {page.timeline.map((t, i) => (
                    <li key={`${t.when}-${i}`} className="relative border-l-2 border-slate-200 py-3 pl-6">
                      <span
                        aria-hidden
                        className="absolute -left-[7px] top-4 size-3 rounded-full border-2 border-white bg-blue-600"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <time className="font-mono text-[13.5px] font-black tabular-nums text-slate-900">{t.when}</time>
                        {t.kind ? (
                          <span className={`rounded border px-1.5 py-0.5 text-[10.5px] font-black ${KIND_STYLE[t.kind] ?? KIND_STYLE.기타}`}>
                            {t.kind}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 break-keep text-[14.5px] leading-relaxed text-slate-700">{t.what}</p>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {/* 비교표 */}
            {page.comparisonTable && page.comparisonTable.rows.length > 0 ? (
              <section aria-labelledby="table" className="scroll-mt-28 pt-16" id="table">
                <SectionHead n="03" title={page.comparisonTable.title ?? "과목·평가 구성"} />
                <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full min-w-[980px] border-collapse text-[14px]">
                    <thead>
                      <tr className="bg-slate-50">
                        {page.comparisonTable.headers.map((h) => (
                          <th key={h} scope="col" className="whitespace-nowrap border-b border-slate-200 px-4 py-3 text-left text-[11.5px] font-black uppercase tracking-wider text-slate-500">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {page.comparisonTable.rows.map((row, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0 even:bg-slate-50/40">
                          {row.map((cell, j) => (
                            <td key={j} className={`px-4 py-3 align-top break-keep text-slate-700 ${
                                j === 0
                                  ? "whitespace-nowrap font-bold text-slate-900"
                                  : j === row.length - 1
                                    ? "min-w-[220px]"
                                    : "whitespace-nowrap"
                              }`}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {/* 본문 섹션 + 중간 인라인 전환 밴드 */}
            {page.sections.map((s, i) => (
              <div key={s.heading}>
                <section aria-labelledby={`s-${i}`} className="scroll-mt-28 pt-16" id={`s-${i}`}>
                  <SectionHead n={String(i + 4).padStart(2, "0")} title={s.heading} />
                  {s.paragraphs.map((p, j) => (
                    <p key={j} className="mt-4 text-pretty break-keep text-[16px] leading-[1.95] text-slate-700">
                      {p}
                    </p>
                  ))}
                  {s.bullets && s.bullets.length > 0 ? (
                    <ul className="mt-6 grid gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-6 sm:grid-cols-2">
                      {s.bullets.map((b, j) => (
                        <li key={j} className="flex gap-2.5 break-keep text-[14.5px] leading-relaxed text-slate-700">
                          <Check className="mt-1 size-4 shrink-0 text-blue-700" aria-hidden />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {s.callout ? (
                    <p className="mt-6 break-keep rounded-2xl border-l-4 border-blue-600 bg-blue-50/80 px-6 py-5 text-[16px] font-bold leading-[1.8] text-slate-900">
                      {s.callout}
                    </p>
                  ) : null}
                </section>

                {i === mid ? <InlineCta school={page.slug} /> : null}
              </div>
            ))}

            {/* 체크리스트 */}
            {page.checklist.length > 0 ? (
              <section aria-labelledby="checklist" className="scroll-mt-28 pt-16" id="checklist">
                <SectionHead n="09" title="강사용 대비 체크리스트" />
                <ul className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
                  {page.checklist.map((c, i) => (
                    <li key={i} className="flex items-start gap-3 bg-white px-5 py-4">
                      <span aria-hidden className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border-2 border-slate-300" />
                      <span className="flex-1 break-keep text-[14.5px] leading-relaxed text-slate-700">{c.item}</span>
                      {c.when ? (
                        <span className="shrink-0 rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-black text-white">
                          {c.when}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* 교재 */}
            {page.textbooks.length > 0 ? (
              <section className="scroll-mt-28 pt-16">
                <SectionHead n="10" title="확인된 교과서·부교재" />
                <ul className="mt-6 flex flex-wrap gap-2">
                  {page.textbooks.map((t) => (
                    <li key={t} className="break-keep rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-[13.5px] font-semibold leading-relaxed text-slate-700">
                      {t}
                    </li>
                  ))}
                </ul>
                {textbookHref ? (
                  <Link href={textbookHref} className="mt-5 inline-flex items-center gap-1.5 text-[14.5px] font-black text-blue-700 hover:underline">
                    {page.publisher} 교과서 변형문제 제작 가이드
                    <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                ) : null}
              </section>
            ) : null}

            {/* FAQ */}
            {page.faq.length > 0 ? (
              <section aria-labelledby="faq" className="scroll-mt-28 pt-16" id="faq">
                <SectionHead n="11" title="자주 묻는 질문" />
                <dl className="mt-6 divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {page.faq.map((f) => (
                    <div key={f.question} className="px-6 py-5">
                      <dt className="break-keep text-[15.5px] font-black leading-[1.5] text-slate-900">{f.question}</dt>
                      <dd className="mt-2 break-keep text-[14.5px] leading-relaxed text-slate-700">{f.answer}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
          </main>

          <div className="hidden xl:block">
            <SchoolConversionRail
              schoolShort={page.slug}
              hook={hook}
              publisher={page.publisher}
              textbookHref={textbookHref}
              nextExam={
                nextExam
                  ? { when: nextExam.when, what: nextExam.what, ...splitExam(nextExam.what) }
                  : null
              }
            />
          </div>
        </div>

        {/* ── 말미 대형 CTA (전폭) ── */}
        <section
          id="school-final-cta"
          className="relative mt-20 overflow-hidden rounded-3xl bg-slate-950 px-6 py-14 sm:px-12 lg:px-16 lg:py-20"
        >
          <div
            aria-hidden
            className="absolute -left-32 -top-32 size-[420px] rounded-full bg-blue-600/20 blur-3xl"
          />
          <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <h2 className="text-balance break-keep text-[26px] font-black leading-[1.35] tracking-tight text-white sm:text-[34px]">
                {page.ctaTitle ?? `${page.officialName} 대비 자료, 지문만 넣으면 완성됩니다`}
              </h2>
              <p className="mt-5 max-w-2xl break-keep text-[15.5px] leading-[1.9] text-slate-300">
                {page.ctaBody ??
                  "교과서·부교재 지문을 붙여넣으면 빈칸·어법·순서·삽입·서술형 문항이 정답과 해설까지 함께 생성됩니다. 학생용 시험지와 강사용 해설지를 분리한 Word·한글·PDF 파일로 바로 출력할 수 있습니다."}
              </p>
              <Link
                href="/register"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-4 text-[15.5px] font-black text-slate-950 transition hover:bg-blue-50"
              >
                무료로 시작하기
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <ul className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
              {[
                "지문 1개로 8개 유형 자동 변형",
                "조건 영작·요약 등 서술형 문항 포함",
                "Word·한글·PDF 즉시 출력",
                "학생용 시험지와 해설지 자동 분리",
              ].map((t) => (
                <li key={t} className="flex items-center gap-3 break-keep bg-slate-950 px-6 py-4 text-[14px] font-bold text-slate-200">
                  <Check className="size-4 shrink-0 text-blue-400" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── 내부링크 ── */}
        {siblingsPublisher.length > 0 || siblingsSido.length > 0 ? (
          <nav aria-labelledby="related" className="mt-16">
            <h2 id="related" className="text-[19px] font-black tracking-tight text-slate-900">함께 보면 좋은 학교</h2>
            {siblingsPublisher.length > 0 ? (
              <>
                <p className="mt-5 text-[13px] font-bold text-slate-500">같은 교과서({page.publisher})를 쓰는 학교</p>
                <ul className="mt-2.5 flex flex-wrap gap-2">
                  {siblingsPublisher.map((s) => (
                    <li key={`${s.sido}-${s.slug}`}>
                      <Link href={schoolPath(s)} className="inline-block break-keep rounded-xl border border-slate-200 px-4 py-2.5 text-[13.5px] font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700">
                        {s.slug} <span className="font-semibold text-slate-400">{s.sido}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {siblingsSido.length > 0 ? (
              <>
                <p className="mt-6 text-[13px] font-bold text-slate-500">{page.sido} 지역 다른 학교</p>
                <ul className="mt-2.5 flex flex-wrap gap-2">
                  {siblingsSido.map((s) => (
                    <li key={`${s.sido}-${s.slug}`}>
                      <Link href={schoolPath(s)} className="inline-block break-keep rounded-xl border border-slate-200 px-4 py-2.5 text-[13.5px] font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700">
                        {s.slug}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <Link href={sidoPath(page.sido)} className="mt-7 inline-flex items-center gap-1.5 text-[14.5px] font-black text-blue-700 hover:underline">
              {page.sido} 전체 학교 보기
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </nav>
        ) : null}

        <footer className="mt-16 rounded-2xl border border-slate-200 bg-slate-50/70 px-6 py-6 text-[12.5px] leading-relaxed text-slate-500">
          <p className="font-bold text-slate-600">데이터 출처</p>
          {page.sourcesUsed.length > 0 ? (
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {page.sourcesUsed.slice(0, 8).map((u) => (
                <li key={u} className="truncate">{u}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-4 break-keep border-t border-slate-200 pt-4 leading-[1.75]">
            본 페이지는 학교 홈페이지·교육청 등 공개된 정보를 정리한 것이며, 해당 학교와 제휴·후원 관계가 없습니다.
            스모트는 학교 기출문제를 제공하지 않으며, 게시된 예시는 전량 자체 창작입니다. 정보가 실제와 다를 경우 정정 요청을 받습니다.
          </p>
        </footer>
      </div>

      <SchoolStickyBar schoolShort={page.slug} />
    </div>
  );
}

function SectionHead({ n, title }: { n: string; title: string }) {
  return (
    <h2 className="flex items-baseline gap-3 text-balance break-keep text-[23px] font-black leading-[1.35] tracking-tight text-slate-900 sm:text-[28px]">
      <span className="font-mono text-[13px] font-bold text-blue-700">{n}</span>
      {title}
    </h2>
  );
}

/** 본문 중간에 끼우는 인라인 전환 밴드 — 스크롤 중간 이탈을 잡는다. */
function InlineCta({ school }: { school: string }) {
  return (
    <div className="mt-16 flex flex-col items-start gap-5 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-7 py-7 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="break-keep text-[17px] font-black leading-[1.45] tracking-tight text-slate-900">
          {school} 시험 범위 지문, 문항으로 바꾸는 데 3분이면 됩니다
        </p>
        <p className="mt-1.5 break-keep text-[13.5px] font-semibold text-slate-600">
          지문 붙여넣기 → 유형 선택 → Word·한글·PDF 출력
        </p>
      </div>
      <Link
        href="/register"
        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-6 py-3.5 text-[14px] font-black text-white transition hover:bg-slate-800"
      >
        무료로 만들어 보기
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
