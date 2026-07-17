"use client";

// 학생 상세 허브 — 어법 훈련 탭 (구 grammar-lab 상세의 후계).
// 분석(히트맵·활동)/개념 학습/시도 기록/질문 로그 서브뷰 + 취약 개념 과제 CTA.
// 학습 배정 기능은 과제 탭(통합 과제 시스템)으로 이관됐다.
// 분석 서브뷰 본체는 grammar-analysis.tsx (500줄 계약 분리).

import { useMemo, useState } from "react";
import { RotateCcw, Target, TrendingDown, TrendingUp } from "lucide-react";
import type { GrammarLabStudentDetail } from "@/actions/grammar-drill-admin";
import type { WeakConceptPreset } from "@/components/study-assignments/composer-grammar-spec";
import { formatDurationMs } from "@/lib/grammar-drill/display";
import { cn } from "@/lib/utils";
import {
  GrammarAnalysis,
  collectStaleConcepts,
  type ConceptDrillTarget,
} from "./grammar-analysis";
import { GrammarAttempts } from "./grammar-attempts";
import { GrammarChatLog } from "./grammar-chat-log";
import { GrammarLessons } from "./grammar-lessons";

type SubView = "analysis" | "lessons" | "attempts" | "chat";

export function collectWeakConcepts(detail: GrammarLabStudentDetail): WeakConceptPreset[] {
  return detail.grid
    .flatMap((u) => u.concepts)
    .filter((c) => c.attempts >= 3)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((c) => ({ conceptId: c.conceptId, title: c.title, score: c.score }));
}

export function StudentGrammarTab({
  detail,
  onOpenWeakComposer,
}: {
  detail: GrammarLabStudentDetail;
  onOpenWeakComposer: (weak: WeakConceptPreset[]) => void;
}) {
  // 풀이 기록이 없고 개념 학습만 한 학생은 개념 학습 뷰로 연다(분석이 텅 비므로).
  const [view, setView] = useState<SubView>(
    detail.totals.solved === 0 && detail.lessons.length > 0 ? "lessons" : "analysis",
  );
  // 히트 셀 드릴다운 프리셋 — seq 로 같은 개념 재클릭 시에도 리마운트를 보장한다.
  const [conceptPreset, setConceptPreset] = useState<
    (ConceptDrillTarget & { seq: number }) | null
  >(null);
  const weak = useMemo(() => collectWeakConcepts(detail), [detail]);
  const stale = useMemo(() => collectStaleConcepts(detail), [detail]);
  const questionCount = detail.chatMessages.filter((m) => m.role === "user").length;
  // "자신 없음(confidence=1)" 개념 수 — 교사가 가장 먼저 봐야 할 신호이므로 탭에 배지로 노출
  const unsureCount = detail.lessons.filter((l) => l.confidence === 1).length;
  const t = detail.totals;

  // KPI 추세 델타 — 최근 7일 vs 직전 7일. 표본이 작으면(10문항 미만) 숨긴다.
  const showDelta = t.recent7.solved >= 10 && t.prev7.solved > 0;
  const accuracyDelta = showDelta
    ? Math.round(
        (t.recent7.correct / t.recent7.solved - t.prev7.correct / t.prev7.solved) * 100,
      )
    : null;

  const openConceptDrill = (target: ConceptDrillTarget) => {
    setConceptPreset((prev) => ({ ...target, seq: (prev?.seq ?? 0) + 1 }));
    setView("attempts");
  };

  // 풀이 기록도 개념 학습 기록도 없을 때만 빈 상태를 보여 준다.
  if (t.solved === 0 && detail.lessons.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-14">
        <p className="text-[13.5px] font-medium text-slate-500">
          아직 어법 훈련 기록이 없습니다.
        </p>
        <p className="text-[12px] text-slate-400">
          학생이 모바일 학습 앱(/g)에서 어법 훈련을 시작하면 여기에 분석이 쌓입니다.
        </p>
        <button
          type="button"
          onClick={() => onOpenWeakComposer([])}
          className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Target className="size-4" aria-hidden />
          어법 훈련 과제 만들기
        </button>
        <p className="text-[11.5px] text-slate-400">
          첫 훈련을 과제로 배정해 시작할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI 스트립 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Kpi
          label="누적 풀이"
          value={`${t.solved}문항`}
          sub={t.recent7.solved > 0 ? `이번 주 ${t.recent7.solved}문항` : undefined}
        />
        <Kpi
          label="정답률"
          value={`${t.solved ? Math.round((t.correct / t.solved) * 100) : 0}%`}
          tone={
            t.solved && t.correct / t.solved >= 0.7
              ? "emerald"
              : t.solved && t.correct / t.solved < 0.5
                ? "rose"
                : "slate"
          }
          delta={accuracyDelta}
        />
        <Kpi label="힌트 의존" value={`${Math.round(t.hintRate * 100)}%`} />
        <Kpi label="개념 열람" value={`${Math.round(t.peekRate * 100)}%`} />
        <Kpi label="평균 풀이" value={formatDurationMs(t.avgTimeMs)} />
      </div>

      {/* 서브뷰 네비 + CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2">
        <div className="flex items-center gap-1.5">
          {(
            [
              ["analysis", "분석"],
              ["lessons", "개념 학습"],
              ["attempts", "시도 기록"],
              ["chat", "질문 로그"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={cn(
                "h-8 rounded-md border px-3 text-[12.5px] font-semibold transition-colors",
                view === key
                  ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
                  : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600",
              )}
            >
              {label}
              {key === "chat" && questionCount > 0 ? (
                <span className="ml-1 text-[11px] tabular-nums opacity-70">{questionCount}</span>
              ) : null}
              {key === "lessons" && unsureCount > 0 ? (
                <span
                  title={`학생이 "자신 없음"으로 표시한 개념 ${unsureCount}개`}
                  className="ml-1 text-[11px] font-bold tabular-nums text-rose-500"
                >
                  {unsureCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {stale.length > 0 ? (
            <button
              type="button"
              onClick={() => onOpenWeakComposer(stale)}
              title="숙달 후 3주 이상 손대지 않은 개념으로 복습 과제를 만듭니다"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 text-[12.5px] font-semibold text-violet-700 transition-colors hover:bg-violet-100"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              복습 과제 만들기
              <span className="text-[11px] tabular-nums opacity-70">{stale.length}</span>
            </button>
          ) : null}
          {weak.length > 0 ? (
            <button
              type="button"
              onClick={() => onOpenWeakComposer(weak)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 text-[12.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
            >
              <Target className="size-3.5" aria-hidden />
              취약 개념 과제 만들기
            </button>
          ) : null}
        </div>
      </div>

      {view === "analysis" ? (
        <GrammarAnalysis detail={detail} onConceptDrill={openConceptDrill} />
      ) : null}
      {view === "lessons" ? (
        <GrammarLessons detail={detail} onOpenWeakComposer={onOpenWeakComposer} />
      ) : null}
      {view === "attempts" ? (
        <GrammarAttempts
          key={conceptPreset ? `${conceptPreset.conceptId}-${conceptPreset.seq}` : "all"}
          attempts={detail.recentAttempts}
          conceptPreset={
            conceptPreset
              ? { conceptId: conceptPreset.conceptId, title: conceptPreset.title }
              : null
          }
        />
      ) : null}
      {view === "chat" ? <GrammarChatLog messages={detail.chatMessages} /> : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "slate",
  sub,
  delta,
}: {
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "rose";
  /** 값 아래 보조 텍스트 (예: "이번 주 34문항") */
  sub?: string;
  /** 직전 7일 대비 %p 변화 — null/0 이면 미표시 */
  delta?: number | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-[15px] font-bold tabular-nums",
            tone === "emerald" ? "text-emerald-600" : tone === "rose" ? "text-rose-600" : "text-slate-900",
          )}
        >
          {value}
        </span>
        {typeof delta === "number" && delta !== 0 ? (
          <span
            title="직전 7일 대비 정답률 변화"
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
              delta > 0 ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {delta > 0 ? (
              <TrendingUp className="size-3" aria-hidden />
            ) : (
              <TrendingDown className="size-3" aria-hidden />
            )}
            {delta > 0 ? "+" : ""}
            {delta}%p
          </span>
        ) : null}
      </span>
      {sub ? <span className="text-[10.5px] tabular-nums text-slate-400">{sub}</span> : null}
    </div>
  );
}
