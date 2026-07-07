"use client";

// ============================================================================
// 학생 시험 리포트 — 성적 개요 (게이지+도넛 중복 폐기 → 히어로 밴드)
//
//   ① 히어로 밴드(.rpt-kpi): 총점 대형 CountUp + /만점 | 정답률(드로우온 바)
//      + 보조 스탯 행(정답 문항 N/M · 실점 −x점 — 실점은 score/maxScore 파생이라
//      counts 없는 구 문서에서도 우측 컬럼이 비지 않는다) + 정오 분해 칩(v2).
//   ② 반평균 비교: 수평 바 2행(rpt-bar-fill 드로우온) + 격차 배지(±N점)
//   ③ 한 줄 진단: verdictLine(=narrative 선두 문단, merge 계약)의 **첫 문장만**
//      인용 카드로 — 잔여 문장·문단은 셸 내러티브로 흘려보낸다(라벨 "한 줄"과
//      실물 길이 일치). view 전용, edit 는 raw 전문 편집.
//
// 수치 표시는 전부 formatReportNumber 계열. 색은 --rpt-* 변수만.
// ============================================================================

import type { CSSProperties } from "react";
import type { ScoreOverviewSection } from "@/lib/exam-report/report-schema";
import { CountUp } from "../report-motion";
import { formatPercentText, formatReportNumber } from "../report-format";
import { renderNarrative } from "../report-narrative";
import { SectionShell, type ReportRenderMode } from "./section-shell";

interface Props {
  section: ScoreOverviewSection;
  mode: ReportRenderMode;
  onChange?: (next: ScoreOverviewSection) => void;
}

const barVar = (pct: number): CSSProperties =>
  ({ "--rpt-bar-w": `${Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10}%` }) as CSSProperties;

/**
 * 문단에서 첫 문장만 잘라낸다 — 한국어 종결어미(요/다/죠)+마침표 뒤에 후속 텍스트가
 * 있을 때만 절단. "89.7" 같은 숫자 마침표는 종결어미 조건에 걸리지 않는다.
 * 경계가 없으면(=이미 한 문장) 통째로 head.
 */
function splitFirstSentence(paragraph: string): { head: string; tail: string } {
  const boundary = /(?:요|다|죠)[.!?](?=\s)/.exec(paragraph);
  if (!boundary) return { head: paragraph, tail: "" };
  const cut = boundary.index + boundary[0].length;
  const head = paragraph.slice(0, cut).trim();
  // 절단 결과가 비정상적으로 짧으면(오탐 가능성) 원문 유지.
  if (head.length < 12) return { head: paragraph, tail: "" };
  return { head, tail: paragraph.slice(cut).trim() };
}

/**
 * verdictLine 분리 — merge 계약상 narrative 선두 문단이 "한 줄 진단"이다.
 * 라벨이 "한 줄"이므로 카드에는 선두 문단의 **첫 문장만** 싣고, 잔여 문장은
 * 별도 문단으로 본문(rest) 앞에 흘려보낸다(표시 전용 — 원문 narrative 불변).
 * 잔여 문단이 없고 선두가 길면(>140자) 구 문서의 통짜 서술로 보고 분리하지 않는다.
 */
function splitVerdict(narrative: string): { verdict: string; rest: string } {
  const trimmed = narrative.trim();
  if (!trimmed) return { verdict: "", rest: "" };
  const idx = trimmed.search(/\n{2,}/);
  const lead = idx === -1 ? trimmed : trimmed.slice(0, idx).trim();
  const body = idx === -1 ? "" : trimmed.slice(idx).trim();
  if (idx === -1 && trimmed.length > 140) return { verdict: "", rest: trimmed };
  const { head, tail } = splitFirstSentence(lead);
  const rest = [tail, body].filter((part) => part.length > 0).join("\n\n");
  return { verdict: head, rest };
}

// ── 히어로 보조 스탯(라벨 + 볼드 수치 + 단위) ─────────────────────────────────
interface HeroStat {
  key: string;
  label: string;
  value: string;
  suffix?: string;
}

function HeroStatRow({ stats }: { stats: HeroStat[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-7 gap-y-1.5">
      {stats.map((stat) => (
        <div key={stat.key} className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-medium text-slate-500">{stat.label}</span>
          <span className="text-[17px] font-bold leading-none tabular-nums text-slate-700">
            {stat.value}
          </span>
          {stat.suffix != null && (
            <span
              className="text-[12px] font-semibold tabular-nums"
              style={{ color: "var(--rpt-neutral)" }}
            >
              {stat.suffix}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 정오 분해 칩(색+기호 이중 부호화) ──────────────────────────────────────────
interface BreakdownChip {
  key: string;
  symbol: string;
  label: string;
  count: number;
  color: string;
}

function BreakdownChips({ chips }: { chips: BreakdownChip[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <li
          key={chip.key}
          className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1"
          style={{ borderColor: "var(--rpt-line)" }}
        >
          <span aria-hidden className="text-[11px] font-bold" style={{ color: chip.color }}>
            {chip.symbol}
          </span>
          <span className="text-[11px] font-medium text-slate-500">{chip.label}</span>
          <span className="text-[12px] font-bold tabular-nums" style={{ color: chip.color }}>
            {chip.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── 반평균 비교 수평 바 ────────────────────────────────────────────────────────
function ClassCompareCard({
  score,
  classAverage,
  maxScore,
}: {
  score: number | null;
  classAverage: number;
  maxScore: number | null;
}) {
  const base = maxScore && maxScore > 0 ? maxScore : Math.max(score ?? 0, classAverage, 1);
  const rows = [
    { label: "내 점수", value: score, color: "var(--rpt-primary)", em: true },
    { label: "반평균", value: classAverage, color: "var(--rpt-neutral)", em: false },
  ];
  const delta = score != null ? score - classAverage : null;
  const deltaText = delta == null ? null : formatReportNumber(Math.abs(delta));
  const deltaEven = deltaText === "0";
  return (
    <div
      className="rpt-card rounded-xl border px-5 py-4"
      style={{ borderColor: "var(--rpt-line)", background: "var(--rpt-surface)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--rpt-neutral)" }}>
          Class Average
        </p>
        {delta != null && deltaText != null && (
          <p
            className="text-[12px] font-bold tabular-nums"
            style={{
              color: deltaEven ? "var(--rpt-neutral)" : delta > 0 ? "var(--rpt-ok)" : "var(--rpt-bad)",
            }}
          >
            {deltaEven ? "반평균과 동일" : `반평균 대비 ${delta > 0 ? "+" : "−"}${deltaText}점`}
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        {rows.map((row) => {
          const pct = row.value == null ? 0 : (Math.max(0, Math.min(base, row.value)) / base) * 100;
          return (
            <div
              key={row.label}
              className="flex items-center gap-3"
              role="img"
              aria-label={`${row.label} ${formatReportNumber(row.value)}점`}
            >
              <span className="w-12 shrink-0 text-xs font-medium text-slate-500">{row.label}</span>
              <div
                className="h-2.5 flex-1 overflow-hidden rounded-full"
                style={{ background: "var(--rpt-tint)" }}
              >
                <div
                  className="rpt-bar-fill h-full rounded-full"
                  style={{ ...barVar(pct), background: row.color }}
                />
              </div>
              <span
                className={`w-12 shrink-0 text-right text-[13px] tabular-nums ${
                  row.em ? "font-bold" : "font-semibold"
                }`}
                style={{ color: row.em ? "var(--rpt-primary)" : "var(--rpt-neutral)" }}
              >
                {formatReportNumber(row.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScoreOverviewSectionView({ section, mode, onChange }: Props) {
  const { score, maxScore, correctRate, classAverage, unknownCount } = section.data;
  const { correctCount, wrongCount, partialCount } = section.data;
  const hasCounts = correctCount != null && wrongCount != null && partialCount != null;
  const isView = mode === "view";

  const { verdict, rest } = splitVerdict(section.narrative);
  const useVerdictCard = isView && verdict.length > 0;

  const chips: BreakdownChip[] = hasCounts
    ? [
        { key: "correct", symbol: "✓", label: "정답", count: correctCount, color: "var(--rpt-ok)" },
        { key: "wrong", symbol: "✗", label: "오답", count: wrongCount, color: "var(--rpt-bad)" },
        ...(partialCount > 0
          ? [{ key: "partial", symbol: "△", label: "부분", count: partialCount, color: "var(--rpt-primary)" }]
          : []),
        ...(unknownCount > 0
          ? [{ key: "unknown", symbol: "·", label: "미입력", count: unknownCount, color: "var(--rpt-neutral)" }]
          : []),
      ]
    : [];
  const totalItems = hasCounts ? correctCount + wrongCount + partialCount + unknownCount : null;

  // 보조 스탯 — 문항수(counts 문서)와 실점(score/maxScore 파생, 구 문서 대응).
  const gradedCount = totalItems != null ? totalItems - unknownCount : null;
  const lostPoints =
    score != null && maxScore != null && maxScore > 0 ? Math.max(0, maxScore - score) : null;
  const heroStats: HeroStat[] = [
    ...(hasCounts && gradedCount != null && gradedCount > 0
      ? [
          {
            key: "items",
            label: "정답 문항",
            value: formatReportNumber(correctCount),
            suffix: `/ ${formatReportNumber(gradedCount)}문항`,
          },
        ]
      : []),
    ...(lostPoints != null
      ? [
          {
            key: "lost",
            label: "실점",
            value: lostPoints === 0 ? "0" : `−${formatReportNumber(lostPoints)}`,
            suffix: lostPoints === 0 ? "점 · 만점" : "점",
          },
        ]
      : []),
  ];

  return (
    <SectionShell
      heading={section.heading}
      narrative={useVerdictCard ? rest : section.narrative}
      hidden={section.hidden}
      mode={mode}
      kicker="SCORE OVERVIEW"
      onPatch={(patch) => onChange?.({ ...section, ...patch })}
    >
      <div className="flex flex-col gap-4">
        {/* ── ① 히어로 밴드 — 점수가 문서의 첫 숫자다 ── */}
        <div
          className="rpt-kpi overflow-hidden rounded-2xl border"
          style={{ borderColor: "var(--rpt-line)", background: "var(--rpt-surface)" }}
        >
          <div className="flex flex-col @min-[640px]:flex-row">
            <div className="flex flex-col justify-center gap-2 px-6 py-7 @min-[640px]:px-8 @min-[640px]:py-8">
              <p
                className="text-[10px] font-bold uppercase tracking-[0.26em]"
                style={{ color: "var(--rpt-neutral)" }}
              >
                Total Score
              </p>
              <p className="flex items-baseline gap-2">
                <span
                  className="text-[56px] font-extrabold leading-none tracking-[-0.02em] tabular-nums @min-[640px]:text-[68px]"
                  style={{ color: "var(--rpt-primary)", fontFamily: "var(--rpt-heading-font)" }}
                >
                  {score != null ? <CountUp value={score} format={formatReportNumber} /> : "—"}
                </span>
                {maxScore != null && (
                  <span
                    className="text-lg font-semibold tabular-nums"
                    style={{ color: "var(--rpt-neutral)" }}
                  >
                    / {formatReportNumber(maxScore)}
                  </span>
                )}
              </p>
            </div>
            <div
              aria-hidden
              className="mx-6 h-px @min-[640px]:mx-0 @min-[640px]:my-8 @min-[640px]:h-auto @min-[640px]:w-px"
              style={{ background: "var(--rpt-line)" }}
            />
            <div className="flex flex-1 flex-col justify-center gap-4 px-6 py-6 @min-[640px]:px-8 @min-[640px]:py-8">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium text-slate-500">정답률</span>
                  <span
                    className="text-[26px] font-bold leading-none tabular-nums"
                    style={{ color: "var(--rpt-primary)" }}
                  >
                    {correctRate != null ? (
                      <>
                        <CountUp value={correctRate} format={formatReportNumber} />
                        <span className="ml-0.5 text-[15px] font-semibold" style={{ color: "var(--rpt-neutral)" }}>
                          %
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: "var(--rpt-tint)" }}
                  role="img"
                  aria-label={`정답률 ${formatPercentText(correctRate)}`}
                >
                  <div
                    className="rpt-bar-fill h-full rounded-full"
                    style={{ ...barVar(correctRate ?? 0), background: "var(--rpt-primary)" }}
                  />
                </div>
              </div>
              {(heroStats.length > 0 || hasCounts) && (
                <div
                  className="flex flex-col gap-2.5 border-t pt-3.5"
                  style={{ borderColor: "var(--rpt-line)" }}
                >
                  {heroStats.length > 0 && <HeroStatRow stats={heroStats} />}
                  {hasCounts && <BreakdownChips chips={chips} />}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── ② 반평균 비교(입력 있을 때만) ── */}
        {classAverage != null && (
          <ClassCompareCard score={score} classAverage={classAverage} maxScore={maxScore} />
        )}

        {/* ── ③ 한 줄 진단 — verdictLine 인용 카드(view 전용) ── */}
        {useVerdictCard && (
          <div className="rpt-card rounded-xl px-5 py-4" style={{ background: "var(--rpt-tint)" }}>
            <div className="flex gap-3.5">
              <span
                aria-hidden
                className="w-[3px] shrink-0 self-stretch rounded-full"
                style={{ background: "var(--rpt-primary)" }}
              />
              <div className="min-w-0">
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.24em]"
                  style={{ color: "var(--rpt-primary)" }}
                >
                  한 줄 진단
                </p>
                <div className="mt-1.5 flex flex-col gap-2 text-[16px] font-semibold leading-[1.7] text-slate-800">
                  {renderNarrative(verdict)}
                </div>
              </div>
            </div>
          </div>
        )}

        {unknownCount > 0 && (
          <p className="text-xs leading-relaxed text-slate-400">
            ※ 미입력 {unknownCount}문항은 채점에서 제외하고 정답률을 계산했습니다.
          </p>
        )}
      </div>
    </SectionShell>
  );
}
