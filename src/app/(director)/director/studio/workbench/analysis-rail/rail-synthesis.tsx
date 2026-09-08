"use client";

// ============================================================================
// 레일 S2 「시험 총평」 집계 렌더 — 레일 전용 재설계(26-09-01 7차, 사용자 격노).
//
// 구 구현은 허브 ExamSynthesisPanel 을 그대로 이식했는데, 그쪽 유형 분포가
// 「라벨 ....... N문항 · 0점」 맨몸 텍스트 행 나열이라 유형 20개 시험에서
// 시각 위계 0 인 700px 벽이 섰다(실측 스크린샷 — "이건 아니지"). 여기는
// 레일 12px 스케일의 데이터 시각화로 다시 그린다:
// · 난이도: 세그먼트 바 1줄 + 도트 통계 1줄(2×2 그리드 폐기 — 세로 절약).
// · 유형 분포: 문항수 내림차순 정렬 + 행마다 비례 미니 바, **상위 7개만**
//   기본 노출(나머지는 접이) — 벽 대신 랭킹이 읽힌다. 0점은 표기 생략
//   (거의 전 행이 0점이라 노이즈), 배점 있는 유형만 점수 칩.
// 폭 플로어 296px: 라벨 truncate+title · 바 flex-1 · 수치 tabular-nums.
// ============================================================================

import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { ExamLevelAnalysis } from "@/lib/exam-report/types";
import { cn } from "@/lib/utils";

const BUCKETS: {
  key: keyof ExamLevelAnalysis["difficultyProfile"];
  label: string;
  bar: string;
  dot: string;
}[] = [
  { key: "easy", label: "쉬움", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  { key: "medium", label: "보통", bar: "bg-blue-500", dot: "bg-blue-500" },
  { key: "hard", label: "어려움", bar: "bg-amber-500", dot: "bg-amber-500" },
  { key: "killer", label: "킬러", bar: "bg-rose-500", dot: "bg-rose-500" },
];

const TYPE_VISIBLE_DEFAULT = 7;

export function RailSynthesis({
  examLevel,
}: {
  examLevel: ExamLevelAnalysis | null;
}) {
  const [allTypes, setAllTypes] = useState(false);

  const buckets = useMemo(() => {
    if (!examLevel) return [];
    return BUCKETS.map((b) => ({
      ...b,
      count: examLevel.difficultyProfile[b.key]?.length ?? 0,
    }));
  }, [examLevel]);
  const bucketTotal = buckets.reduce((s, b) => s + b.count, 0);

  const types = useMemo(() => {
    if (!examLevel) return [];
    return [...examLevel.typeDistribution]
      .map((t) => ({ ...t, count: t.numbers.length }))
      .sort((a, b) => b.count - a.count || b.points - a.points);
  }, [examLevel]);
  const typeMax = types.reduce((m, t) => Math.max(m, t.count), 0);
  const visibleTypes = allTypes ? types : types.slice(0, TYPE_VISIBLE_DEFAULT);
  const hiddenCount = types.length - TYPE_VISIBLE_DEFAULT;

  if (!examLevel) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center">
        <BarChart3 className="size-6 text-slate-300" aria-hidden="true" />
        <p className="break-keep text-[11px] leading-relaxed text-slate-400">
          모든 문항 분석이 끝나면 시험 전체 수준을 종합합니다
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2">
      {/* ── 난이도 프로필 — 세그먼트 바 + 도트 통계 1줄 ──────────────────── */}
      {bucketTotal > 0 ? (
        <div className="min-w-0 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            난이도 프로필
          </p>
          <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-slate-100">
            {buckets.map((b) =>
              b.count > 0 ? (
                <div
                  key={b.key}
                  className={b.bar}
                  style={{ width: `${(b.count / bucketTotal) * 100}%` }}
                  title={`${b.label} ${b.count}문항`}
                />
              ) : null,
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {buckets.map((b) => (
              <span
                key={b.key}
                className={cn(
                  "inline-flex items-center gap-1 whitespace-nowrap text-[10.5px]",
                  b.count > 0 ? "text-slate-500" : "text-slate-300",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    b.count > 0 ? b.dot : "bg-slate-200",
                  )}
                />
                {b.label}
                <span className="font-semibold tabular-nums text-slate-700">{b.count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── 유형 분포 — 내림차순 비례 바 랭킹(상위 7 + 접이) ─────────────── */}
      {types.length > 0 ? (
        <div className="min-w-0 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2">
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
            <p className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              유형 분포
            </p>
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-px text-[10px] font-medium tabular-nums text-slate-500">
              {types.length}개 유형
            </span>
          </div>
          <div className="space-y-1">
            {visibleTypes.map((t) => (
              <div
                key={t.typeLabel}
                className="flex min-w-0 items-center gap-2"
                title={`${t.typeLabel} — ${t.count}문항${t.points > 0 ? ` · ${t.points}점` : ""} (${t.numbers.join(", ")}번)`}
              >
                <span className="w-[92px] shrink-0 truncate text-[11px] text-slate-600">
                  {t.typeLabel}
                </span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{
                      width: `${typeMax > 0 ? (t.count / typeMax) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-700">
                  {t.count}
                </span>
                {/* 배점은 있는 유형만 — 「0점」 나열은 노이즈(실측 격노 지점) */}
                {/* w-11: 소수점 배점("13.4점")까지 한 줄 — w-8 은 두 줄로 꺾였다(실측) */}
                <span
                  className={cn(
                    "w-11 shrink-0 whitespace-nowrap rounded px-1 py-px text-center text-[10.5px] font-semibold tabular-nums",
                    t.points > 0 ? "bg-amber-50 text-amber-700" : "text-transparent",
                  )}
                >
                  {t.points > 0 ? `${t.points}점` : "·"}
                </span>
              </div>
            ))}
          </div>
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setAllTypes((v) => !v)}
              className="mt-2 cursor-pointer text-[11px] font-medium text-blue-600 underline-offset-2 transition-colors hover:text-blue-700 hover:underline"
            >
              {allTypes ? "접기" : `유형 ${hiddenCount}개 더 보기`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
