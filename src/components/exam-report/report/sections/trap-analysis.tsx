"use client";

// ============================================================================
// 함정 분석 섹션 — 출제 설계와 학생 선택의 대조 기록
//
// 구성: ⓪ 리드인 1줄(계약 §1.5 — 설계 함정 선지와 학생 선택의 대조임을 명시)
// ① TrapMeter(3단 판정 + "오답 n건 중 m건 적중" 근거 수치 — 카드 목록에서
// 재검증 가능한 결정론 집계) ② UNKNOWN(표본<3) 시 판정 보류를 정직하게 표기
// ③ 문항별 함정 카드 — 학생이 실제로 문 미끼(선택 선지 ①~⑤, bad 색 대형 마크)가
// 카드의 주인공이다: "어디서 어떻게 걸렸나"를 지면에 박제한다. 8건 초과 시
// .rpt-scroll 캡(인쇄 자동 확장).
//
// 빈 상태(표본 0건)는 게이지를 접고 대시 패널 한 장·한 갈래 메시지로 수렴한다 —
// 미터+생략 안내 이중 표기 금지(감사 P1). UNKNOWN 시에는 내러티브 직전에
// "총평은 시험지 전체 해석" 완충 리드아웃을 깔아 데이터-내러티브 모순을 끊는다.
//
// 상태 부호화: 카드 좌상단 헤어라인 선두 세그먼트(섹션 헤더 문법의 카드 미러) —
// 설계 함정 적중 = bad, 일반 오답 = neutral. 라벨(▲ 설계된 함정 / 일반 오답)과
// 색의 이중 부호화. 수치는 전부 formatReportNumber, 색은 --rpt-* 변수만.
// ============================================================================

import type { CSSProperties } from "react";
import type { TrapAnalysisSection } from "@/lib/exam-report/report-schema";
import { TrapMeter } from "../report-charts";
import { formatReportNumber } from "../report-format";
import { renderNarrative } from "../report-narrative";
import { SectionShell, type ReportRenderMode } from "./section-shell";

interface Props {
  section: TrapAnalysisSection;
  mode: ReportRenderMode;
  onChange?: (next: TrapAnalysisSection) => void;
}

const CIRCLED = ["①", "②", "③", "④", "⑤"];
/** 선지 토큰("1"~"5")을 ①~⑤ 로 — 그 외 형식(비정수 포함)은 원문 그대로. */
function circled(choice?: string): string {
  if (!choice) return "";
  const n = Number(choice);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? CIRCLED[n - 1] : choice;
}

/** 카드 리빌 스태거 — 최대 5단(모션 규약) */
const revealDelay = (i: number): CSSProperties =>
  ({ "--reveal-delay": `${Math.min(i, 4) * 70}ms` }) as CSSProperties;

export function TrapAnalysisSectionView({ section, mode, onChange }: Props) {
  const { items, trapSusceptibility } = section.data;
  // TrapMeter 근거 수치 — 결정론 데이터(items)에서 그대로 재집계한다.
  const total = items.length;
  const hits = items.filter((it) => it.wasDesignedTrap).length;

  return (
    <SectionShell
      heading={section.heading}
      narrative={section.narrative}
      hidden={section.hidden}
      mode={mode}
      kicker="TRAP ANALYSIS"
      onPatch={(patch) => onChange?.({ ...section, ...patch })}
    >
      <div className="flex flex-col gap-4">
        {/* 리드인(계약 §1.5) — 이 섹션이 무엇의 대조인지 한 줄로 못박는다 */}
        <p className="break-keep text-[13px] leading-relaxed text-slate-500" data-reveal>
          출제자가 문항마다 심어 둔 매력적인 오답(설계 함정)을 학생이 실제로 골랐는지, 오답의
          선지 기록 단위로 대조한 결과입니다.
        </p>

        {/* ── 판정 패널: 미터 + m/n 근거 (+ 표본 1~2건 시 보류 사유) ──────────
            표본 0건이면 미터를 접고 아래 빈 상태 패널 한 장으로 수렴한다. */}
        {total > 0 && (
          <div
            className="rpt-card rounded-xl border p-4 @min-[640px]:p-5"
            style={{ borderColor: "var(--rpt-line)", background: "var(--rpt-surface)" }}
            data-reveal
          >
            <TrapMeter level={trapSusceptibility} hits={hits} total={total} />
            {trapSusceptibility === "UNKNOWN" && (
              <p className="mt-3 border-t pt-3 text-xs leading-5 text-slate-500" style={{ borderColor: "var(--rpt-line)" }}>
                선지 기록이 남은 오답이 {formatReportNumber(total)}건뿐이라 성향 판정을{" "}
                <span className="font-semibold">보류</span>했습니다 — 판정에는 3건 이상의
                표본이 필요합니다.
              </p>
            )}
          </div>
        )}

        {/* ── 문항별 함정 카드 — 8건 초과 시 내부 스크롤 캡(강령 §1.1-③) ────── */}
        {items.length > 0 ? (
          <ul
            className={`flex flex-col gap-3${items.length > 8 ? " rpt-scroll" : ""}`}
            style={
              items.length > 8
                ? ({ "--rpt-scroll-max": "560px" } as CSSProperties)
                : undefined
            }
          >
            {items.map((item, i) => (
              <li
                key={`${item.number}-${i}`}
                className="rpt-card relative overflow-hidden rounded-xl border p-4"
                style={{ borderColor: "var(--rpt-line)", ...revealDelay(i) }}
                data-reveal
              >
                {/* 상단 세그먼트 — 섹션 헤어라인 문법의 카드 미러(상태색) */}
                <span
                  className="absolute left-0 top-0 h-[2px] w-8"
                  style={{
                    background: item.wasDesignedTrap ? "var(--rpt-bad)" : "var(--rpt-neutral)",
                  }}
                  aria-hidden
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span
                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-xs font-bold tabular-nums text-slate-700"
                    style={{ borderColor: "var(--rpt-line)" }}
                  >
                    {item.number}
                  </span>
                  {item.chosenChoice && (
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-[11px] font-medium tracking-[0.06em] text-slate-400">
                        선택
                      </span>
                      <span
                        className="text-xl font-bold leading-none"
                        style={{ color: "var(--rpt-bad)" }}
                        aria-label={`선택한 선지 ${item.chosenChoice}번`}
                      >
                        {circled(item.chosenChoice)}
                      </span>
                    </span>
                  )}
                  <span
                    className="ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                    style={
                      item.wasDesignedTrap
                        ? {
                            color: "var(--rpt-bad)",
                            borderColor: "color-mix(in srgb, var(--rpt-bad) 35%, transparent)",
                            background: "color-mix(in srgb, var(--rpt-bad) 7%, transparent)",
                          }
                        : {
                            color: "var(--rpt-neutral)",
                            borderColor: "var(--rpt-line)",
                            background: "transparent",
                          }
                    }
                  >
                    <span aria-hidden>{item.wasDesignedTrap ? "▲" : "·"}</span>
                    {item.wasDesignedTrap ? "설계된 함정" : "일반 오답"}
                  </span>
                </div>
                {item.trapWhy.trim().length > 0 && (
                  <div className="mt-2.5 flex flex-col gap-2 text-sm leading-[1.8] text-slate-600">
                    {renderNarrative(item.trapWhy)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          /* 빈 상태 — 게이지 없이 한 장·한 갈래 메시지(판정 보류 + 사유) */
          <div
            className="rounded-xl border border-dashed px-4 py-5 text-center"
            style={{ borderColor: "var(--rpt-line)" }}
            data-reveal
          >
            <p className="text-sm font-bold" style={{ color: "var(--rpt-neutral)" }}>
              함정 대응력: 판정 보류
            </p>
            <p className="mx-auto mt-1.5 max-w-[34rem] break-keep text-[13px] leading-relaxed text-slate-400">
              선지 기록이 있는 객관식 오답이 없어 선지 대조를 생략했습니다 — 판정은 설계
              함정 선지를 실제로 고른 비율로만 계산합니다.
            </p>
          </div>
        )}

        {/* 완충 리드아웃 — 판정 보류인데 아래 총평이 함정 성과를 서술할 때, 두 층위의
            근거가 다름을 명시해 데이터-내러티브 모순을 끊는다(감사 P1) */}
        {trapSusceptibility === "UNKNOWN" && (
          <p className="break-keep text-xs leading-relaxed text-slate-400" data-reveal>
            아래 총평은 정답으로 통과한 문항까지 포함해 시험지 전체의 함정 설계를 읽어낸
            선생님의 해석으로, 위 선지 대조 표본과는 근거의 범위가 다릅니다.
          </p>
        )}
      </div>
    </SectionShell>
  );
}
