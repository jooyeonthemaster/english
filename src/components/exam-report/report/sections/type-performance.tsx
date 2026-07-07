"use client";

// ============================================================================
// 학생 시험 리포트 — 유형별 성취 (정산 원장 문법 · 밀도 재설계)
//
// 밀도 강령: 정보가 0인 행(만점 유형)은 원장에 세우지 않는다.
//  · 실점/오답이 있는 유형만 상세 원장 행(실점 내림차순, 바 유지) — 상한 8행,
//    초과분은 .rpt-scroll 로만 노출(인쇄 자동 확장).
//  · 만점 유형은 "정복한 유형" 점선 리더(차례 문법) 콤팩트 그리드로 접는다.
//  · 미채점 유형은 별도 칩 소그룹.
//  · 레이더는 실점 유형 우선 + 문항수순 채움 — 원장과 같은 이야기를 그린다.
// 마지막 합계 행은 회계 문서의 마감 이중선(double rule)으로 전 유형 정산을 닫는다.
// 수치 표시는 전부 report-format 게이트. 색은 --rpt-* 변수만.
// ============================================================================

import type { CSSProperties } from "react";
import type { TypePerformanceSection } from "@/lib/exam-report/report-schema";
import { TypeRadar, type RadarAxis } from "../report-charts";
import { formatPercentText, formatReportNumber } from "../report-format";
import { SectionShell, type ReportRenderMode } from "./section-shell";

interface Props {
  section: TypePerformanceSection;
  mode: ReportRenderMode;
  onChange?: (next: TypePerformanceSection) => void;
}

const RADAR_MIN_TYPES = 6;
const RADAR_MAX_TYPES = 8;
/** 동형 행 반복 상한 — 초과분은 내부 스크롤(.rpt-scroll)로만 노출 */
const DETAIL_ROW_CAP = 8;
/** 라운딩 후 0 으로 표시되는 부동소수점 잔여 실점은 "실점 없음"으로 취급 */
const LOSS_EPSILON = 0.005;

type PerfRow = TypePerformanceSection["data"]["rows"][number];

/** 행 파생값 — graded/rate/loss 를 한 번만 계산해 표시·순위가 같은 값을 본다. */
interface LedgerRow {
  row: PerfRow;
  graded: number;
  /** 0..1 — 채점 문항이 없으면 null */
  rate: number | null;
  /** points − earnedPoints(≥0) — earnedPoints 미확정이면 null */
  loss: number | null;
  /** 실점 상위 1~2 유형 하이라이트 */
  lossRank?: 1 | 2;
}

const revealDelay = (ms: number): CSSProperties =>
  ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;
const barVar = (rate: number): CSSProperties =>
  ({ "--rpt-bar-w": `${Math.round(Math.max(0, Math.min(1, rate)) * 1000) / 10}%` }) as CSSProperties;

/** 우측 숫자 열 공통 — 고정폭 tabular-nums + 열 간 최소 8px 보장(값 덩어리짐 방지). */
const NUM_COLS = "flex shrink-0 items-baseline justify-end gap-x-2 text-right tabular-nums";

function buildLedger(rows: PerfRow[]): LedgerRow[] {
  const ledger: LedgerRow[] = rows.map((row) => {
    const graded = Math.max(0, row.total - row.unknown);
    const rate = graded > 0 ? row.correct / graded : null;
    const loss = row.earnedPoints == null ? null : Math.max(0, row.points - row.earnedPoints);
    return { row, graded, rate, loss };
  });
  // 실질 실점(표시상 0 이 아닌)만 순위 후보 — 상위 2개 지목.
  const ranked = ledger
    .filter((l) => l.loss != null && l.loss > LOSS_EPSILON)
    .sort((a, b) => (b.loss ?? 0) - (a.loss ?? 0))
    .slice(0, 2);
  ranked.forEach((l, i) => {
    l.lossRank = (i + 1) as 1 | 2;
  });
  return ledger;
}

/** 정보가 있는 행만 상세 원장으로 — 실점 발생 또는 정답률 100% 미만. */
const isDetailLine = (l: LedgerRow): boolean =>
  (l.loss != null && l.loss > LOSS_EPSILON) || (l.rate != null && l.rate < 1);

/** 실점 셀 — null(미채점) → "—", 0 → 옅은 0, 실점 → rose "−N점". */
function LossCell({ loss, emphasis }: { loss: number | null; emphasis: boolean }) {
  if (loss == null) return <span className="w-16 text-slate-300">—</span>;
  const text = formatReportNumber(loss);
  if (text === "0") return <span className="w-16 text-slate-300">0</span>;
  return (
    <span
      className={`w-16 ${emphasis ? "font-bold" : "font-medium"}`}
      style={{ color: "var(--rpt-bad)" }}
    >
      −{text}점
    </span>
  );
}

function LedgerLine({ line, showLoss }: { line: LedgerRow; showLoss: boolean }) {
  const { row, graded, rate, loss, lossRank } = line;
  const pct = rate != null ? formatPercentText(rate * 100) : "—";
  return (
    <li className="flex flex-col gap-1.5 border-t py-2.5" style={{ borderColor: "var(--rpt-line)" }}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          {/* truncate 금지 — 실점 행의 정체(라벨)가 이 섹션의 대답이므로 줄바꿈으로 살린다 */}
          <span className="min-w-0 font-medium leading-snug text-slate-700">
            {row.typeLabel}
          </span>
          {lossRank != null && (
            <span
              className="inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[10px] font-bold leading-none"
              style={{ borderColor: "var(--rpt-bad)", color: "var(--rpt-bad)" }}
            >
              실점 {lossRank}위
            </span>
          )}
          {row.unknown > 0 && (
            <span className="shrink-0 text-[10px] text-slate-400">미채점 {row.unknown}</span>
          )}
        </span>
        <span className={`${NUM_COLS} text-[13px]`}>
          <span className="w-14 text-slate-500">
            <span className="font-semibold text-slate-700">{row.correct}</span>/
            {graded > 0 ? graded : row.total}
          </span>
          <span className="w-16 font-semibold" style={{ color: "var(--rpt-primary)" }}>
            {pct}
          </span>
          {showLoss && <LossCell loss={loss} emphasis={lossRank != null} />}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--rpt-tint)" }}
        role="img"
        aria-label={`${row.typeLabel} 정답률 ${rate != null ? pct : "미채점"}${
          loss != null && loss > LOSS_EPSILON ? `, 실점 ${formatReportNumber(loss)}점` : ""
        }`}
      >
        <div
          className="rpt-bar-fill h-full rounded-full"
          style={{ ...barVar(rate ?? 0), background: "var(--rpt-primary)" }}
        />
      </div>
    </li>
  );
}

/** 상세 원장 — 실점 행 + 전 유형 합계(마감 이중선). 합계는 항상 전체 기준. */
function DetailLedger({
  detail,
  ledger,
  showLoss,
}: {
  detail: LedgerRow[];
  ledger: LedgerRow[];
  showLoss: boolean;
}) {
  const totals = ledger.reduce(
    (acc, l) => {
      acc.total += l.row.total;
      acc.correct += l.row.correct;
      acc.graded += l.graded;
      acc.points += l.row.points;
      if (l.loss != null) {
        acc.earned += l.row.earnedPoints ?? 0;
        acc.loss += l.loss;
        acc.hasEarned = true;
      }
      return acc;
    },
    { total: 0, correct: 0, graded: 0, points: 0, earned: 0, loss: 0, hasEarned: false },
  );
  const totalRate = totals.graded > 0 ? totals.correct / totals.graded : null;
  const overflow = detail.length > DETAIL_ROW_CAP;
  return (
    <div className="flex flex-col">
      {detail.length > 0 ? (
        <>
          {/* 컬럼 헤더 — 원장의 계정과목 행 */}
          <div className="flex items-baseline justify-between gap-2 pb-2 text-[10px] font-semibold tracking-[0.14em] text-slate-400">
            <span>실점 유형 {detail.length}</span>
            <span className={NUM_COLS}>
              <span className="w-14">정오</span>
              <span className="w-16">정답률</span>
              {showLoss && <span className="w-16">실점</span>}
            </span>
          </div>
          <ul
            className={`flex flex-col ${overflow ? "rpt-scroll" : ""}`}
            style={overflow ? ({ "--rpt-scroll-max": "440px" } as CSSProperties) : undefined}
          >
            {detail.map((l, i) => (
              <LedgerLine key={`${l.row.typeLabel}-${i}`} line={l} showLoss={showLoss} />
            ))}
          </ul>
        </>
      ) : (
        <p
          className="border-t py-3 text-sm leading-relaxed text-slate-500"
          style={{ borderColor: "var(--rpt-line)" }}
        >
          {totals.graded > 0
            ? "배점을 잃은 유형이 없습니다 — 채점된 모든 유형에서 만점입니다."
            : "아직 채점된 문항이 없어 실점을 계산할 수 없습니다."}
        </p>
      )}
      {/* 합계 — 회계 문서의 마감 이중선으로 전 유형 정산을 닫는다.
          라벨은 shrink-0 로 세로 줄바꿈('합/계') 금지, 서브라벨은 truncate 대신
          전폭 둘째 줄로 내려 정보를 전량 살린다(모바일 포함). */}
      <div className="mt-0.5 pt-2.5" style={{ borderTop: "3px double var(--rpt-neutral)" }}>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="shrink-0 whitespace-nowrap font-bold text-slate-900">합계</span>
          <span className={`${NUM_COLS} text-[13px]`}>
            <span className="w-14 text-slate-500">
              <span className="font-bold text-slate-900">{totals.correct}</span>/
              {totals.graded > 0 ? totals.graded : totals.total}
            </span>
            <span className="w-16 font-bold" style={{ color: "var(--rpt-primary)" }}>
              {totalRate != null ? formatPercentText(totalRate * 100) : "—"}
            </span>
            {showLoss && <LossCell loss={totals.hasEarned ? totals.loss : null} emphasis />}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug tabular-nums text-slate-400">
          전 {ledger.length}유형
          {totals.hasEarned &&
            ` · 배점 ${formatReportNumber(totals.earned)} / ${formatReportNumber(totals.points)} 획득`}
        </p>
      </div>
    </div>
  );
}

/** 정복한 유형 — 점선 리더(차례 문법) 콤팩트 그리드. 행당 바 없음. */
function MasteredGrid({ lines }: { lines: LedgerRow[] }) {
  return (
    <div
      className="mt-6 border-t pt-4"
      style={{ ...revealDelay(120), borderColor: "var(--rpt-line)" }}
      data-reveal
    >
      <p className="text-[10px] font-semibold tracking-[0.14em] text-slate-400">
        정복한 유형 {lines.length} <span className="font-medium">— 출제 문항 전부 정답</span>
      </p>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-5 gap-y-2 @min-[640px]:grid-cols-3 print:grid-cols-3">
        {lines.map((l, i) => (
          <li key={`${l.row.typeLabel}-${i}`} className="flex items-baseline gap-1.5 text-xs">
            <span className="min-w-0 leading-snug text-slate-600">{l.row.typeLabel}</span>
            <span
              aria-hidden
              className="min-w-2 flex-1 border-b border-dotted"
              style={{ borderColor: "var(--rpt-line)" }}
            />
            <span className="shrink-0 font-semibold tabular-nums" style={{ color: "var(--rpt-ok)" }}>
              {l.row.correct}/{l.graded}
            </span>
            {l.row.unknown > 0 && (
              <span className="shrink-0 text-[10px] text-slate-400">미채점 {l.row.unknown}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 채점 대기 소그룹 — 정오를 매길 수 없는 유형은 칩으로만. */
function PendingChips({ lines }: { lines: LedgerRow[] }) {
  return (
    <div
      className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1.5"
      style={revealDelay(180)}
      data-reveal
    >
      <span className="text-[10px] font-semibold tracking-[0.14em] text-slate-400">
        채점 대기 {lines.length}
      </span>
      {lines.map((l, i) => (
        <span
          key={`${l.row.typeLabel}-${i}`}
          className="inline-flex items-baseline gap-1 rounded-full border px-2 py-0.5 text-[11px] text-slate-500"
          style={{ borderColor: "var(--rpt-line)" }}
        >
          <span className="min-w-0">{l.row.typeLabel}</span>
          <span className="tabular-nums text-slate-400">{l.row.total}문항</span>
        </span>
      ))}
    </div>
  );
}

export function TypePerformanceSectionView({ section, mode, onChange }: Props) {
  const rows = section.data.rows;
  const ledger = buildLedger(rows);
  const showLoss = ledger.some((l) => l.loss != null);

  // 3분할: 상세(실점·오답) / 정복(만점) / 채점 대기 — 정보가 없는 행은 세우지 않는다.
  const detail = ledger
    .filter(isDetailLine)
    .sort((a, b) => (b.loss ?? -1) - (a.loss ?? -1) || b.row.wrong - a.row.wrong);
  const rest = ledger.filter((l) => !isDetailLine(l));
  const mastered = rest.filter((l) => l.graded > 0);
  const pending = rest.filter((l) => l.graded === 0);

  // 레이더 축 = 실점 유형 우선 + 문항수 상위 채움(원장과 같은 이야기).
  // 채점 대기(값 0 이 오해를 부르는) 유형은 제외.
  const radarPool = [...detail, ...[...mastered].sort((a, b) => b.row.total - a.row.total)];
  const radarCapped = radarPool.length > RADAR_MAX_TYPES;
  const axes: RadarAxis[] = radarPool.slice(0, RADAR_MAX_TYPES).map((l) => ({
    label: l.row.typeLabel,
    value: l.rate ?? 0,
  }));
  const showRadar = radarPool.length >= RADAR_MIN_TYPES;

  const totalUnknown = rows.reduce((acc, r) => acc + r.unknown, 0);
  const hasNullEarned = rows.some((r) => r.earnedPoints == null);

  return (
    <SectionShell
      heading={section.heading}
      narrative={section.narrative}
      hidden={section.hidden}
      mode={mode}
      kicker="TYPE PERFORMANCE"
      onPatch={(patch) => onChange?.({ ...section, ...patch })}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">표시할 유형 데이터가 없습니다.</p>
      ) : (
        <>
          {mastered.length > 0 && (
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              배점을 잃은 유형만 상세로 올리고, 만점 유형 {mastered.length}개는 아래 요약으로
              접었습니다.
            </p>
          )}
          <div
            className={
              showRadar
                ? "grid gap-x-8 gap-y-6 @min-[44rem]:grid-cols-2 @min-[44rem]:items-center print:grid-cols-2"
                : undefined
            }
          >
            <DetailLedger detail={detail} ledger={ledger} showLoss={showLoss} />
            {showRadar && (
              <div
                className="flex flex-col items-center justify-center gap-1.5"
                data-reveal
                style={revealDelay(210)}
              >
                <div className="w-full max-w-[440px]">
                  <TypeRadar axes={axes} />
                </div>
                <p className="text-[10px] font-medium tracking-[0.08em] text-slate-400">
                  유형 정답률 균형
                  {radarCapped ? ` · 실점 유형 우선 ${axes.length}개 표시` : ""}
                </p>
              </div>
            )}
          </div>
          {mastered.length > 0 && <MasteredGrid lines={mastered} />}
          {pending.length > 0 && <PendingChips lines={pending} />}
          {(totalUnknown > 0 || (showLoss && hasNullEarned)) && (
            <div className="mt-3 flex flex-col gap-0.5 text-[11px] leading-relaxed text-slate-400">
              {totalUnknown > 0 && <p>미채점 {totalUnknown}문항은 정답률 계산에서 제외했습니다.</p>}
              {showLoss && hasNullEarned && <p>실점·획득 배점은 채점이 끝난 유형 기준입니다.</p>}
            </div>
          )}
        </>
      )}
    </SectionShell>
  );
}
