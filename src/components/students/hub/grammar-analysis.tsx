"use client";

// 학생 상세 허브 — 어법 분석 서브뷰 (개념 숙달 히트맵 + 14일 활동 + 축별 정답률).
// grammar-tab.tsx 에서 분리(500줄 계약). 히트 셀 클릭 → 시도 기록 드릴다운.

import type { GrammarLabStudentDetail } from "@/actions/grammar-drill-admin";
import {
  DIFFICULTY_LABEL,
  GRAMMAR_SOURCE_LABEL,
  GRAMMAR_STAGE_LABEL,
  GRAMMAR_TYPE_LABEL,
  MASTERY_HEAT_LEGEND,
  masteryHeatClass,
} from "@/lib/grammar-drill/display";
import { cn } from "@/lib/utils";

/** 히트 셀 클릭 드릴다운 페이로드 — 시도 기록 뷰의 개념 필터 프리셋 */
export interface ConceptDrillTarget {
  conceptId: string;
  title: string;
}

// 장기 미복습 판정(표시용 휴리스틱) — 라이트너 복습 주기와는 무관한
// 단순 경과일 신호다. 숙달 60+ 인데 3주 넘게 손을 안 댄 개념만 표시한다.
const STALE_SCORE_MIN = 60;
const STALE_DAYS = 21;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** 숙달됐지만 장기 미복습인 개념 목록 — '복습 과제 만들기' CTA 의 데이터원 */
export function collectStaleConcepts(
  detail: GrammarLabStudentDetail,
): { conceptId: string; title: string; score: number }[] {
  return detail.grid
    .flatMap((u) => u.concepts)
    .filter((c) => {
      const d = daysSince(c.lastAttemptAt);
      return (
        c.attempts > 0 && c.score >= STALE_SCORE_MIN && d !== null && d > STALE_DAYS
      );
    })
    .map((c) => ({ conceptId: c.conceptId, title: c.title, score: c.score }));
}

export function GrammarAnalysis({
  detail,
  onConceptDrill,
}: {
  detail: GrammarLabStudentDetail;
  onConceptDrill: (target: ConceptDrillTarget) => void;
}) {
  const parts = [1, 2, 3] as const;
  const partNames: Record<number, string> = { 1: "1부 골격기", 2: "2부 연결기", 3: "3부 정밀기" };
  const maxSolved = Math.max(1, ...detail.days.map((d) => d.solved));
  const total14 = detail.days.reduce((sum, d) => sum + d.solved, 0);
  const correct14 = detail.days.reduce((sum, d) => sum + d.correct, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* 개념 숙달 히트맵 */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-[12.5px] font-bold text-slate-600">개념 숙달 지도</p>
          {/* masteryHeatClass 실제 5단 스케일 범례 + 미시도 구분 */}
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
        </div>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {parts.map((part) => {
            const units = detail.grid.filter((u) => u.part === part);
            const mastered = units.filter((u) => u.stage === "MASTERED").length;
            return (
              <div key={part} className="rounded-lg border border-slate-200 bg-white p-3">
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
                            c.score >= STALE_SCORE_MIN &&
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
                              onClick={() =>
                                onConceptDrill({ conceptId: c.conceptId, title: c.title })
                              }
                              title={
                                `${c.title} · ${stateText}` +
                                (stale ? ` · 마지막 시도 ${since}일 전 · 복습 권장` : "")
                              }
                              aria-label={`${c.title} — ${stateText}. 시도 기록 보기`}
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
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* 최근 14일 활동 */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <p className="mb-3 text-[12.5px] font-bold text-slate-600">최근 14일 활동</p>
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
        </div>

        {/* 축별 정답률 — 유형·난이도·모드 (byDifficulty 는 서버가 이미 반환) */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <p className="mb-3 text-[12.5px] font-bold text-slate-600">축별 정답률</p>
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
        </div>
      </div>
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
