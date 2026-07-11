"use client";

// ============================================================================
// 학원 취약 개념 TOP 8 — 개념 축 학원 전체 랭킹(시도 3회 이상 학생의 숙달
// 평균 낮은순). 행별 '보강 과제'는 해당 개념 20문항 프리셋 + 취약 학생
// (숙달 60점 미만) 프리셀렉트로 과제 컴포저를 연다 — 컴포저는 소비만.
// ============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";

import type { AcademyConceptRankingRow } from "@/actions/grammar-drill-insights";
import { SectionCard } from "@/components/layout/page-frame";
import {
  AssignmentComposer,
  type ComposerPreset,
} from "@/components/study-assignments/assignment-composer";
import { cn } from "@/lib/utils";

function masteryBarClass(score: number): string {
  if (score < 50) return "bg-rose-500";
  if (score < 70) return "bg-blue-500";
  return "bg-emerald-500";
}

export function GrammarLabConceptRanking({
  ranking,
}: {
  ranking: AcademyConceptRankingRow[];
}) {
  const router = useRouter();
  const [assign, setAssign] = useState<{
    preset: ComposerPreset;
    studentIds: string[];
  } | null>(null);

  if (ranking.length === 0) return null;

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
        title="학원 취약 개념 TOP 8"
        description="시도 3회 이상 학생의 개념 숙달 평균이 낮은 순서입니다. 보강 과제는 숙달 60점 미만 학생을 미리 선택해 엽니다."
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-slate-50">
          {ranking.map((row, idx) => (
            <li key={row.conceptId} className="flex items-center gap-3 px-4 py-2.5">
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
                    평균 숙달{" "}
                    <span
                      className={cn(
                        "font-bold",
                        row.avgMastery < 50 ? "text-rose-600" : "text-slate-800",
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
                    취약 {row.weakStudentIds.length}명 · 학습 {row.studentCount}명
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openAssign(row)}
                className="inline-flex h-7 shrink-0 items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
              >
                보강 과제
              </button>
            </li>
          ))}
        </ul>
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
