"use client";

// 학생 상세 허브 — 어법 분석 서브뷰 (개념 숙달 히트맵 + 보충 필요 랭킹 + 14일 활동 + 축별 정답률).
// grammar-tab.tsx 에서 분리(500줄 계약). v3 대개편 A-2 — 탭 패밀리 견본.
//
// v3 design §D1-3 어법 탭 [D] 카드 그리드:
//  - 2열 그리드, 행별 고정 높이 + 내부 스크롤(규칙 R2 — 카드 셸은 AnalyticsCard 만).
//    1행 개념 숙달 지도·보충 필요 개념 랭킹(h-[420px] 페어) / 2행 활동·축별(h-[360px] 페어).
//  - 히트 색은 display.ts masteryHeatClass 정본 유지(규칙 R4 — kit heatToneByRate 와
//    임계 동일, 어법은 기존 5단 존중 — §D1-3 ③).
//  - 셀 클릭 → 팝오버: scoreExplain 병기(규칙 R10) + 「시도 기록 보기」(기존 드릴다운
//    보존) + WeakPointCta row형 병치(§D1-3 ②).
//  - 랭킹 행·셀 팝오버의 배포는 WeakSpot 계약(§D2-1)으로 셸 onDeploy 에 넘긴다.
//    A-4 배선 전(onDeploy 부재)에는 onOpenWeakComposer([해당 1건]) 폴백(과도기 계약).

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, BarChart3, LayoutGrid, Target } from "lucide-react";
import type { GrammarLabStudentDetail } from "@/actions/grammar-drill-admin";
import type { WeakConceptPreset } from "@/components/study-assignments/composer-grammar-spec";
import {
  DIFFICULTY_LABEL,
  GRAMMAR_SOURCE_LABEL,
  GRAMMAR_STAGE_LABEL,
  GRAMMAR_TYPE_LABEL,
  MASTERY_HEAT_LEGEND,
  masteryHeatClass,
} from "@/lib/grammar-drill/display";
import {
  MIN_ATTEMPTS,
  STALE_DAYS,
  WEAK_SCORE,
  selectWeakConcepts,
  type WeakConceptEntry,
} from "@/lib/grammar-drill/weakness";
import type { WeakSpot } from "@/lib/student-analytics/types";
import {
  CTA_LABELS,
  EMPTY_STATES,
  METRIC_HELP,
  METRIC_LABELS,
  scoreExplain,
} from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";
import { AnalyticsCard, CardEmpty, MetricHelpTip } from "./analytics/kit";
import { WeakPointCta, WeakSpotRow } from "./analytics/weak-spot-row";

/** 히트 셀 클릭 드릴다운 페이로드 — 시도 기록 뷰의 개념 필터 프리셋 */
export interface ConceptDrillTarget {
  conceptId: string;
  title: string;
}

/** grid 개념 행 — 서버 산출 형태(grammar-drill-admin/students.ts) */
type GridConcept = GrammarLabStudentDetail["grid"][number]["concepts"][number];

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** grid 개념 행 → 선정기 반환 계약(WeakConceptEntry) 사상 — 셀 팝오버용 */
function toEntry(c: GridConcept): WeakConceptEntry {
  return {
    conceptId: c.conceptId,
    title: c.title,
    score: c.score,
    attempts: c.attempts,
    correct: c.correct,
    wrong: Math.max(0, c.attempts - c.correct),
    lastAttemptAt: c.lastAttemptAt,
  };
}

/**
 * 개념 1건 → WeakSpot 사상 — §D2-2 매핑표 정본:
 * 「어법 탭 개념 랭킹·히트맵 셀 | GRAMMAR | conceptIds:[해당], count 10」.
 * weakConcepts 는 WeakConceptPreset 의 구조적 상위집합(attempts·wrong additive).
 */
function toConceptSpot(entry: WeakConceptEntry): WeakSpot {
  return {
    domain: "grammar",
    axis: "concept",
    key: entry.conceptId,
    label: entry.title,
    metric: { kind: "mastery", value: entry.score },
    evidence: { attempts: entry.attempts, wrong: entry.wrong },
    deploy: {
      kind: "GRAMMAR",
      grammarSpec: { conceptIds: [entry.conceptId], count: 10 },
      weakConcepts: [entry],
    },
  };
}

/** 셀 팝오버 상태 — fixed 좌표(카드 내부 스크롤의 overflow 클리핑 회피) */
interface CellPop {
  entry: WeakConceptEntry;
  left: number;
  top: number;
}

export function GrammarAnalysis({
  detail,
  onConceptDrill,
  onDeploy,
  onOpenWeakComposer,
}: {
  detail: GrammarLabStudentDetail;
  onConceptDrill: (target: ConceptDrillTarget) => void;
  /** 셸 openDeployComposer 배선 지점(§D2-1) — A-4 전 optional */
  onDeploy?: (spots: WeakSpot[], source: "grammar") => void;
  /** onDeploy 부재 시 폴백 — 기존 컴포저 프리셋 경로(과도기 동작 보장) */
  onOpenWeakComposer: (weak: WeakConceptPreset[]) => void;
}) {
  const parts = [1, 2, 3] as const;
  const partNames: Record<number, string> = { 1: "1부 골격기", 2: "2부 연결기", 3: "3부 정밀기" };
  const maxSolved = Math.max(1, ...detail.days.map((d) => d.solved));
  const total14 = detail.days.reduce((sum, d) => sum + d.solved, 0);
  const correct14 = detail.days.reduce((sum, d) => sum + d.correct, 0);

  // 보충 필요 랭킹 — 신설 판정 기본 컷오프 60, 점수 오름차순(§D1-3 ①)
  const weakAll = useMemo(
    () => selectWeakConcepts(detail.grid, { cutoff: WEAK_SCORE }),
    [detail],
  );
  const [weakOpen, setWeakOpen] = useState(false);
  const weakVisible = weakOpen ? weakAll : weakAll.slice(0, 5);
  // 표본(3회 이상 시도) 자체가 없으면 D6-3 「시도 수 미달」 문구를 쓴다
  const hasSample = useMemo(
    () => detail.grid.some((u) => u.concepts.some((c) => c.attempts >= MIN_ATTEMPTS)),
    [detail],
  );

  const [cellPop, setCellPop] = useState<CellPop | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // 팝오버 닫힘 — 바깥 클릭 · Escape · 스크롤(fixed 좌표가 어긋나므로 즉시 닫는다)
  useEffect(() => {
    if (!cellPop) return;
    const onDown = (ev: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(ev.target as Node)) setCellPop(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setCellPop(null);
    };
    const onScroll = () => setCellPop(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [cellPop]);

  const openCellPop = (ev: React.MouseEvent<HTMLButtonElement>, c: GridConcept) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const half = 132; // 팝오버 w-64 절반 + 여백 — 뷰포트 좌우로 잘리지 않게 클램프
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, half),
      window.innerWidth - half,
    );
    setCellPop({ entry: toEntry(c), left, top: rect.bottom + 6 });
  };

  // 배포 단일 경로 — onDeploy(WeakSpot) 우선, 부재 시 기존 프리셋 폴백(§D1-3 ①)
  const deployConcept = (entry: WeakConceptEntry) => {
    if (onDeploy) {
      onDeploy([toConceptSpot(entry)], "grammar");
    } else {
      onOpenWeakComposer([
        { conceptId: entry.conceptId, title: entry.title, score: entry.score },
      ]);
    }
  };

  const hasAxis = [detail.byType, detail.byDifficulty, detail.bySource].some((m) =>
    Object.values(m).some((v) => v.total > 0),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 1행 좌 — 개념 숙달 히트맵 (R2: 고정 높이+내부 스크롤, 색은 masteryHeatClass 정본) */}
      <AnalyticsCard
        className="h-[420px]"
        icon={<LayoutGrid className="size-4 text-blue-600" aria-hidden />}
        title="개념 숙달 지도"
        aside={<MetricHelpTip text={METRIC_HELP.MASTERY} />}
        toolbar={
          // masteryHeatClass 실제 5단 스케일 범례 + 미시도 구분
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-slate-400">
            {MASTERY_HEAT_LEGEND.map((step) => (
              <span key={step.label} className="inline-flex items-center gap-1 tabular-nums">
                <span className={cn("size-2.5 rounded-[3px]", step.swatch)} aria-hidden />
                {step.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-[3px] bg-slate-100" aria-hidden />
              미시도 —
            </span>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {parts.map((part) => {
            const units = detail.grid.filter((u) => u.part === part);
            const mastered = units.filter((u) => u.stage === "MASTERED").length;
            return (
              <div key={part}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11.5px] font-bold text-slate-400">{partNames[part]}</p>
                  <p className="text-[10.5px] font-semibold tabular-nums text-slate-300">
                    마스터 {mastered}/{units.length}
                  </p>
                </div>
                <div className="flex flex-col gap-2.5">
                  {units.map((u) => (
                    // 스택형 2단 — 제목 줄(폭 제약 없음)과 셀 줄. 어떤 제목도 자르지 않는다.
                    <div key={u.unitId} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 break-keep text-[11.5px] text-slate-600">
                          {u.title}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[10px] font-semibold",
                            u.stage === "MASTERED" ? "text-emerald-600" : "text-slate-300",
                          )}
                        >
                          {GRAMMAR_STAGE_LABEL[u.stage] ?? u.stage}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {u.concepts.map((c) => {
                          const since = daysSince(c.lastAttemptAt);
                          const stale =
                            c.attempts > 0 &&
                            c.score >= WEAK_SCORE &&
                            since !== null &&
                            since > STALE_DAYS;
                          const stateText =
                            c.attempts > 0
                              ? `숙달 ${c.score}점 · ${c.attempts}회 시도`
                              : "기록 없음";
                          return (
                            <button
                              key={c.conceptId}
                              type="button"
                              onClick={(ev) => openCellPop(ev, c)}
                              aria-haspopup="dialog"
                              aria-expanded={cellPop?.entry.conceptId === c.conceptId}
                              title={
                                `${c.title} · ${stateText}` +
                                (stale ? ` · 마지막 시도 ${since}일 전 · 복습 권장` : "")
                              }
                              aria-label={`${c.title} — ${stateText}. 상세 열기`}
                              className={cn(
                                "flex h-6 flex-1 items-center justify-center rounded text-[10px] font-bold tabular-nums transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                                masteryHeatClass(c.score, c.attempts),
                                stale ? "ring-1 ring-violet-300" : null,
                              )}
                            >
                              {c.attempts > 0 ? (
                                c.score
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </AnalyticsCard>

      {/* 1행 우 — 보충 필요 개념 랭킹(§D1-3 ① 신설) — 접힘 상위 5 + 전체 펼침 */}
      <AnalyticsCard
        className="h-[420px]"
        icon={<Target className="size-4 text-rose-500" aria-hidden />}
        title={`${METRIC_LABELS.WEAK} 개념`}
        aside={
          <span className="flex items-center gap-1.5">
            {weakAll.length > 0 ? (
              // R5 — 보충 필요 수는 rose 배지
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-rose-600">
                {weakAll.length}
              </span>
            ) : null}
            <MetricHelpTip text={METRIC_HELP.WEAK} />
          </span>
        }
      >
        {weakAll.length === 0 ? (
          <CardEmpty
            text={
              hasSample
                ? `지금은 ${METRIC_LABELS.WEAK} 개념이 없습니다.`
                : EMPTY_STATES.WEAK_CARD_INSUFFICIENT.message
            }
          />
        ) : (
          <>
            <div className="flex flex-col divide-y divide-slate-50">
              {weakVisible.map((entry) => (
                <WeakSpotRow
                  key={entry.conceptId}
                  spot={toConceptSpot(entry)}
                  scoreExplain={scoreExplain({
                    score: entry.score,
                    attempts: entry.attempts,
                    wrong: entry.wrong,
                  })}
                  onDeploy={() => deployConcept(entry)}
                  labelClassName="w-[132px]"
                />
              ))}
            </div>
            {weakAll.length > 5 ? (
              <button
                type="button"
                onClick={() => setWeakOpen((v) => !v)}
                className="mt-1 w-full rounded-md py-1.5 text-center text-[12px] font-semibold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
              >
                {weakOpen ? "접기" : `전체 ${weakAll.length}개 보기`}
              </button>
            ) : null}
          </>
        )}
      </AnalyticsCard>

      {/* 2행 좌 — 최근 14일 활동 */}
      <AnalyticsCard
        className="h-[360px]"
        icon={<Activity className="size-4 text-blue-600" aria-hidden />}
        title="최근 14일 활동"
        aside={
          total14 > 0 ? (
            <span className="text-[12px] tabular-nums text-slate-400">
              {total14}문항 · 정답률 {Math.round((correct14 / total14) * 100)}%
            </span>
          ) : null
        }
      >
        <p className="sr-only">
          최근 14일 동안 {total14}문항을 풀었고 정답률은{" "}
          {total14 > 0 ? Math.round((correct14 / total14) * 100) : 0}%입니다.
        </p>
        <div className="flex h-24 items-end gap-1" aria-hidden>
          {detail.days.map((d) => {
            const h = d.solved > 0 ? Math.max(8, (d.solved / maxSolved) * 100) : 0;
            const acc = d.solved > 0 ? d.correct / d.solved : 0;
            const dateLabel = new Date(
              Date.now() - d.offset * 86_400_000,
            ).toLocaleDateString("ko-KR", {
              timeZone: "Asia/Seoul",
              month: "long",
              day: "numeric",
              weekday: "short",
            });
            return (
              <div
                key={d.offset}
                className="flex h-full flex-1 flex-col justify-end"
                title={`${dateLabel} · ${d.solved}문항 · 정답 ${d.correct}`}
              >
                {d.solved === 0 ? (
                  // 0일 베이스라인 — 빈 날과 미렌더를 구분
                  <div className="h-[3px] w-full rounded-t bg-slate-100" />
                ) : (
                  <div
                    style={{ height: `${h}%` }}
                    className={cn(
                      "w-full rounded-t",
                      acc >= 0.7 ? "bg-blue-500" : acc >= 0.5 ? "bg-blue-300" : "bg-rose-300",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1" aria-hidden>
          {detail.days.map((d) => {
            const weekday = new Date(
              Date.now() - d.offset * 86_400_000,
            ).toLocaleDateString("ko-KR", {
              timeZone: "Asia/Seoul",
              weekday: "narrow",
            });
            return (
              <span
                key={d.offset}
                className={cn(
                  "flex-1 text-center text-[9px]",
                  d.offset === 0 ? "font-semibold text-blue-600" : "text-slate-300",
                )}
              >
                {weekday}
              </span>
            );
          })}
        </div>
      </AnalyticsCard>

      {/* 2행 우 — 축별 정답률 (유형·난이도·모드 — byDifficulty 는 서버가 이미 반환) */}
      <AnalyticsCard
        className="h-[360px]"
        icon={<BarChart3 className="size-4 text-blue-600" aria-hidden />}
        title="축별 정답률"
      >
        {hasAxis ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <AxisRates title="유형" entries={detail.byType} labels={GRAMMAR_TYPE_LABEL} />
            <AxisRates
              title="난이도"
              entries={detail.byDifficulty}
              labels={DIFFICULTY_LABEL}
            />
            <AxisRates
              title="모드"
              entries={detail.bySource}
              labels={GRAMMAR_SOURCE_LABEL}
            />
          </div>
        ) : (
          <CardEmpty text="아직 문항 기록이 없습니다." />
        )}
      </AnalyticsCard>

      {/* 히트 셀 팝오버 — scoreExplain 병기(R10) + 드릴다운 보존 + row형 CTA(§D1-3 ②) */}
      {cellPop ? (
        <div
          ref={popRef}
          role="dialog"
          aria-label={`${cellPop.entry.title} 상세`}
          className="fixed z-50 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
          style={{ left: cellPop.left, top: cellPop.top }}
        >
          <p className="text-[12.5px] font-bold text-slate-700">{cellPop.entry.title}</p>
          <p className="mt-0.5 text-[11.5px] text-slate-400">
            {scoreExplain({
              score: cellPop.entry.score,
              attempts: cellPop.entry.attempts,
              wrong: cellPop.entry.wrong,
            })}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onConceptDrill({
                  conceptId: cellPop.entry.conceptId,
                  title: cellPop.entry.title,
                });
                setCellPop(null);
              }}
              className="inline-flex h-6 shrink-0 items-center rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              {CTA_LABELS.VIEW_ATTEMPTS}
            </button>
            <WeakPointCta
              variant="row"
              onClick={() => {
                deployConcept(cellPop.entry);
                setCellPop(null);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AxisRates({
  title,
  entries,
  labels,
}: {
  title: string;
  entries: Record<string, { total: number; correct: number }>;
  labels: Record<string, string>;
}) {
  const rows = Object.entries(entries).filter(([, v]) => v.total > 0);
  if (rows.length === 0) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-semibold text-slate-400">{title}</p>
      <div className="flex flex-col gap-1.5">
        {rows.map(([key, v]) => {
          const rate = Math.round((v.correct / v.total) * 100);
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="w-[76px] shrink-0 truncate text-[11.5px] text-slate-500">
                {labels[key] ?? key}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-full rounded-full",
                    rate >= 70 ? "bg-blue-500" : rate >= 50 ? "bg-blue-300" : "bg-rose-400",
                  )}
                  style={{ width: `${rate}%` }}
                />
              </div>
              <span className="w-20 shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-slate-500">
                {rate}% <span className="text-slate-300">({v.total})</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
