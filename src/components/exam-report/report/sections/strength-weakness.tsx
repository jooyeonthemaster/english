"use client";

// ============================================================================
// 학생 시험 리포트 — 강점/보완 대비 섹션 (2컬럼 극성 카드)
//
// 카드의 성격(강점 ✓ ok / 보완 △ bad)을 최상단 2px 극성 룰 + 기호 배지로
// 선언한다 — 색만으로 구분하지 않는 이중 부호화. 항목 본문은 renderNarrative
// (** 강조 지원)로 렌더해 AI/강사가 심은 강조가 하이라이트로 살아난다.
//
// 밀도 방어(계약 §1):
// - 항목은 자유 서술 문장이라 집계·칩 압축이 불가능한 데이터다. 따라서
//   동형 행 상한(8) 초과 시 유일한 합법 수단인 내부 스크롤(.rpt-scroll)로
//   카드 세로 성장을 캡한다. 인쇄에서는 유틸이 자동 전량 확장돼 잘림이 없다.
// - 한국어 서술은 break-keep(어절 단위 줄바꿈)으로 래그 리듬을 정돈하고,
//   overflow-wrap:anywhere 를 비상 탈출구로 깔아 390px 오버플로를 0으로 유지.
// - 행 사이 헤어라인으로 항목 수가 늘어도 행 리듬이 뭉개지지 않게 한다.
// 항목 수가 달라도 grid 기본 stretch 로 두 카드의 지면 높이를 맞춘다(정렬 유지).
// ============================================================================

import type { CSSProperties } from "react";
import type { StrengthWeaknessSection } from "@/lib/exam-report/report-schema";
import { formatReportNumber } from "../report-format";
import { renderNarrative } from "../report-narrative";
import { SectionShell, type ReportRenderMode } from "./section-shell";

interface Props {
  section: StrengthWeaknessSection;
  mode: ReportRenderMode;
  onChange?: (next: StrengthWeaknessSection) => void;
}

/** 동형 행 상한(계약 §1.1) — 초과분은 카드 내부 스크롤로 캡한다. */
const ROW_CAP = 8;

const revealDelay = (ms: number): CSSProperties =>
  ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;

function ContrastCard({
  title,
  items,
  symbol,
  color,
  delayMs,
}: {
  title: string;
  items: string[];
  symbol: string;
  color: string;
  delayMs: number;
}) {
  const capped = items.length > ROW_CAP;
  return (
    <div
      className="rpt-card relative flex flex-col overflow-hidden rounded-xl border p-4 pt-5 @min-[640px]:p-5 @min-[640px]:pt-6"
      style={{
        borderColor: "var(--rpt-line)",
        background: "var(--rpt-surface)",
        ...revealDelay(delayMs),
      }}
      data-reveal
    >
      {/* 극성 룰 — 카드의 성격을 최상단 2px 로 선언한다 */}
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: color }} aria-hidden />
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold" style={{ color }}>
          <span
            className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-bold"
            style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
            aria-hidden
          >
            {symbol}
          </span>
          {title}
        </p>
        <span className="tabular-nums text-xs text-slate-400">
          {formatReportNumber(items.length)}항목
        </span>
      </div>
      {items.length > 0 ? (
        <ul
          className={`mt-3 flex flex-col${capped ? " rpt-scroll" : ""}`}
          style={capped ? ({ "--rpt-scroll-max": "384px" } as CSSProperties) : undefined}
        >
          {items.map((item, i) => (
            <li
              key={i}
              className="flex gap-2.5 py-2.5 first:pt-1 last:pb-0"
              style={
                i > 0
                  ? { borderTop: "1px solid color-mix(in srgb, var(--rpt-line) 62%, transparent)" }
                  : undefined
              }
            >
              <span className="shrink-0 text-[13px] font-bold leading-6" style={{ color }} aria-hidden>
                {symbol}
              </span>
              <div
                className="flex min-w-0 flex-col gap-1 break-keep text-sm leading-[1.75] text-slate-700"
                style={{ overflowWrap: "anywhere" }}
              >
                {renderNarrative(item)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-400">작성된 항목이 아직 없습니다.</p>
      )}
    </div>
  );
}

export function StrengthWeaknessSectionView({ section, mode, onChange }: Props) {
  const { strengths, weaknesses } = section.data;
  return (
    <SectionShell
      heading={section.heading}
      narrative={section.narrative}
      hidden={section.hidden}
      mode={mode}
      kicker="STRENGTHS & GAPS"
      onPatch={(patch) => onChange?.({ ...section, ...patch })}
    >
      {/* 리드인(계약 §1.5) — 이 섹션이 무엇을 근거로 갈렸는지 한 줄로 못박는다 */}
      <p
        className="break-keep text-[13px] leading-relaxed text-slate-500"
        data-reveal
        style={revealDelay(90)}
      >
        문항별 정오답 분석에서 추려낸, 이번 시험이 증명한 강점과 다음 시험 전에 다듬을
        보완 지점입니다.
      </p>
      {/* 44rem(704px) 브레이크포인트: 에디터(708px)·공개(728px) 컨테이너 모두 2컬럼 도달. A4 인쇄 폭(~703px)은 그 미만 — 강점/보완 대비는 print 변형으로 2컬럼을 사수한다 */}
      <div className="mt-4 grid gap-4 @min-[44rem]:grid-cols-2 print:grid-cols-2">
        <ContrastCard
          title="강점"
          items={strengths}
          symbol="✓"
          color="var(--rpt-ok)"
          delayMs={120}
        />
        <ContrastCard
          title="보완점"
          items={weaknesses}
          symbol="△"
          color="var(--rpt-bad)"
          delayMs={210}
        />
      </div>
    </SectionShell>
  );
}
