// ============================================================================
// 학생 시험 리포트 — 리스트형 시각 프리미티브 (report-charts.tsx 의 분할 파일)
//
// 개념 칩 · 주차 타임라인 · 함정 미터. 소비자는 항상 "../report-charts" 에서
// import 한다(이 파일은 report-charts.tsx 가 재수출하는 내부 분할 단위).
// 규약은 본체와 동일: 색은 --rpt-* 변수만, 수치는 report-format, 이중 부호화.
// ============================================================================

import { formatReportNumber } from "./report-format";

// ── ConceptCloudChips — 개념 칩(빈도 가중 도트 + 관련 문항 수) ─────────────────
export interface ConceptChip {
  concept: string;
  weight: 1 | 2 | 3;
  relatedNumbers: string[];
}
export function ConceptCloudChips({
  items,
  tone,
}: {
  items: ConceptChip[];
  tone: "weak" | "strong";
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">해당 개념이 없습니다.</p>;
  }
  const color = tone === "weak" ? "var(--rpt-bad)" : "var(--rpt-ok)";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {[...items]
        .sort((a, b) => b.weight - a.weight)
        .map((chip) => (
          <span
            key={chip.concept}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium"
            style={{
              color,
              borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
              background: `color-mix(in srgb, ${color} 7%, transparent)`,
            }}
          >
            {/* 빈도 가중 도트 1~3 — 크기 3단보다 정직한 부호화 */}
            <span className="flex items-center gap-0.5" aria-label={`빈도 ${chip.weight}`}>
              {[1, 2, 3].map((w) => (
                <span
                  key={w}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: w <= chip.weight ? color : "var(--rpt-line)" }}
                  aria-hidden
                />
              ))}
            </span>
            {chip.concept}
            {chip.relatedNumbers.length > 0 && (
              <span className="tabular-nums text-[11px] opacity-70">
                {chip.relatedNumbers.length}문항
              </span>
            )}
          </span>
        ))}
    </div>
  );
}

// ── WeekTimelineList — 주차 레일 타임라인(번호 배지 + 체크박스 태스크) ─────────
export interface TimelineWeek {
  label: string;
  focus: string;
  tasks: string[];
}
export function WeekTimelineList({ weeks }: { weeks: TimelineWeek[] }) {
  if (weeks.length === 0) {
    return <p className="text-sm text-slate-400">학습 계획이 아직 없습니다.</p>;
  }
  return (
    <ol className="relative flex flex-col gap-6 pl-9">
      <span
        className="absolute left-[13px] top-2 h-[calc(100%-1rem)] w-px"
        style={{ background: "var(--rpt-line)" }}
        aria-hidden
      />
      {weeks.map((week, i) => (
        <li key={`${week.label}-${i}`} className="rpt-card relative">
          <span
            className="absolute -left-9 top-0 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold tabular-nums text-white"
            style={{ background: "var(--rpt-primary)" }}
            aria-hidden
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-sm font-bold text-slate-800">{week.label}</p>
            {week.focus && (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{
                  color: "var(--rpt-primary)",
                  background: "color-mix(in srgb, var(--rpt-primary) 10%, transparent)",
                }}
              >
                {week.focus}
              </span>
            )}
          </div>
          {week.tasks.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {week.tasks.map((task, ti) => (
                <li key={ti} className="flex items-start gap-2 text-sm leading-6 text-slate-600">
                  <span
                    className="mt-[5px] h-3.5 w-3.5 shrink-0 rounded-[3px] border"
                    style={{ borderColor: "var(--rpt-neutral)" }}
                    aria-hidden
                  />
                  <span>{task}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

// ── TrapMeter — 함정 대응력 3단 스케일(+근거 m/n 표기) ─────────────────────────
export type TrapLevel = "HIGH" | "MID" | "LOW" | "UNKNOWN";
// 좌→우 스케일: 좋음(LOW) · 보통(MID) · 주의(HIGH). HIGH = 함정에 잘 걸림 = 주의.
const TRAP_SCALE: { key: Exclude<TrapLevel, "UNKNOWN">; label: string; color: string }[] = [
  { key: "LOW", label: "좋음", color: "var(--rpt-ok)" },
  { key: "MID", label: "보통", color: "var(--rpt-primary)" },
  { key: "HIGH", label: "주의", color: "var(--rpt-bad)" },
];
export function TrapMeter({
  level,
  hits,
  total,
}: {
  level: TrapLevel;
  /** 설계 함정 적중 건수(m) — 있으면 "n건 중 m건" 근거를 명시 */
  hits?: number;
  /** 판정 대상 오답 건수(n) */
  total?: number;
}) {
  const activeIndex = TRAP_SCALE.findIndex((s) => s.key === level);
  const active = activeIndex >= 0 ? TRAP_SCALE[activeIndex] : null;
  const hasEvidence = hits != null && total != null && total > 0;
  return (
    <div
      className="flex flex-col gap-2"
      role="img"
      aria-label={`함정 대응력 ${active ? active.label : "판정 보류(표본 부족)"}${
        hasEvidence ? ` — 선지 기록 오답 ${total}건 중 설계 함정 ${hits}건 적중` : ""
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span
          className="text-sm font-bold"
          style={{ color: active ? active.color : "var(--rpt-neutral)" }}
        >
          함정 대응력: {active ? active.label : "판정 보류"}
        </span>
        {hasEvidence && (
          <span className="tabular-nums text-xs text-slate-500">
            오답 {formatReportNumber(total)}건 중{" "}
            <strong className="font-bold" style={{ color: active ? active.color : undefined }}>
              {formatReportNumber(hits)}건
            </strong>{" "}
            설계 함정 적중
          </span>
        )}
      </div>
      {/* UNKNOWN(판정 보류)에는 게이지를 그리지 않는다 — 채움 없는 스케일 위에
          좋음/보통/주의 라벨만 떠 있으면 상태로 오독되기 때문(감사 P1). */}
      {active && (
        <div className="flex gap-1.5">
          {TRAP_SCALE.map((seg, i) => {
            const isActive = i === activeIndex;
            return (
              <div key={seg.key} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className="h-2 w-full rounded-full"
                  style={{ background: isActive ? seg.color : "var(--rpt-tint)" }}
                  aria-hidden
                />
                <span
                  className="text-[10px] leading-none"
                  style={{ color: isActive ? seg.color : "transparent" }}
                  aria-hidden
                >
                  ▲
                </span>
                <span
                  className={`text-[11px] ${isActive ? "font-bold" : "text-slate-400"}`}
                  style={isActive ? { color: seg.color } : undefined}
                >
                  {seg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {/* 근거 캡션은 판정이 있을 때만 — 보류 시의 사유 설명은 소비자(함정 분석
          섹션)의 보류 노트가 전담한다. 이중 표기 금지. */}
      {active && <p className="text-[11px] text-slate-400">설계된 함정 선지를 고른 비율 기반</p>}
    </div>
  );
}
