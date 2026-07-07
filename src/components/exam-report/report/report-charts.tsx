// ============================================================================
// 학생 시험 리포트 — 공용 차트 프리미티브 (외부 라이브러리 금지)
//
// 원형 지표는 고정 viewBox SVG(width 100%), 나머지는 시맨틱 HTML+CSS.
// 색은 전부 테마 CSS 변수(--rpt-*) 참조 — 테마 교체가 곧 색 교체.
// 정오는 색 + 기호(✓/✗/△) 이중 부호화(접근성). 수치 표시는 전부 report-format.
//
// 드로우온 규약(report-motion.tsx 참조): 바 = .rpt-bar-fill + --rpt-bar-w,
// 원호 = .rpt-draw-arc + pathLength 100 + --rpt-arc, 영역 = .rpt-draw-poly.
// 섹션 에이전트의 로컬 차트도 같은 클래스로 모션에 참여할 수 있다.
// ============================================================================

import type { CSSProperties } from "react";
import type { ResponseStatus } from "@/lib/exam-report/types";
import { formatPercentText, formatReportNumber } from "./report-format";

// ── 상태 색/기호/라벨 (이중 부호화) ────────────────────────────────────────────
export const STATUS_FILL: Record<ResponseStatus, string> = {
  CORRECT: "var(--rpt-ok)",
  WRONG: "var(--rpt-bad)",
  PARTIAL: "var(--rpt-primary)",
  UNKNOWN: "var(--rpt-line)",
};
export const STATUS_SYMBOL: Record<ResponseStatus, string> = {
  CORRECT: "✓",
  WRONG: "✗",
  PARTIAL: "△",
  UNKNOWN: "·",
};
export const STATUS_LABEL: Record<ResponseStatus, string> = {
  CORRECT: "정답",
  WRONG: "오답",
  PARTIAL: "부분",
  UNKNOWN: "미입력",
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const arcVar = (pct: number): CSSProperties => ({ "--rpt-arc": `${pct} 100` }) as CSSProperties;
const barVar = (pct: number): CSSProperties =>
  ({ "--rpt-bar-w": `${Math.round(clamp01(pct) * 1000) / 10}%` }) as CSSProperties;

// ── ScoreGauge — 반원 게이지(정답률) · 눈금 3점의 계기 감각 ────────────────────
export function ScoreGauge({ rate }: { rate: number | null }) {
  const pct = rate == null ? 0 : clamp01(rate / 100) * 100;
  const label = formatReportNumber(rate);
  return (
    <div className="mx-auto w-full max-w-[230px]">
      <svg viewBox="0 0 200 118" width="100%" role="img" aria-label={`정답률 ${formatPercentText(rate)}`}>
        <path
          d="M 18 102 A 82 82 0 0 1 182 102"
          fill="none"
          stroke="var(--rpt-tint)"
          strokeWidth={11}
          strokeLinecap="round"
        />
        <path
          className="rpt-draw-arc"
          d="M 18 102 A 82 82 0 0 1 182 102"
          fill="none"
          stroke="var(--rpt-primary)"
          strokeWidth={11}
          strokeLinecap="round"
          pathLength={100}
          style={arcVar(pct)}
        />
        {/* 눈금 0 / 50 / 100 — 정밀 계기의 근거선 */}
        <g fontSize={9} fill="var(--rpt-neutral)" className="tabular-nums">
          <text x={18} y={115} textAnchor="middle">0</text>
          <text x={100} y={13} textAnchor="middle">50</text>
          <text x={182} y={115} textAnchor="middle">100</text>
        </g>
        <text
          x={100}
          y={92}
          textAnchor="middle"
          fontSize={38}
          fontWeight={800}
          fill="var(--rpt-primary)"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {label}
          {rate != null && (
            <tspan fontSize={16} fontWeight={600} fill="var(--rpt-neutral)">
              %
            </tspan>
          )}
        </text>
      </svg>
      <p className="-mt-1 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        정답률
      </p>
    </div>
  );
}

// ── DonutScore — 총점 도넛(획득/만점) ──────────────────────────────────────────
export function DonutScore({ value, max }: { value: number | null; max: number | null }) {
  const pct = value != null && max != null && max > 0 ? clamp01(value / max) * 100 : 0;
  return (
    <div className="mx-auto w-full max-w-[160px]">
      <svg
        viewBox="0 0 120 120"
        width="100%"
        role="img"
        aria-label={`총점 ${formatReportNumber(value)} / ${formatReportNumber(max)}`}
      >
        <circle cx={60} cy={60} r={47} fill="none" stroke="var(--rpt-tint)" strokeWidth={9} />
        <circle
          className="rpt-draw-arc"
          cx={60}
          cy={60}
          r={47}
          fill="none"
          stroke="var(--rpt-primary)"
          strokeWidth={9}
          strokeLinecap="round"
          pathLength={100}
          transform="rotate(-90 60 60)"
          style={arcVar(pct)}
        />
        <text
          x={60}
          y={59}
          textAnchor="middle"
          fontSize={25}
          fontWeight={800}
          fill="var(--rpt-primary)"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatReportNumber(value)}
        </text>
        <text
          x={60}
          y={78}
          textAnchor="middle"
          fontSize={12}
          fill="var(--rpt-neutral)"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          / {formatReportNumber(max)}
        </text>
      </svg>
    </div>
  );
}

// ── TypeBarRows — 유형별 정답률 가로바(헤어라인 행 리듬 + 우측 정렬 수치) ──────
export interface TypeBarRow {
  typeLabel: string;
  correct: number;
  total: number;
  unknown: number;
}
export function TypeBarRows({ rows }: { rows: TypeBarRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">표시할 유형 데이터가 없습니다.</p>;
  }
  return (
    <ul className="flex flex-col">
      {rows.map((row, i) => {
        const graded = Math.max(0, row.total - row.unknown);
        const rate = graded > 0 ? row.correct / graded : 0;
        return (
          <li
            key={row.typeLabel}
            className={`flex flex-col gap-1.5 py-2.5 ${i > 0 ? "border-t" : ""}`}
            style={i > 0 ? { borderColor: "var(--rpt-line)" } : undefined}
          >
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium text-slate-700">{row.typeLabel}</span>
              <span className="shrink-0 tabular-nums text-[13px] text-slate-500">
                <span className="font-semibold text-slate-700">{row.correct}</span>
                {"/"}
                {graded > 0 ? graded : row.total}
                <span className="ml-2 inline-block w-12 text-right font-semibold" style={{ color: "var(--rpt-primary)" }}>
                  {graded > 0 ? formatPercentText(rate * 100) : "—"}
                </span>
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: "var(--rpt-tint)" }}
              role="img"
              aria-label={`${row.typeLabel} 정답률 ${graded > 0 ? formatPercentText(rate * 100) : "미채점"}`}
            >
              <div
                className="rpt-bar-fill h-full rounded-full"
                style={{ ...barVar(rate), background: "var(--rpt-primary)" }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── TypeRadar — 유형 축 폴리곤(3~8축) ──────────────────────────────────────────
export interface RadarAxis {
  label: string;
  value: number; // 0..1
}
/** 축 라벨 줄당 최대 글자 — 초과 라벨은 괄호 경계(없으면 중앙)에서 2줄 분할. */
const RADAR_LINE_MAX = 10;
function radarLabelLines(label: string): string[] {
  const clip = (s: string) => (s.length > RADAR_LINE_MAX ? `${s.slice(0, RADAR_LINE_MAX - 1)}…` : s);
  const trimmed = label.trim();
  if (trimmed.length <= RADAR_LINE_MAX) return [trimmed];
  const paren = trimmed.indexOf("(");
  if (paren >= 2) return [clip(trimmed.slice(0, paren)), clip(trimmed.slice(paren))];
  const mid = Math.ceil(trimmed.length / 2);
  return [clip(trimmed.slice(0, mid)), clip(trimmed.slice(mid))];
}
export function TypeRadar({ axes }: { axes: RadarAxis[] }) {
  if (axes.length < 3) return null;
  // viewBox 여백 = 라벨 최장 1줄(≈ RADAR_LINE_MAX × fontSize) — 클리핑 금지 설계.
  const cx = 206;
  const cy = 120;
  const r = 92;
  const n = axes.length;
  const angleAt = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i: number, radius: number) => {
    const angle = angleAt(i);
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const;
  };
  const gridPolys = [0.25, 0.5, 0.75, 1].map((f) =>
    axes.map((_, i) => point(i, r * f).join(",")).join(" "),
  );
  const valuePoly = axes.map((a, i) => point(i, r * clamp01(a.value)).join(",")).join(" ");
  const ariaLabel = `유형별 성취 레이더 — ${axes
    .map((a) => `${a.label} ${formatPercentText(clamp01(a.value) * 100)}`)
    .join(", ")}`;
  return (
    <svg viewBox="0 0 412 240" width="100%" role="img" aria-label={ariaLabel}>
      {gridPolys.map((poly, idx) => (
        <polygon key={idx} points={poly} fill="none" stroke="var(--rpt-line)" strokeWidth={idx === 3 ? 1.2 : 0.7} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = point(i, r);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--rpt-line)" strokeWidth={0.7} />;
      })}
      <polygon
        className="rpt-draw-poly"
        points={valuePoly}
        fill="var(--rpt-primary)"
        fillOpacity={0.16}
        stroke="var(--rpt-primary)"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {axes.map((a, i) => {
        const [vx, vy] = point(i, r * clamp01(a.value));
        return <circle key={`p-${i}`} className="rpt-draw-poly" cx={vx} cy={vy} r={2.4} fill="var(--rpt-primary)" />;
      })}
      {axes.map((a, i) => {
        const [x, y] = point(i, r + 13);
        const cos = Math.cos(angleAt(i));
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        const lines = radarLabelLines(a.label);
        return (
          <text
            key={`${a.label}-${i}`}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize={10}
            fill="var(--rpt-neutral)"
          >
            {lines.length === 1 ? (
              lines[0]
            ) : (
              <>
                <tspan x={x} dy="-0.55em">
                  {lines[0]}
                </tspan>
                <tspan x={x} dy="1.15em">
                  {lines[1]}
                </tspan>
              </>
            )}
          </text>
        );
      })}
    </svg>
  );
}

// ── DifficultyDotMatrix — 난이도 1~5 그룹 × 문항 도트 ──────────────────────────
export interface DifficultyCell {
  number: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  status: ResponseStatus;
  /** 배점(있으면 4점 이상 문항에 시각 가중 링) — v2 additive */
  points?: number | null;
}
/** 좁은 폭(sm 미만)에서 '서술형 2' → '서2' 축약. 순수 숫자는 그대로. */
function shortCellLabel(number: string): string {
  const trimmed = number.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const digits = trimmed.match(/\d+/)?.[0] ?? "";
  const firstChar = trimmed.charAt(0);
  return digits ? `${firstChar}${digits}` : firstChar;
}

export function DifficultyDotMatrix({ cells }: { cells: DifficultyCell[] }) {
  const columns: DifficultyCell[][] = [1, 2, 3, 4, 5].map((d) =>
    cells.filter((c) => c.difficulty === d),
  );
  return (
    <div className="grid grid-cols-5 gap-x-2 gap-y-3">
      {columns.map((col, idx) => {
        const graded = col.filter((c) => c.status !== "UNKNOWN");
        const correct = col.filter((c) => c.status === "CORRECT").length;
        return (
          <div key={idx} className="flex flex-col items-center gap-2">
            <div className="flex flex-col items-center leading-none">
              <span className="text-[11px] font-bold tabular-nums text-slate-500">난이도 {idx + 1}</span>
              <span className="mt-1 text-[10px] tabular-nums text-slate-400">
                {graded.length > 0 ? `${correct}/${graded.length}` : "—"}
              </span>
            </div>
            <div
              className="h-px w-full max-w-[64px]"
              style={{ background: "var(--rpt-line)" }}
              aria-hidden
            />
            <div className="flex flex-wrap justify-center gap-1.5">
              {col.length === 0 ? (
                <span className="text-[11px] text-slate-300">—</span>
              ) : (
                col.map((cell) => {
                  const isUnknown = cell.status === "UNKNOWN";
                  const heavy = (cell.points ?? 0) >= 4;
                  return (
                    <span
                      key={cell.number}
                      title={`${cell.number} · ${STATUS_LABEL[cell.status]}${
                        cell.points != null ? ` · ${formatReportNumber(cell.points)}점` : ""
                      }`}
                      className={`flex min-h-[1.7rem] min-w-7 items-center justify-center gap-0.5 whitespace-nowrap rounded-md px-1 py-0.5 text-[11px] font-bold ${
                        isUnknown ? "text-slate-500" : "text-white"
                      }`}
                      style={{
                        background: STATUS_FILL[cell.status],
                        boxShadow: heavy
                          ? "0 0 0 2px var(--rpt-surface), 0 0 0 3.5px var(--rpt-neutral)"
                          : undefined,
                      }}
                    >
                      <span className="tabular-nums @min-[640px]:hidden">{shortCellLabel(cell.number)}</span>
                      <span className="hidden tabular-nums @min-[640px]:inline">{cell.number}</span>
                      <span aria-hidden>{STATUS_SYMBOL[cell.status]}</span>
                    </span>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 리스트형 프리미티브(개념 칩·주차 타임라인·함정 미터)는 분할 파일에서 재수출 ──
// 소비자 import 경로 계약 유지: 항상 "../report-charts" 에서 가져온다.
export {
  ConceptCloudChips,
  WeekTimelineList,
  TrapMeter,
  type ConceptChip,
  type TimelineWeek,
  type TrapLevel,
} from "./report-charts-lists";

