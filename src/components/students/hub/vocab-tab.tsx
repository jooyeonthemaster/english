"use client";

// ============================================================================
// 학생 상세 허브 — 단어 훈련 탭 (grammar-tab.tsx 형상 복제)
//
// 셸 프리로드 없이 자체 로드한다(StudentStudyAnalyticsTab 관용) —
// getStudentVocabSummary 를 usePollingAction(R6, 15초)으로 재조회.
// KPI 스트립(StatTile 정본) + 취약 단어 TOP 10 + 최근 시도 20.
// ============================================================================

import { BookA, Clock3, Target } from "lucide-react";
import {
  getStudentVocabSummary,
  type StudentVocabSummary,
} from "@/actions/vocab-drill-admin/queries";
import { StatStrip, StatTile } from "@/components/layout/page-frame";
import {
  VOCAB_ITEM_TYPE_LABELS,
  VOCAB_POS_LABELS,
  vocabLevelProgress,
} from "@/lib/vocab-drill/display";
import { METRIC_LABELS } from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";
import { AnalyticsCard, RefreshStrip, TabEmpty, VerdictIcon, fmtAt } from "./analytics/kit";
import { usePollingAction } from "./analytics/use-polling-action";

function itemTypeLabel(itemType: string): string {
  return (VOCAB_ITEM_TYPE_LABELS as Record<string, string>)[itemType] ?? itemType;
}

export function StudentVocabTab({ studentId }: { studentId: string }) {
  const {
    data: summary,
    error,
    fetchedAt,
    refresh,
  } = usePollingAction<StudentVocabSummary>(
    async () => {
      const res = await getStudentVocabSummary(studentId);
      return res
        ? { ok: true, data: res }
        : { ok: false, error: "단어 훈련 데이터를 불러오지 못했습니다." };
    },
    [studentId],
    { intervalMs: 15_000 },
  );

  if (!summary) {
    return (
      <p className="py-12 text-center text-[13px] text-slate-400">
        {error ?? "단어 훈련 데이터를 불러오는 중입니다…"}
      </p>
    );
  }

  const t = summary.totals;
  const accuracy = t.solved > 0 ? Math.round((t.correct / t.solved) * 100) : 0;

  if (t.solved === 0 && !summary.stat) {
    return (
      <TabEmpty
        icon={BookA}
        title="아직 단어 훈련 기록이 없습니다"
        description="학생이 학생 앱에서 단어 훈련을 시작하면 여기에 나타납니다"
      />
    );
  }

  const level = vocabLevelProgress(summary.stat?.xp ?? 0);

  return (
    <div className="flex flex-col gap-4">
      {/* KPI 스트립 — StatTile 정본(R1) */}
      <StatStrip className="sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
        <StatTile
          label="푼 문항"
          value={`${t.solved.toLocaleString()}문항`}
          sub={`레벨 ${level.level} · XP ${(summary.stat?.xp ?? 0).toLocaleString()}`}
        />
        <StatTile
          label="정답률"
          value={t.solved > 0 ? `${accuracy}%` : "—"}
          tone={
            t.solved === 0
              ? "slate"
              : accuracy >= 70
                ? "emerald"
                : accuracy < 50
                  ? "rose"
                  : "slate"
          }
        />
        <StatTile
          label="완성 단어"
          value={`${(summary.stat?.sensesMastered ?? 0).toLocaleString()}개`}
          sub={`본 단어 ${(summary.stat?.sensesSeen ?? 0).toLocaleString()}개`}
          tone={(summary.stat?.sensesMastered ?? 0) > 0 ? "blue" : "slate"}
        />
        <StatTile
          label="복습 예정"
          value={`${summary.dueCount.toLocaleString()}개`}
          sub={
            (summary.stat?.streakDays ?? 0) > 0
              ? `연속 학습 ${summary.stat?.streakDays}일`
              : undefined
          }
          tone={summary.dueCount > 0 ? "violet" : "slate"}
        />
      </StatStrip>

      <div className="flex justify-end">
        <RefreshStrip fetchedAt={fetchedAt} error={error} onRefresh={refresh} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 취약 단어 TOP 10 */}
        <AnalyticsCard
          icon={<Target className="size-4 text-rose-500" aria-hidden />}
          title={`${METRIC_LABELS.WEAK} 단어`}
        >
          {summary.weak.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-slate-400">
              {METRIC_LABELS.MASTERY} 60점 미만 단어가 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {summary.weak.map((w) => (
                <li key={w.senseId} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-1.5">
                      <span className="truncate text-[13.5px] font-semibold text-slate-800">
                        {w.lemma}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {VOCAB_POS_LABELS[w.pos] ?? w.pos}
                      </span>
                    </p>
                    <p className="truncate text-[12px] text-slate-500">{w.senseKo}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-rose-600">
                    {w.score}점
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                    시도 {w.attempts}회
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AnalyticsCard>

        {/* 최근 시도 20 */}
        <AnalyticsCard
          icon={<Clock3 className="size-4 text-slate-400" aria-hidden />}
          title="최근 시도"
        >
          {summary.recentAttempts.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-slate-400">
              아직 시도 기록이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {summary.recentAttempts.map((a) => (
                <li key={a.id} className="flex items-center gap-2.5 py-2">
                  <VerdictIcon correct={a.correct} className="size-4" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-slate-800">
                        {a.lemma}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold",
                          "bg-slate-100 text-slate-500",
                        )}
                      >
                        {itemTypeLabel(a.itemType)}
                      </span>
                    </p>
                    {a.senseKo ? (
                      <p className="truncate text-[11.5px] text-slate-400">{a.senseKo}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                    {fmtAt(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AnalyticsCard>
      </div>
    </div>
  );
}
