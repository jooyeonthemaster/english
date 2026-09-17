"use client";

// ============================================================================
// 공개 시험지 분석 리포트 — 본문 (모바일 우선 · 인쇄 대응)
//
// 구성: sticky 섹션 목차 → 표지 카드(제목·메타·지표 4) → 01 총평 → 02 난이도
// 프로필 → 03 유형 분포 → 04 오답 설계 → 05 출제 범위 → 06 문항별 분석.
// 학부모·학생이 카카오톡 링크로 열어 세로로 읽는 문서다 — 데스크톱 표는 쓰지 않고
// 전부 카드·바·칩으로 조판한다. 난이도 색은 레일 [총평] 탭과 같은 신호등
// (쉬움 emerald · 보통 blue · 어려움 amber · 킬러 rose), 버킷 경계도 synthesis.ts 와
// 동일(1~2 쉬움 · 3 보통 · 4 어려움 · 5 킬러).
// 인쇄: 접힌 해설·함정은 beforeprint 에 전부 펼친다(접힌 채 인쇄되는 사고 방지).
// 폰트: 학생 리포트 기본 서체(Pretendard)를 같은 로더로 실로드 — 두 공개 리포트가
// 한 가족으로 보이게. 계약 타입·토큰은 exam-public-shared.ts, 문항 카드는
// exam-public-question-card.tsx(500줄 상한 분리).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExamLevelAnalysis } from "@/lib/exam-report/types";
import {
  ensureReportFonts,
  reportFontStack,
} from "@/components/exam-report/report/report-fonts";
import { cn } from "@/lib/utils";
import { ReportPrintButton } from "../../[token]/report-print-button";
import { QuestionCard } from "./exam-public-question-card";
import { CARD, CHIP, type ExamPublicData } from "./exam-public-shared";

const PRINT_CSS = `
@media print {
  .er-public-print-hide { display: none !important; }
  html, body { background: #ffffff !important; }
  .xp-card { break-inside: avoid; box-shadow: none !important; }
}`;

const BUCKETS: {
  key: keyof ExamLevelAnalysis["difficultyProfile"];
  label: string;
  bar: string;
  dot: string;
}[] = [
  { key: "easy", label: "쉬움", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  { key: "medium", label: "보통", bar: "bg-blue-500", dot: "bg-blue-500" },
  { key: "hard", label: "어려움", bar: "bg-amber-500", dot: "bg-amber-500" },
  { key: "killer", label: "킬러", bar: "bg-rose-500", dot: "bg-rose-500" },
];

export function ExamPublicContent({ data }: { data: ExamPublicData }) {
  const { examLevel, questions } = data;
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    void ensureReportFonts(["Pretendard"]);
  }, []);
  useEffect(() => {
    const on = () => setPrinting(true);
    const off = () => setPrinting(false);
    window.addEventListener("beforeprint", on);
    window.addEventListener("afterprint", off);
    return () => {
      window.removeEventListener("beforeprint", on);
      window.removeEventListener("afterprint", off);
    };
  }, []);

  const buckets = useMemo(() => {
    if (!examLevel) return [];
    return BUCKETS.map((b) => ({
      ...b,
      numbers: examLevel.difficultyProfile[b.key] ?? [],
    }));
  }, [examLevel]);
  const bucketTotal = buckets.reduce((s, b) => s + b.numbers.length, 0);

  const types = useMemo(() => {
    if (!examLevel) return [];
    return [...examLevel.typeDistribution]
      .map((t) => ({ ...t, count: t.numbers.length }))
      .sort((a, b) => b.count - a.count || b.points - a.points);
  }, [examLevel]);
  const typeMax = types.reduce((m, t) => Math.max(m, t.count), 0);
  const hardCount =
    (examLevel?.difficultyProfile.hard.length ?? 0) +
    (examLevel?.difficultyProfile.killer.length ?? 0);

  const sections = useMemo(
    () =>
      [
        examLevel?.overview ? { id: "overview", label: "총평" } : null,
        bucketTotal > 0 ? { id: "difficulty", label: "난이도" } : null,
        types.length > 0 ? { id: "types", label: "유형" } : null,
        examLevel?.trapOverview ? { id: "traps", label: "오답 설계" } : null,
        examLevel?.scopeInference ? { id: "scope", label: "출제 범위" } : null,
        questions.length > 0 ? { id: "questions", label: "문항별" } : null,
      ].filter((s): s is { id: string; label: string } => s !== null),
    [examLevel, bucketTotal, types.length, questions.length],
  );

  const scrollTo = useCallback((id: string) => {
    document
      .querySelector<HTMLElement>(`[data-xp-section="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const metaChips = [
    data.schoolName,
    data.grade,
    data.examTypeLabel,
    [data.examYear ? `${data.examYear}년` : null, data.semester]
      .filter(Boolean)
      .join(" ") || null,
  ].filter((v): v is string => Boolean(v));

  let sectionNo = 0;
  const nextNo = () => String(++sectionNo).padStart(2, "0");

  return (
    <div style={{ fontFamily: reportFontStack("Pretendard") }}>
      <style>{PRINT_CSS}</style>

      {sections.length > 1 ? (
        <nav
          aria-label="섹션 목차"
          className="er-public-print-hide sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur"
        >
          <div className="flex gap-1.5 overflow-x-auto px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-900 hover:bg-slate-900 hover:text-white"
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-5 sm:px-5 sm:py-8">
        {/* ── 표지 ─────────────────────────────────────────────────────── */}
        <section className={cn(CARD, "relative overflow-hidden")}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-blue-50"
          />
          <p className="relative text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
            시험지 분석 리포트
          </p>
          <h1 className="relative mt-1.5 break-keep text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl">
            {data.title}
          </h1>
          {metaChips.length > 0 ? (
            <div className="relative mt-2.5 flex flex-wrap gap-1.5">
              {metaChips.map((c) => (
                <span key={c} className={cn(CHIP, "bg-slate-50 text-slate-600 ring-slate-200/60")}>
                  {c}
                </span>
              ))}
            </div>
          ) : null}
          <dl className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="문항" value={`${data.questionCount}`} unit="문항" />
            <Stat
              label="총점"
              value={data.totalPoints != null ? `${data.totalPoints}` : "—"}
              unit={data.totalPoints != null ? "점" : ""}
            />
            <Stat label="유형" value={`${types.length}`} unit="개" />
            <Stat label="어려움·킬러" value={`${hardCount}`} unit="문항" tone="amber" />
          </dl>
          <p className="relative mt-3 text-[11px] text-slate-400">
            {data.academyName} 발행 · 학생 이름·점수는 이 리포트에 담기지 않습니다
          </p>
        </section>

        {/* ── 01 총평 ──────────────────────────────────────────────────── */}
        {examLevel?.overview ? (
          <section data-xp-section="overview" className={CARD}>
            <SectionHead no={nextNo()} title="시험 총평" />
            <Prose text={examLevel.overview} />
          </section>
        ) : null}

        {/* ── 02 난이도 프로필 ─────────────────────────────────────────── */}
        {bucketTotal > 0 ? (
          <section data-xp-section="difficulty" className={CARD}>
            <SectionHead no={nextNo()} title="난이도 프로필" caption={`${bucketTotal}문항 기준`} />
            <div className="mt-4 flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-slate-100">
              {buckets.map((b) =>
                b.numbers.length > 0 ? (
                  <div
                    key={b.key}
                    className={b.bar}
                    style={{ width: `${(b.numbers.length / bucketTotal) * 100}%` }}
                    title={`${b.label} ${b.numbers.length}문항`}
                  />
                ) : null,
              )}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {buckets.map((b) => (
                <li key={b.key} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        b.numbers.length > 0 ? b.dot : "bg-slate-200",
                      )}
                    />
                    <span className="text-[12px] font-semibold text-slate-700">{b.label}</span>
                    <span className="ml-auto text-[13px] font-bold tabular-nums text-slate-900">
                      {b.numbers.length}
                    </span>
                  </div>
                  <p className="mt-1 break-all text-[11px] leading-snug text-slate-400">
                    {b.numbers.length > 0 ? `${b.numbers.join(", ")}번` : "—"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ── 03 유형 분포 ─────────────────────────────────────────────── */}
        {types.length > 0 ? (
          <section data-xp-section="types" className={CARD}>
            <SectionHead no={nextNo()} title="유형 분포" caption={`${types.length}개 유형`} />
            <ul className="mt-3 space-y-2.5">
              {types.map((t) => (
                <li key={t.typeLabel} className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800"
                      title={t.typeLabel}
                    >
                      {t.typeLabel}
                    </span>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-slate-900">
                      {t.count}
                      <span className="ml-0.5 text-[11px] font-medium text-slate-400">문항</span>
                    </span>
                    {t.points > 0 ? (
                      <span className={cn(CHIP, "shrink-0 bg-amber-50 text-amber-700 ring-amber-200/60 tabular-nums")}>
                        {t.points}점
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${typeMax > 0 ? (t.count / typeMax) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="mt-1 break-all text-[11px] text-slate-400">{t.numbers.join(", ")}번</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ── 04 오답 설계 · 05 출제 범위 ──────────────────────────────── */}
        {examLevel?.trapOverview ? (
          <section data-xp-section="traps" className={CARD}>
            <SectionHead no={nextNo()} title="오답 설계 총평" />
            <Prose text={examLevel.trapOverview} />
          </section>
        ) : null}
        {examLevel?.scopeInference ? (
          <section data-xp-section="scope" className={CARD}>
            <SectionHead no={nextNo()} title="출제 범위 추정" />
            <Prose text={examLevel.scopeInference} />
          </section>
        ) : null}

        {/* ── 06 문항별 분석 ───────────────────────────────────────────── */}
        {questions.length > 0 ? (
          <section data-xp-section="questions" className="space-y-2.5">
            <div className={CARD}>
              <SectionHead no={nextNo()} title="문항별 분석" caption={`${questions.length}문항`} />
              {data.hiddenAnswerCount > 0 ? (
                <p className="mt-2 break-keep text-[12px] leading-relaxed text-amber-600">
                  「정답 검수 중」 {data.hiddenAnswerCount}문항은 학원에서 정답·배점을 확인한 뒤
                  공개됩니다.
                </p>
              ) : null}
            </div>
            {questions.map((q) => (
              <QuestionCard key={q.number} q={q} forceOpen={printing} />
            ))}
          </section>
        ) : null}
      </div>

      <ReportPrintButton />
    </div>
  );
}

// ── 부품 ─────────────────────────────────────────────────────────────────────

function Prose({ text }: { text: string }) {
  return (
    <p className="mt-3 whitespace-pre-wrap break-keep text-[14px] leading-[1.8] text-slate-700">
      {text}
    </p>
  );
}

function Stat({
  label,
  value,
  unit,
  tone = "slate",
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "slate" | "amber";
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-lg font-bold leading-none tabular-nums tracking-tight",
          tone === "amber" ? "text-amber-700" : "text-slate-900",
        )}
      >
        {value}
        {unit ? (
          <span className="ml-0.5 text-[11px] font-medium text-slate-400">{unit}</span>
        ) : null}
      </dd>
    </div>
  );
}

function SectionHead({ no, title, caption }: { no: string; title: string; caption?: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-[11px] font-bold tabular-nums tracking-widest text-blue-600">{no}</span>
      <h2 className="text-[15px] font-bold tracking-tight text-slate-900 sm:text-base">{title}</h2>
      {caption ? <span className="ml-auto text-[11px] text-slate-400">{caption}</span> : null}
    </div>
  );
}
