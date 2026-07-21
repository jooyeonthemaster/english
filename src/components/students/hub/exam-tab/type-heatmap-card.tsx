"use client";

// 시험 탭 — 유형별 정답률 히트맵 카드 (v3 대개편 A-1, v3 design §D1-3 시험 와이어 [D] 1행 우)
//
// 구 exam-history-parts/type-heatmap.tsx 로직 이식. 변경분:
//  - 색: 구 blue 6단 폐기 → kit heatToneByRate/HeatCell 5단(R4 — 낮을수록 붉다.
//    emerald→rose, masteryHeatClass 와 동일 임계 — 3탭 공통 의미).
//  - 지표명 「유형별 정답률」(METRIC_LABELS.ACCURACY_BY_TYPE — 시험엔 재시도
//    개념이 없으므로 학습지 전용 지표명 오용 금지, D6).
//  - 셀 클릭 → fixed 좌표 팝오버(A-2 어법 견본 관용구 — outside/Escape/scroll
//    닫힘): 유형 전 회차 합산 「정답률 33% (3/9)」 + WeakPointCta card형.
//  - 배포 계약(§D2-2): TrendTypeStat 은 typeLabel 만 보유 →
//    examSubTypesByLabel(label) 역인덱스로 QUESTIONS 프리필터를 만든다.
//    역매핑 0건이면 deploy=null — CTA 비활성 + 사유 툴팁(DEPLOY_DISABLED_REASONS).
//  - onDeploy 미전달 시 CTA 자체를 렌더하지 않는다(A-4 배선 전 과도기 계약).

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import type { TrendSitting, TrendTypeStat } from "@/lib/exam-scoring/trend";
import { examSubTypesByLabel } from "@/lib/student-analytics/resolvers";
import type { WeakSpot } from "@/lib/student-analytics/types";
import {
  DEPLOY_DISABLED_REASONS,
  METRIC_HELP,
  METRIC_LABELS,
  accuracyExplain,
} from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";
import { AnalyticsCard, CardEmpty, MetricHelpTip, heatToneByRate } from "../analytics/kit";
import { WeakPointCta } from "../analytics/weak-spot-row";

/** 유형 1개의 전 회차 합산 — 팝오버·WeakSpot 근거(배포 대상은 유형 자체) */
interface TypeAggregate {
  label: string;
  correct: number;
  total: number;
}

/**
 * 유형 합산 1건 → WeakSpot 사상 — §D2-2 매핑표 정본:
 * 「시험 유형 히트맵 셀 | QUESTIONS | questionFilter.subTypes 프리필터」.
 * key 는 subType 코드(역매핑 첫 항목) — 미등록 라벨(커스텀/"기타")은 라벨 원문.
 */
function toTypeSpot(agg: TypeAggregate): WeakSpot {
  const subTypes = examSubTypesByLabel(agg.label);
  const rate = agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : 0;
  return {
    domain: "exam",
    axis: "exam-type",
    key: subTypes[0] ?? agg.label,
    label: agg.label,
    metric: { kind: "accuracy", value: rate },
    evidence: { attempts: agg.total, wrong: Math.max(0, agg.total - agg.correct) },
    deploy:
      subTypes.length > 0
        ? { kind: "QUESTIONS", questionFilter: { subTypes } }
        : null,
  };
}

/** 셀 팝오버 상태 — fixed 좌표(카드 내부 스크롤의 overflow 클리핑 회피, A-2 관용) */
interface CellPop {
  agg: TypeAggregate;
  /** 클릭한 셀의 회차 문맥 — "3회 · 시험명 · 1/4" 보조 표기 */
  cell: { round: number; sittingTitle: string; correct: number; total: number } | null;
  left: number;
  top: number;
}

/** 범례 표본 — heatToneByRate 5단 경계 중앙값(R4 스케일 그대로 시각화) */
const LEGEND_RATES = [10, 30, 50, 70, 90] as const;

export function TypeHeatmapCard({
  sittings,
  onDeploy,
  className,
}: {
  /** 스코프 필터 적용 후 시계열(날짜 오름차순) — 열 축 = 회차 */
  sittings: TrendSitting[];
  /** 셸 openDeployComposer 배선 지점(§D2-1) — A-4 배선 전 optional, 미전달 시 CTA 미렌더 */
  onDeploy?: (spots: WeakSpot[], source: "exam") => void;
  className?: string;
}) {
  // 행 = 유형(첫 등장 순서 보존 — 시험지 순서 ≈ 유형 순서), 열 = 회차
  const { typeLabels, statMaps, aggregates } = useMemo(() => {
    const labels: string[] = [];
    const seen = new Set<string>();
    const maps: Map<string, TrendTypeStat>[] = [];
    const aggs = new Map<string, TypeAggregate>();
    for (const sitting of sittings) {
      const map = new Map<string, TrendTypeStat>();
      for (const stat of sitting.byType) {
        if (!seen.has(stat.typeLabel)) {
          seen.add(stat.typeLabel);
          labels.push(stat.typeLabel);
        }
        map.set(stat.typeLabel, stat);
        const agg = aggs.get(stat.typeLabel) ?? {
          label: stat.typeLabel,
          correct: 0,
          total: 0,
        };
        agg.correct += stat.correct;
        agg.total += stat.total;
        aggs.set(stat.typeLabel, agg);
      }
      maps.push(map);
    }
    return { typeLabels: labels, statMaps: maps, aggregates: aggs };
  }, [sittings]);

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

  const openCellPop = (
    anchor: HTMLElement,
    label: string,
    round: number,
    sittingTitle: string,
    stat: TrendTypeStat | undefined,
  ) => {
    const agg = aggregates.get(label);
    if (!agg) return;
    const rect = anchor.getBoundingClientRect();
    const half = 132; // 팝오버 w-64 절반 + 여백 — 뷰포트 좌우 클램프(A-2 관용)
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, half),
      window.innerWidth - half,
    );
    setCellPop({
      agg,
      cell: stat
        ? { round, sittingTitle, correct: stat.correct, total: stat.total }
        : null,
      left,
      top: rect.bottom + 6,
    });
  };

  const spot = cellPop ? toTypeSpot(cellPop.agg) : null;

  return (
    <AnalyticsCard
      className={className}
      icon={<LayoutGrid className="size-4 text-blue-600" aria-hidden />}
      title={METRIC_LABELS.ACCURACY_BY_TYPE}
      aside={<MetricHelpTip text={METRIC_HELP.ACCURACY} />}
      toolbar={
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-[3px] bg-slate-100" aria-hidden />
            기록 없음
          </span>
          <span className="inline-flex items-center gap-1">
            낮음
            {LEGEND_RATES.map((rate) => (
              <span
                key={rate}
                className={cn("size-2.5 rounded-[3px]", heatToneByRate(rate))}
                aria-hidden
              />
            ))}
            높음
          </span>
        </div>
      }
    >
      {typeLabels.length === 0 ? (
        <CardEmpty text="유형별 정오 데이터가 있는 응시가 아직 없습니다." />
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full align-top">
            {/* 헤더 행 — 회차 */}
            <div className="flex">
              <div className="sticky left-0 z-10 w-32 shrink-0 bg-white" />
              {sittings.map((sitting, i) => (
                <div
                  key={sitting.refId}
                  className="w-13 shrink-0 pb-1 text-center text-[11px] tabular-nums text-slate-400"
                  title={`${i + 1}회 · ${sitting.title} (${sitting.date.slice(0, 10)})`}
                >
                  {i + 1}회
                </div>
              ))}
            </div>

            {/* 유형 행 — 셀 클릭 → 팝오버(전 회차 합산 + 배포 CTA) */}
            {typeLabels.map((label) => (
              <div key={label} className="flex items-center py-0.5">
                <div className="sticky left-0 z-10 w-32 shrink-0 bg-white pr-2">
                  <span className="block truncate text-[12px] text-slate-600" title={label}>
                    {label}
                  </span>
                </div>
                {sittings.map((sitting, i) => {
                  const stat = statMaps[i].get(label);
                  const attempts = stat?.total ?? 0;
                  const rate =
                    stat && stat.total > 0 ? (stat.correct / stat.total) * 100 : 0;
                  return (
                    <div key={sitting.refId} className="w-13 shrink-0 p-0.5">
                      {/* 셀 버튼 — 톤은 kit heatToneByRate 5단(R4). 팝오버 anchor
                          좌표가 필요해 kit HeatCell 대신 A-2 견본의 버튼 관용구 */}
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        aria-expanded={
                          cellPop?.agg.label === label &&
                          cellPop.cell?.round === i + 1
                        }
                        title={
                          stat
                            ? `${label} · ${sitting.title} · ${stat.correct}/${stat.total}`
                            : `${label} · ${sitting.title} · 기록 없음`
                        }
                        onClick={(ev) =>
                          openCellPop(ev.currentTarget, label, i + 1, sitting.title, stat)
                        }
                        className={cn(
                          "inline-flex h-7 w-full items-center justify-center rounded px-1 text-[12px] font-semibold tabular-nums transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                          heatToneByRate(rate, attempts),
                        )}
                      >
                        {attempts > 0 ? `${Math.round(rate)}%` : "—"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 셀 팝오버 — 「유형 X 정답률 33% (3/9)」 + card형 CTA(§D1-3 시험 와이어) */}
      {cellPop && spot ? (
        <div
          ref={popRef}
          role="dialog"
          aria-label={`${cellPop.agg.label} 상세`}
          className="fixed z-50 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
          style={{ left: cellPop.left, top: cellPop.top }}
        >
          <p className="text-[12.5px] font-bold text-slate-700">{cellPop.agg.label}</p>
          <p className="mt-0.5 text-[11.5px] text-slate-400">
            {accuracyExplain({ correct: cellPop.agg.correct, total: cellPop.agg.total })}
            {" · 전체 회차 합산"}
          </p>
          {cellPop.cell ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-300">
              {cellPop.cell.round}회 {cellPop.cell.sittingTitle} ·{" "}
              {cellPop.cell.correct}/{cellPop.cell.total} 정답
            </p>
          ) : null}
          {onDeploy ? (
            <div className="mt-2">
              <WeakPointCta
                variant="card"
                disabled={spot.deploy === null}
                disabledTitle={
                  spot.deploy === null
                    ? DEPLOY_DISABLED_REASONS.EXAM_TYPE_UNMAPPED
                    : undefined
                }
                onClick={() => {
                  onDeploy([spot], "exam");
                  setCellPop(null);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </AnalyticsCard>
  );
}
