"use client";

// ============================================================================
// 학생 시험 리포트 — 개념 지도 섹션 (weak 주인공 / strong 저밀도 자산 요약)
//
// 밀도 강령(동형 행 상한 8) 준수 구조:
// - 리드인 1줄: 이 지도가 "해설에서 추출한 개념을 정오답으로 가른 것"임을
//   학부모 언어로 먼저 선언 — 5000px 아래 내러티브까지 안 가도 해석 가능.
// - weak = 주인공: "우선 보강 1순위" 하이라이트 박스 + 상세 행 최대 5개
//   (관련 문항 번호 칩 = 근거, 인쇄·모바일에서도 항상 노출). 초과분은
//   "그 외 보완 개념" 인라인 칩으로 접는다 — 행 벽 금지.
// - strong = 배경: 행 렌더 금지. 출제 빈도 내림차순 캡된 칩 구름(상위 24개
//   + "외 N개" 트레일러). 개념명만 — 강점의 근거 문항 나열은 소음.
// - 색은 --rpt-* 변수만, weak/strong 극성은 색+기호(△/✓) 이중 부호화.
// ============================================================================

import type { CSSProperties } from "react";
import type { ConceptMapSection } from "@/lib/exam-report/report-schema";
import { formatReportNumber } from "../report-format";
import { SectionShell, type ReportRenderMode } from "./section-shell";

interface Props {
  section: ConceptMapSection;
  mode: ReportRenderMode;
  onChange?: (next: ConceptMapSection) => void;
}

type ConceptRow = ConceptMapSection["data"]["weak"][number];

/** 하이라이트 1 + 상세 행 5 — 동형 행 상한(8) 아래로 캡 */
const WEAK_DETAIL_MAX = 6;
/** weak 초과분 인라인 칩에 이름을 노출할 최대 개수(이후 "+N개") */
const WEAK_OVERFLOW_NAME_MAX = 10;
/** strong 칩 구름 캡 — 초과분은 "외 N개 개념" 트레일러 칩 */
const STRONG_CHIP_MAX = 24;

const WEAK_COLOR = "var(--rpt-bad)";
const STRONG_COLOR = "var(--rpt-ok)";

const revealDelay = (ms: number): CSSProperties =>
  ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;

/** 빈도 내림차순 → 관련 문항 수 내림차순. weak 정렬 1위 = "우선 보강 1순위". */
function sortConcepts(items: ConceptRow[]): ConceptRow[] {
  return [...items].sort(
    (a, b) => b.weight - a.weight || b.relatedNumbers.length - a.relatedNumbers.length,
  );
}

/** 출제 빈도 1~3 — 3칸 세그먼트 바(크기 3단 폰트보다 정직한 부호화). */
function WeightBar({ weight, color }: { weight: 1 | 2 | 3; color: string }) {
  return (
    <span
      className="flex shrink-0 items-center gap-[3px]"
      role="img"
      aria-label={`출제 빈도 ${weight}/3`}
    >
      {[1, 2, 3].map((s) => (
        <span
          key={s}
          className="h-[5px] w-4 rounded-full"
          style={{ background: s <= weight ? color : "var(--rpt-tint)" }}
          aria-hidden
        />
      ))}
    </span>
  );
}

/** 관련 문항 번호 칩 — 개념과 실제 문항을 지면 위에서 직접 연결하는 근거. */
function NumberChips({ numbers }: { numbers: string[] }) {
  if (numbers.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1" aria-label="관련 문항">
      {numbers.map((n, i) => (
        <span
          key={`${n}-${i}`}
          className="rounded-[5px] border px-1.5 text-[11px] font-medium leading-[19px] tabular-nums text-slate-600"
          style={{ borderColor: "var(--rpt-line)" }}
        >
          {n}번
        </span>
      ))}
    </span>
  );
}

function WeakRow({ row, divider }: { row: ConceptRow; divider: boolean }) {
  return (
    <li
      className={`flex flex-col gap-1.5 py-2.5 last:pb-0 ${divider ? "border-t" : "pt-0"}`}
      style={divider ? { borderColor: "var(--rpt-line)" } : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-slate-800">{row.concept}</p>
        <WeightBar weight={row.weight} color={WEAK_COLOR} />
      </div>
      <NumberChips numbers={row.relatedNumbers} />
    </li>
  );
}

/** weak 1위 승격 박스 — 수술 전 디자인의 유지 대상. */
function PriorityBox({ row }: { row: ConceptRow }) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: `color-mix(in srgb, ${WEAK_COLOR} 30%, transparent)`,
        background: `color-mix(in srgb, ${WEAK_COLOR} 6%, transparent)`,
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: WEAK_COLOR }}>
        우선 보강 1순위
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-bold text-slate-900">{row.concept}</p>
        <WeightBar weight={row.weight} color={WEAK_COLOR} />
      </div>
      <div className="mt-2">
        <NumberChips numbers={row.relatedNumbers} />
      </div>
    </div>
  );
}

/** weak 패널 — 주인공. 하이라이트 1 + 상세 행 ≤5 + 초과분 인라인 칩 요약. */
function WeakPanel({ items }: { items: ConceptRow[] }) {
  const sorted = sortConcepts(items);
  const detail = sorted.slice(0, WEAK_DETAIL_MAX);
  const overflow = sorted.slice(WEAK_DETAIL_MAX);
  const overflowNamed = overflow.slice(0, WEAK_OVERFLOW_NAME_MAX);
  const overflowRest = overflow.length - overflowNamed.length;
  return (
    <div
      className="rpt-card flex flex-col rounded-xl border p-4 @min-[640px]:p-5"
      style={{
        borderColor: "var(--rpt-line)",
        background: "var(--rpt-surface)",
        ...revealDelay(120),
      }}
      data-reveal
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: WEAK_COLOR }}>
          <span aria-hidden>△</span>
          보완이 필요한 개념
        </p>
        <span className="tabular-nums text-xs text-slate-400">
          {formatReportNumber(sorted.length)}개
        </span>
      </div>
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          이번 시험에서는 보완이 필요한 개념이 발견되지 않았습니다.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <PriorityBox row={detail[0]} />
          </div>
          {detail.length > 1 && (
            <ul className="mt-2 flex flex-col">
              {detail.slice(1).map((row, i) => (
                <WeakRow key={`${row.concept}-${i}`} row={row} divider={i > 0} />
              ))}
            </ul>
          )}
          {overflow.length > 0 && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--rpt-line)" }}>
              <p className="text-[11px] font-semibold text-slate-400">
                그 외 보완 개념 {formatReportNumber(overflow.length)}개
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="그 외 보완 개념">
                {overflowNamed.map((row, i) => (
                  <li
                    key={`${row.concept}-${i}`}
                    className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-slate-600"
                    style={{ borderColor: `color-mix(in srgb, ${WEAK_COLOR} 28%, transparent)` }}
                  >
                    {row.concept}
                  </li>
                ))}
                {overflowRest > 0 && (
                  <li
                    className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-slate-400"
                    style={{ borderColor: "var(--rpt-line)" }}
                  >
                    +{formatReportNumber(overflowRest)}개
                  </li>
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** strong 패널 — 배경. 행 금지, 캡된 칩 구름(개념명만·빈도 내림차순). */
function StrongPanel({ items }: { items: ConceptRow[] }) {
  const sorted = sortConcepts(items);
  const shown = sorted.slice(0, STRONG_CHIP_MAX);
  const rest = sorted.length - shown.length;
  return (
    <div
      className="rpt-card flex flex-col rounded-xl border p-4 @min-[640px]:p-5"
      style={{
        borderColor: `color-mix(in srgb, ${STRONG_COLOR} 18%, transparent)`,
        background: `color-mix(in srgb, ${STRONG_COLOR} 4%, transparent)`,
        ...revealDelay(210),
      }}
      data-reveal
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: STRONG_COLOR }}>
          <span aria-hidden>✓</span>
          탄탄한 개념
        </p>
        <span className="tabular-nums text-xs text-slate-400">
          {formatReportNumber(sorted.length)}개
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        맞힌 문항에서 확인된 개념 자산 — 출제 빈도가 높은 순입니다.
      </p>
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">해당하는 개념이 없습니다.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="탄탄한 개념 목록">
          {shown.map((row, i) => (
            <li
              key={`${row.concept}-${i}`}
              className={`rounded-full border px-2.5 py-0.5 text-xs text-slate-700 ${
                row.weight >= 2 ? "font-semibold" : "font-medium"
              }`}
              style={
                row.weight >= 2
                  ? {
                      borderColor: `color-mix(in srgb, ${STRONG_COLOR} 35%, transparent)`,
                      background: `color-mix(in srgb, ${STRONG_COLOR} 8%, transparent)`,
                    }
                  : { borderColor: "var(--rpt-line)", background: "var(--rpt-surface)" }
              }
            >
              {row.concept}
            </li>
          ))}
          {rest > 0 && (
            <li
              className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-slate-400"
              style={{ borderColor: "var(--rpt-line)" }}
            >
              외 {formatReportNumber(rest)}개 개념
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function ConceptMapSectionView({ section, mode, onChange }: Props) {
  const { weak, strong } = section.data;
  return (
    <SectionShell
      heading={section.heading}
      narrative={section.narrative}
      hidden={section.hidden}
      mode={mode}
      kicker="CONCEPT MAP"
      onPatch={(patch) => onChange?.({ ...section, ...patch })}
    >
      {/* 리드인 — 이 지도가 무엇인지 본문 위에서 먼저 선언 */}
      <p className="mb-5 max-w-[64ch] text-sm leading-[1.75] text-slate-500">
        문항 해설에서 뽑아낸 개념을 정오답 기준으로 가른 지도입니다. 틀린 문항에 걸려 있던
        개념은 <span className="font-semibold" style={{ color: WEAK_COLOR }}>보완할 개념</span>
        으로, 맞힌 문항에서 확인된 개념은 이미 갖춘{" "}
        <span className="font-semibold" style={{ color: STRONG_COLOR }}>개념 자산</span>으로
        분류했습니다. 개념 옆 번호 칩은 그 개념이 걸린 문항입니다.
      </p>
      {/* 44rem(704px) 브레이크포인트: 에디터(708px)·공개(728px) 컨테이너 모두 2컬럼 도달. A4 인쇄 폭(~703px)은 그 미만 — 대비 패널은 print 변형으로 2컬럼을 사수한다 */}
      <div className="grid items-start gap-4 @min-[44rem]:grid-cols-2 print:grid-cols-2">
        <WeakPanel items={weak} />
        <StrongPanel items={strong} />
      </div>
    </SectionShell>
  );
}
