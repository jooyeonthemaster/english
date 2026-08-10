"use client";

// ============================================================================
// 학원 보충 필요 개념 TOP 8 — 개념 축 학원 전체 랭킹. 시도 3회 이상 학생의
// 평균 숙달도 60점 미만(METRIC_HELP.WEAK 정의와 동일 컷 — M-7 정직화) 개념만
// 낮은 순으로 노출한다. 행별 「과제 보내기」는 해당 개념 20문항 프리셋 +
// 보충 필요 학생(숙달도 60점 미만) 프리셀렉트로 과제 컴포저를 연다.
//
// 숙달도(정답률)만으로는 안 보이는 신호를 겹쳐 읽는다: 개념 레슨에서 학생이
// 스스로 "자신 없음"을 고른 수(getAcademyLessonInsights). 숙달 점수가 멀쩡한데
// 자신 없음이 몰린 개념 = 암기로 버틴 개념이다.
// ============================================================================

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, Target } from "lucide-react";

import type {
  AcademyConceptRankingRow,
  AcademyLessonInsights,
} from "@/actions/grammar-drill-insights";
import { SectionCard } from "@/components/layout/page-frame";
import {
  AssignmentComposer,
  type ComposerPreset,
} from "@/components/study-assignments/assignment-composer";
import { CTA_LABELS, METRIC_LABELS } from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";
import { useAcademyLessonInsights } from "./grammar-lab-lesson-insights";

/** 「보충 필요」 컷(M-7 정직화) — METRIC_HELP.WEAK 가 약속하는 60점 미만과 동일 축 */
const WEAK_MASTERY_CUTOFF = 60;

function masteryBarClass(score: number): string {
  if (score < 50) return "bg-rose-500";
  if (score < 70) return "bg-blue-500";
  return "bg-emerald-500";
}

/** 학원 전체 레슨 신호 — 평균 이해도 · 자신 없음 비율 · 필기 미작성률 */
function LessonSignalStrip({ insights }: { insights: AcademyLessonInsights }) {
  const items: { label: string; value: string; sub: string; tone: string }[] = [
    {
      label: "평균 이해도",
      value:
        insights.avgConfidence === null
          ? "—"
          : `${insights.avgConfidence.toFixed(1)}`,
      sub: "3점 만점 자기평가",
      tone:
        insights.avgConfidence !== null && insights.avgConfidence < 2
          ? "text-rose-600"
          : "text-slate-800",
    },
    {
      label: "자신 없음",
      value:
        insights.lowConfidenceRate === null
          ? "—"
          : `${insights.lowConfidenceRate}%`,
      sub: "이해도 응답 기준",
      tone:
        insights.lowConfidenceRate !== null && insights.lowConfidenceRate >= 30
          ? "text-rose-600"
          : "text-slate-800",
    },
    {
      label: "필기 미작성",
      value:
        insights.noteMissingRate === null ? "—" : `${insights.noteMissingRate}%`,
      sub: `완료 레슨 ${insights.completedLessons.toLocaleString()}개 중 ${insights.noteMissingCount.toLocaleString()}개`,
      tone:
        insights.noteMissingRate !== null && insights.noteMissingRate >= 50
          ? "text-rose-600"
          : "text-slate-800",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500">{it.label}</p>
          <p
            className={cn(
              "mt-0.5 text-[17px] font-bold tabular-nums",
              it.tone,
            )}
          >
            {it.value}
          </p>
          <p className="mt-0.5 break-keep text-[11px] text-slate-400">
            {it.sub}
          </p>
        </div>
      ))}
    </div>
  );
}

/** 레슨 완료율 상·하위 개념 */
function CompletionRanks({ insights }: { insights: AcademyLessonInsights }) {
  if (insights.bottomCompletion.length === 0) return null;

  const columns: {
    key: string;
    heading: string;
    hint: string;
    rows: AcademyLessonInsights["bottomCompletion"];
    tone: string;
  }[] = [
    {
      key: "bottom",
      heading: "완료율 하위",
      hint: "열어보고 끝내지 못한 개념입니다",
      rows: insights.bottomCompletion,
      tone: "text-rose-600",
    },
    {
      key: "top",
      heading: "완료율 상위",
      hint: "레슨이 잘 소화된 개념입니다",
      rows: insights.topCompletion,
      tone: "text-emerald-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-slate-100 px-4 py-3 md:grid-cols-2">
      {columns.map((col) =>
        col.rows.length === 0 ? null : (
          <div key={col.key} className="min-w-0">
            <p className="flex items-baseline gap-1.5">
              <span className="text-[12px] font-semibold text-slate-700">
                {col.heading}
              </span>
              <span className="break-keep text-[11px] text-slate-400">
                {col.hint}
              </span>
            </p>
            <ul className="mt-1.5 space-y-1">
              {col.rows.map((r) => (
                <li
                  key={r.conceptId}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate text-[12px] text-slate-600">
                    {r.title}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                    <span className={cn("font-bold", col.tone)}>
                      {r.completionRate}%
                    </span>{" "}
                    · {r.learners}명
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}

export function GrammarLabConceptRanking({
  ranking,
  lessonInsights,
}: {
  ranking: AcademyConceptRankingRow[];
  /** 부모가 서버에서 미리 받아 내려줄 수 있다. 생략하면 클라이언트에서 조회한다. */
  lessonInsights?: AcademyLessonInsights | null;
}) {
  const router = useRouter();
  const [assign, setAssign] = useState<{
    preset: ComposerPreset;
    studentIds: string[];
  } | null>(null);

  const insights = useAcademyLessonInsights(lessonInsights);
  const lessonByConcept = useMemo(() => {
    if (!insights) return new Map<string, number | null>();
    // conceptId → "자신 없음" 학생 수 (이해도 응답이 아예 없으면 null)
    return new Map(
      insights.byConcept.map((c) => [
        c.conceptId,
        c.rated > 0 ? c.lowConfidence : null,
      ]),
    );
  }, [insights]);

  const hasLessonData = Boolean(insights && insights.startedLessons > 0);

  // M-7 정직화(택1: 60 미만 컷 채택) — 제목이 「보충 필요」(=숙달도 60점 미만,
  // METRIC_HELP.WEAK 정의)를 주장하므로 60점 이상 개념은 목록에서 제외한다.
  // M-1(허브 취약 프리셋) 확정 판정과 동일 축 — 부제 완화안은 제목의 주장과
  // 내용이 계속 어긋나므로 기각.
  const weakRanking = ranking.filter((r) => r.avgMastery < WEAK_MASTERY_CUTOFF);

  if (ranking.length === 0 && !hasLessonData) return null;

  const openAssign = (row: AcademyConceptRankingRow) =>
    setAssign({
      preset: {
        kind: "GRAMMAR",
        grammarSpec: { conceptIds: [row.conceptId], count: 20 },
      },
      studentIds: row.weakStudentIds,
    });

  return (
    <>
      <SectionCard
        icon={Target}
        title={`학원 ${METRIC_LABELS.WEAK} 개념 TOP 8`}
        description={`시도 3회 이상 학생의 평균 ${METRIC_LABELS.MASTERY}가 ${WEAK_MASTERY_CUTOFF}점 미만인 개념을 낮은 순으로 보여줍니다. ${CTA_LABELS.SEND_TASK}는 ${METRIC_LABELS.MASTERY} ${WEAK_MASTERY_CUTOFF}점 미만 학생을 미리 선택해 엽니다.`}
        bodyClassName="p-0"
      >
        {insights && hasLessonData ? (
          <LessonSignalStrip insights={insights} />
        ) : null}

        {weakRanking.length === 0 ? (
          <div className="px-4 py-8 text-center">
            {ranking.length > 0 ? (
              // 드릴 기록은 있으나 60점 미만 개념이 없는 상태 — 정직 안내(컷 결과)
              <p className="break-keep text-[13px] text-slate-500">
                평균 {METRIC_LABELS.MASTERY} {WEAK_MASTERY_CUTOFF}점 미만 개념이
                없습니다. {METRIC_LABELS.WEAK} 개념이 생기면 여기에 나타납니다.
              </p>
            ) : (
              <>
                <p className="break-keep text-[13px] text-slate-500">
                  아직 숙달 랭킹을 낼 만한 드릴 기록이 없습니다. 개념 레슨은
                  시작됐으니, 드릴 과제를 보내 판별 훈련으로 이어 주십시오.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setAssign({
                      preset: { kind: "GRAMMAR", grammarSpec: { count: 20 } },
                      studentIds: [],
                    })
                  }
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                >
                  <NotebookPen className="size-3.5" strokeWidth={1.75} aria-hidden />
                  {CTA_LABELS.SEND_GRAMMAR_TASK}
                </button>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {weakRanking.map((row, idx) => {
              const lowConfidence = lessonByConcept.get(row.conceptId) ?? null;
              return (
                <li
                  key={row.conceptId}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums",
                      idx < 3
                        ? "bg-rose-50 text-rose-600"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-[13px] font-semibold text-slate-800">
                        {row.title}
                      </p>
                      <p className="shrink-0 text-[12px] tabular-nums text-slate-500">
                        평균 {METRIC_LABELS.MASTERY}{" "}
                        <span
                          className={cn(
                            "font-bold",
                            row.avgMastery < 50
                              ? "text-rose-600"
                              : "text-slate-800",
                          )}
                        >
                          {row.avgMastery}점
                        </span>
                      </p>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 w-full max-w-[280px] overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            masteryBarClass(row.avgMastery),
                          )}
                          style={{ width: `${Math.max(2, row.avgMastery)}%` }}
                        />
                      </div>
                      <span className="whitespace-nowrap text-[11px] tabular-nums text-slate-400">
                        {METRIC_LABELS.WEAK} {row.weakStudentIds.length}명 · 학습{" "}
                        {row.studentCount}명
                      </span>
                      {/* 레슨 신호 — 숙달 점수와 독립. 이해도 응답이 없으면 노출하지 않는다. */}
                      {lowConfidence !== null ? (
                        <span
                          title="개념 레슨에서 이해도를 '자신 없음'으로 표시한 학생 수입니다. 숙달 점수만으로는 보이지 않는 신호입니다."
                          className={cn(
                            "shrink-0 whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
                            lowConfidence > 0
                              ? "bg-rose-50 text-rose-600"
                              : "bg-slate-100 text-slate-400",
                          )}
                        >
                          자신 없음 {lowConfidence}명
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAssign(row)}
                    className="inline-flex h-7 shrink-0 items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                  >
                    {CTA_LABELS.SEND_TASK}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {insights && hasLessonData ? (
          <CompletionRanks insights={insights} />
        ) : null}
      </SectionCard>

      <AssignmentComposer
        open={assign !== null}
        onClose={() => setAssign(null)}
        preset={assign?.preset ?? null}
        defaultStudentIds={assign?.studentIds}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
