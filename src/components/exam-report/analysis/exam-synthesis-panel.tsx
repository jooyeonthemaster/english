"use client";

// ============================================================================
// 시험지 종합 패널 (우측 380px) — examLevel 기반.
// overview / 난이도 프로필 가로 스택바(easy emerald·medium blue·hard violet·
// killer rose) / 유형 분포 / 함정 총평 / 범위 추정. null 이면 "종합 대기 중".
// ============================================================================

import { BarChart3, Layers, Target, BookOpen } from "lucide-react";
import type { ExamLevelAnalysis } from "@/lib/exam-report/types";

interface ExamSynthesisPanelProps {
  examLevel: ExamLevelAnalysis | null;
}

const BUCKETS: {
  key: keyof ExamLevelAnalysis["difficultyProfile"];
  label: string;
  bar: string;
  dot: string;
  text: string;
}[] = [
  { key: "easy", label: "쉬움", bar: "bg-emerald-500", dot: "bg-emerald-500", text: "text-emerald-600" },
  { key: "medium", label: "보통", bar: "bg-blue-500", dot: "bg-blue-500", text: "text-blue-600" },
  { key: "hard", label: "어려움", bar: "bg-violet-500", dot: "bg-violet-500", text: "text-violet-600" },
  { key: "killer", label: "킬러", bar: "bg-rose-500", dot: "bg-rose-500", text: "text-rose-600" },
];

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof BarChart3;
  children: React.ReactNode;
}) {
  return (
    // 워크벤치 공통 eyebrow(uppercase tracking) 규약과 동일 스케일
    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

export function ExamSynthesisPanel({ examLevel }: ExamSynthesisPanelProps) {
  if (!examLevel) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
        <BarChart3 className="mx-auto h-6 w-6 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-500">종합 대기 중</p>
        <p className="mt-1 text-xs text-slate-400">
          모든 문항 분석이 끝나면 시험지 전체 수준을 종합합니다.
        </p>
      </div>
    );
  }

  const profile = examLevel.difficultyProfile;
  const counts = BUCKETS.map((b) => ({ ...b, count: profile[b.key]?.length ?? 0 }));
  const total = counts.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="space-y-6">
      {/* 총평 */}
      <div>
        <SectionTitle icon={BarChart3}>시험지 총평</SectionTitle>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {examLevel.overview}
        </p>
      </div>

      {/* 난이도 프로필 */}
      <div>
        <SectionTitle icon={Layers}>난이도 프로필</SectionTitle>
        {total > 0 ? (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {counts.map(
                (b) =>
                  b.count > 0 && (
                    <div
                      key={b.key}
                      className={b.bar}
                      style={{ width: `${(b.count / total) * 100}%` }}
                      title={`${b.label} ${b.count}문항`}
                    />
                  ),
              )}
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {counts.map((b) => (
                <div key={b.key} className="flex items-center gap-1.5 text-xs">
                  <span className={`h-2 w-2 rounded-full ${b.dot}`} />
                  <span className="text-slate-500">{b.label}</span>
                  <span className={`ml-auto tabular-nums font-medium ${b.text}`}>
                    {b.count}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-400">난이도 데이터가 없습니다.</p>
        )}
      </div>

      {/* 유형 분포 */}
      {examLevel.typeDistribution.length > 0 && (
        <div>
          <SectionTitle icon={Target}>유형 분포</SectionTitle>
          <ul className="space-y-1.5">
            {examLevel.typeDistribution.map((t, i) => (
              <li
                key={`${t.typeLabel}-${i}`}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate text-slate-700" title={t.typeLabel}>
                  {t.typeLabel}
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-slate-400">
                  {t.numbers.length}문항 · {t.points}점
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 함정 총평 */}
      {examLevel.trapOverview.trim() && (
        <div>
          <SectionTitle icon={Target}>함정 총평</SectionTitle>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {examLevel.trapOverview}
          </p>
        </div>
      )}

      {/* 범위 추정 */}
      {examLevel.scopeInference.trim() && (
        <div>
          <SectionTitle icon={BookOpen}>출제 범위 추정</SectionTitle>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {examLevel.scopeInference}
          </p>
        </div>
      )}
    </div>
  );
}
