"use client";

// ============================================================================
// 학생 시험 리포트 — 난이도 매트릭스 (계기반 → 흐름 → 시그널의 3악장)
//
// ① 난이도 1~5 스탯 밴드 — 개관은 정수 %(큰 숫자), 정밀값은 분수 n/n 이
//    담당한다. sm+ 는 5칸 그리드(아래 매트릭스의 난이도 축 예고),
//    <sm 은 축약 대신 풀폭 원장 행 5줄로 전환해 라벨을 온전히 살린다.
// ② 문항 흐름 매트릭스 — 도트를 난이도 그룹이 아니라 "출제 순서"로 배열해
//    시험 진행의 흐름(어디서 무너졌나)을 그대로 보여준다. 도트 = 상태색+기호
//    (이중 부호화), 난이도는 5눈금 틱, 배점 4점↑ 문항은 이중 링 가중.
//    범례는 이 시험 데이터에 실재하는 상태만 조건부 노출.
// ③ 시그널 카드 — "아까운 실점"(난이도 1~2 오답 = 회수 가능 점수, rose)과
//    "상위권 시그널"(난이도 4~5 정답, emerald)에 번호 칩+배점을 실명 정산.
//    항목 ≤3 이면 난이도 눈금·상태까지 실은 원장 행으로 승격(밀도 적응),
//    캡션은 mt-auto 로 카드 쌍의 하단 기준선을 맞춘다.
// 수치 표시는 전부 report-format 게이트. 색은 --rpt-* 변수만.
// ============================================================================

import type { CSSProperties } from "react";
import type { DifficultyMatrixSection } from "@/lib/exam-report/report-schema";
import type { ResponseStatus } from "@/lib/exam-report/types";
import { STATUS_FILL, STATUS_LABEL, STATUS_SYMBOL } from "../report-charts";
import { formatPercentText, formatReportNumber } from "../report-format";
import { SectionShell, type ReportRenderMode } from "./section-shell";

interface Props {
  section: DifficultyMatrixSection;
  mode: ReportRenderMode;
  onChange?: (next: DifficultyMatrixSection) => void;
}

type MatrixCell = DifficultyMatrixSection["data"]["cells"][number];

const DIFFICULTIES = [1, 2, 3, 4, 5] as const;
/** 이 배점 이상이면 도트에 이중 링 가중(공용 DotMatrix 와 동일 기준) */
const HEAVY_POINTS = 4;
const HEAVY_RING = "0 0 0 2px var(--rpt-surface), 0 0 0 3.5px var(--rpt-neutral)";

const revealDelay = (ms: number): CSSProperties =>
  ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;
const barVar = (rate: number): CSSProperties =>
  ({ "--rpt-bar-w": `${Math.round(Math.max(0, Math.min(1, rate)) * 1000) / 10}%` }) as CSSProperties;

/** 순수 숫자는 '6' 이 개수로 오독되지 않게 '6번' 으로. 자유 표기(서술형 2 등)는 그대로. */
function chipNumberLabel(n: string): string {
  const trimmed = n.trim();
  return /^\d+$/.test(trimmed) ? `${trimmed}번` : n;
}

/** 좁은 폭(sm 미만)에서 '서술형 2' → '서2' 축약. 순수 숫자는 그대로. */
function shortCellLabel(number: string): string {
  const trimmed = number.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const digits = trimmed.match(/\d+/)?.[0] ?? "";
  const firstChar = trimmed.charAt(0);
  return digits ? `${firstChar}${digits}` : firstChar;
}

/** 난이도 5눈금 틱 — 도트 아래에서 난이도를 상시 가시화(툴팁 의존 금지). */
function DifficultyTicks({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-[2px]" aria-hidden>
      {DIFFICULTIES.map((d) => (
        <span
          key={d}
          className="h-[3px] w-[5px] rounded-full"
          style={{ background: d <= level ? "var(--rpt-neutral)" : "var(--rpt-line)" }}
        />
      ))}
    </span>
  );
}

// ── ① 난이도별 스탯 밴드 ──────────────────────────────────────────────────────
// sm+ = 5칸 타일(아래 매트릭스의 난이도 축 예고). <sm 은 타일당 ~62px 로
// '3/4 정답'이 죽는 폭이라, 축약 대신 레이아웃을 바꾼다 — 풀폭 원장 행 5줄.
function DifficultyStatBand({ cells }: { cells: MatrixCell[] }) {
  const stats = DIFFICULTIES.map((d) => {
    const col = cells.filter((c) => c.difficulty === d);
    const graded = col.filter((c) => c.status !== "UNKNOWN").length;
    const correct = col.filter((c) => c.status === "CORRECT").length;
    const rate = graded > 0 ? correct / graded : null;
    // 밴드는 개관 — 정수 % 로 라운딩. 정밀값은 분수 n/n 이 담당한다.
    const pctText = rate != null ? formatPercentText(Math.round(rate * 100)) : "—";
    const fractionText =
      col.length === 0 ? "출제 없음" : graded === 0 ? "채점 전" : `${correct}/${graded} 정답`;
    const ariaText = `난이도 ${d} 정답률 ${rate != null ? pctText : "집계 없음"}`;
    return { d, rate, pctText, fractionText, ariaText };
  });
  const bar = (s: (typeof stats)[number]) => (
    <div
      className="h-1 w-full min-w-0 overflow-hidden rounded-full"
      style={{ background: "var(--rpt-tint)" }}
      role="img"
      aria-label={s.ariaText}
    >
      <div
        className="rpt-bar-fill h-full rounded-full"
        style={{ ...barVar(s.rate ?? 0), background: "var(--rpt-primary)" }}
      />
    </div>
  );
  return (
    <>
      <div className="hidden grid-cols-5 gap-2.5 @min-[640px]:grid">
        {stats.map((s) => (
          <div
            key={s.d}
            className="rpt-kpi flex flex-col gap-1.5 rounded-lg p-2.5"
            style={{ background: "var(--rpt-surface)", border: "1px solid var(--rpt-line)" }}
          >
            <span className="whitespace-nowrap text-[10px] font-semibold tracking-[0.12em] text-slate-400">
              난이도 {s.d}
            </span>
            <span className="text-lg font-extrabold leading-none tabular-nums text-slate-900">
              {s.pctText}
            </span>
            {bar(s)}
            <span className="whitespace-nowrap text-[10px] tabular-nums text-slate-400">
              {s.fractionText}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 @min-[640px]:hidden">
        {stats.map((s) => (
          <div
            key={s.d}
            className="rpt-kpi flex items-center gap-2.5 rounded-lg px-2.5 py-1.5"
            style={{ background: "var(--rpt-surface)", border: "1px solid var(--rpt-line)" }}
          >
            <span className="w-12 shrink-0 whitespace-nowrap text-[10px] font-semibold text-slate-400">
              난이도 {s.d}
            </span>
            <div className="min-w-0 flex-1">{bar(s)}</div>
            <span className="w-10 shrink-0 text-right text-sm font-extrabold leading-none tabular-nums text-slate-900">
              {s.pctText}
            </span>
            <span className="w-[4.2rem] shrink-0 whitespace-nowrap text-right text-[10px] tabular-nums text-slate-400">
              {s.fractionText}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

// ── ② 문항 흐름 매트릭스 — 출제 순서 그대로 ─────────────────────────────────────
function QuestionFlowMatrix({ cells }: { cells: MatrixCell[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        문항 흐름 — 출제 순서
      </p>
      {/* 배점 가중 링(3.5px)이 이웃과 겹치지 않게 gap-x-2 이상 유지 */}
      <div className="flex flex-wrap gap-x-2 gap-y-3">
        {cells.map((cell) => {
          const isUnknown = cell.status === "UNKNOWN";
          const heavy = (cell.points ?? 0) >= HEAVY_POINTS;
          const pointsText =
            cell.points != null ? ` · ${formatReportNumber(cell.points)}점` : "";
          return (
            <span
              key={cell.number}
              className="flex flex-col items-center gap-1"
              title={`${cell.number} · 난이도 ${cell.difficulty} · ${STATUS_LABEL[cell.status]}${pointsText}`}
            >
              <span
                role="img"
                aria-label={`${cell.number} ${STATUS_LABEL[cell.status]}, 난이도 ${cell.difficulty}${pointsText}`}
                className={`flex min-h-[1.7rem] min-w-7 items-center justify-center gap-0.5 whitespace-nowrap rounded-md px-1 py-0.5 text-[11px] font-bold ${
                  isUnknown ? "text-slate-500" : "text-white"
                }`}
                style={{
                  background: STATUS_FILL[cell.status],
                  boxShadow: heavy ? HEAVY_RING : undefined,
                }}
              >
                <span className="tabular-nums @min-[640px]:hidden" aria-hidden>
                  {shortCellLabel(cell.number)}
                </span>
                <span className="hidden tabular-nums @min-[640px]:inline" aria-hidden>
                  {cell.number}
                </span>
                <span aria-hidden>{STATUS_SYMBOL[cell.status]}</span>
              </span>
              <DifficultyTicks level={cell.difficulty} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** 범례는 이 시험 데이터에 실재하는 상태만 — 대응물 없는 항목은 소음이다. */
function MatrixLegend({ cells, hasHeavy }: { cells: MatrixCell[]; hasHeavy: boolean }) {
  const present = new Set(cells.map((c) => c.status));
  const statuses = (["CORRECT", "WRONG", "PARTIAL", "UNKNOWN"] as ResponseStatus[]).filter(
    (s) => present.has(s),
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
      {statuses.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: STATUS_FILL[s] }} />
          {STATUS_LABEL[s]}
          <span aria-hidden className="-ml-0.5 text-slate-400">
            {STATUS_SYMBOL[s]}
          </span>
        </span>
      ))}
      {hasHeavy && (
        <span className="flex items-center gap-2">
          <span
            className="ml-0.5 h-3 w-3 rounded-sm"
            style={{ background: "var(--rpt-neutral)", boxShadow: HEAVY_RING }}
          />
          배점 {HEAVY_POINTS}점 이상
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <DifficultyTicks level={3} />
        난이도 눈금
      </span>
    </div>
  );
}

// ── ③ 시그널 카드 — 아까운 실점 / 상위권 시그널 ────────────────────────────────
interface SignalCardProps {
  tone: "bad" | "ok";
  kicker: string;
  title: string;
  caption: string;
  sign: "−" | "+";
  numbers: string[];
  cellByNumber: Map<string, MatrixCell>;
}

function SignalCard({ tone, kicker, title, caption, sign, numbers, cellByNumber }: SignalCardProps) {
  const color = tone === "bad" ? "var(--rpt-bad)" : "var(--rpt-ok)";
  const entries = numbers.map((n) => {
    const cell = cellByNumber.get(n.trim());
    return { n, points: cell?.points ?? null, cell };
  });
  // 밀도 적응: 항목이 적으면(≤3) 칩 1~3개짜리 헐렁한 카드가 되므로,
  // 항목당 난이도 눈금·상태까지 실어 원장 행으로 승격한다. 많으면 칩 랩핑.
  const detailed = entries.length <= 3;
  const known = entries.filter((e) => e.points != null);
  const sum = known.reduce((acc, e) => acc + (e.points ?? 0), 0);
  const sumText =
    known.length > 0 && formatReportNumber(sum) !== "0"
      ? `${sign}${formatReportNumber(sum)}점`
      : null;
  return (
    <div
      className="rpt-card flex flex-col gap-3 rounded-xl p-4 @min-[640px]:p-5"
      style={{ background: "var(--rpt-surface)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color }}>
            {kicker}
          </p>
          <h4
            className="mt-1 text-[15px] font-bold text-slate-900"
            style={{ fontFamily: "var(--rpt-heading-font)" }}
          >
            {title}
            <span className="ml-1.5 text-xs font-semibold tabular-nums text-slate-400">
              {numbers.length}문항
            </span>
          </h4>
        </div>
        {sumText && (
          <p
            className="shrink-0 text-xl font-extrabold leading-none tabular-nums"
            style={{ color }}
            aria-label={`배점 합계 ${sumText}`}
          >
            {sumText}
          </p>
        )}
      </div>
      {/* 섹션 헤더의 헤어라인 모티프를 카드 스케일로 반복 — 문법의 일관성 */}
      <div className="relative h-px" style={{ background: "var(--rpt-line)" }} aria-hidden>
        <span className="absolute -top-[1px] left-0 h-[2px] w-8" style={{ background: color }} />
      </div>
      {detailed ? (
        <ul className="flex flex-1 flex-col gap-1.5">
          {entries.map(({ n, points, cell }) => (
            <li key={n} className="flex items-center gap-2.5">
              <span
                className="inline-flex shrink-0 items-baseline gap-1 rounded-md px-2 py-1 text-xs font-bold text-white"
                style={{ background: color }}
              >
                {chipNumberLabel(n)}
                {points != null && (
                  <span className="text-[10px] font-semibold tabular-nums opacity-75">
                    {formatReportNumber(points)}점
                  </span>
                )}
              </span>
              {cell && (
                <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-500">
                  <DifficultyTicks level={cell.difficulty} />
                  난이도 {cell.difficulty} · {STATUS_LABEL[cell.status]}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-1 flex-wrap content-start gap-1.5">
          {entries.map(({ n, points }) => (
            <span
              key={n}
              className="inline-flex items-baseline gap-1 self-start rounded-md px-2 py-1 text-xs font-bold text-white"
              style={{ background: color }}
            >
              {chipNumberLabel(n)}
              {points != null && (
                <span className="text-[10px] font-semibold tabular-nums opacity-75">
                  {formatReportNumber(points)}점
                </span>
              )}
            </span>
          ))}
        </div>
      )}
      <p className="mt-auto text-[11px] leading-relaxed text-slate-400">{caption}</p>
    </div>
  );
}

export function DifficultyMatrixSectionView({ section, mode, onChange }: Props) {
  const { cells, easyMistakes, hardWins } = section.data;
  const cellByNumber = new Map(cells.map((c) => [c.number.trim(), c]));
  const hasHeavy = cells.some((c) => (c.points ?? 0) >= HEAVY_POINTS);
  const unknownCount = cells.filter((c) => c.status === "UNKNOWN").length;
  const showCards = easyMistakes.length > 0 || hardWins.length > 0;
  const bothCards = easyMistakes.length > 0 && hardWins.length > 0;

  return (
    <SectionShell
      heading={section.heading}
      narrative={section.narrative}
      hidden={section.hidden}
      mode={mode}
      kicker="DIFFICULTY MATRIX"
      onPatch={(patch) => onChange?.({ ...section, ...patch })}
    >
      {cells.length === 0 && !showCards ? (
        <p className="text-sm text-slate-400">표시할 문항 데이터가 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-7">
          {cells.length > 0 && (
            <>
              <div data-reveal style={revealDelay(120)}>
                <DifficultyStatBand cells={cells} />
              </div>
              <div className="flex flex-col gap-3" data-reveal style={revealDelay(210)}>
                <QuestionFlowMatrix cells={cells} />
                <MatrixLegend cells={cells} hasHeavy={hasHeavy} />
                {unknownCount > 0 && (
                  <p className="text-[11px] text-slate-400">
                    미입력 {unknownCount}문항은 난이도별 정답률에서 제외했습니다.
                  </p>
                )}
              </div>
            </>
          )}
          {showCards && (
            <div
              className={`grid gap-3 ${bothCards ? "@min-[44rem]:grid-cols-2" : ""}`}
              data-reveal
              style={revealDelay(300)}
            >
              {easyMistakes.length > 0 && (
                <SignalCard
                  tone="bad"
                  kicker="RECOVERABLE POINTS"
                  title="아까운 실점"
                  sign="−"
                  caption="난이도 1~2 문항에서의 오답 — 실력보다 절차의 문제일 확률이 높고, 가장 빨리 회수할 수 있는 점수입니다."
                  numbers={easyMistakes}
                  cellByNumber={cellByNumber}
                />
              )}
              {hardWins.length > 0 && (
                <SignalCard
                  tone="ok"
                  kicker="TOP-TIER SIGNAL"
                  title="상위권 시그널"
                  sign="+"
                  caption="난이도 4~5 문항에서의 정답 — 상위권을 가르는 변별 구간에서 이미 득점하고 있다는 근거입니다."
                  numbers={hardWins}
                  cellByNumber={cellByNumber}
                />
              )}
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}
