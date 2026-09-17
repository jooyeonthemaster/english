"use client";

// ============================================================================
// 레일 「여정 스트립」 — 분석·검수·학생·채점·리포트 5칩(v4, 26-09-02).
// 정본: docs/exam-analysis-v4-spec.md §3 U5-1 · §4 여정 스트립 · §2.5 계약 셀렉터
//
// 상태는 **deriveExamNextStep().journey** 만 본다(스트립이 자체 판정을 갖는 순간
// 다음 단계 블록과 어긋난다 — 계기판·버튼 단일 소스 원칙). 시각 문법은 헤더
// StepChip(step-strip.tsx — 모듈 비공개·memo)을 **미러**한다: done 파랑 체크 /
// active 테두리 볼드 / pending muted. import 하지 않는다.
//
// 폭: 296px 플로어(콘텐츠 272px)에서 5칩 + › 4개가 1줄에 들어가야 한다 —
// 라벨 2자(리포트만 3자)·아이콘은 done 체크만·px-1.5·gap-0.5 로 실측 ≈268px.
// 그래도 넘치면 flex-wrap 으로 2줄 강등(가로 오버플로 0 계약이 우선).
// 계약 셀렉터: [data-journey-step="<step>"][data-state="done|active|pending"].
// ============================================================================

import { Fragment } from "react";
import { Check } from "lucide-react";
import type {
  ExamJourneyState,
  ExamJourneyStep,
} from "@/lib/exam-report/next-step";
import { cn } from "@/lib/utils";

const STEPS: ReadonlyArray<{ key: ExamJourneyStep; label: string }> = [
  { key: "analyze", label: "분석" },
  { key: "review", label: "검수" },
  { key: "students", label: "학생" },
  { key: "grading", label: "채점" },
  { key: "reports", label: "리포트" },
];

const CHIP: Record<ExamJourneyState, string> = {
  done: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/60",
  active: "bg-white font-semibold text-slate-900 ring-2 ring-inset ring-blue-500",
  pending: "bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-200/60",
};

export function RailJourneyStrip({
  journey,
  className,
}: {
  journey: Record<ExamJourneyStep, ExamJourneyState>;
  className?: string;
}) {
  return (
    <ol
      data-journey-strip
      aria-label="시험 분석 여정"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-0.5 gap-y-1",
        className,
      )}
    >
      {STEPS.map((s, i) => {
        const state = journey[s.key];
        return (
          <Fragment key={s.key}>
            {i > 0 ? (
              <li
                aria-hidden="true"
                className="shrink-0 select-none px-px text-[11px] leading-none text-slate-300"
              >
                ›
              </li>
            ) : null}
            <li
              data-journey-step={s.key}
              data-state={state}
              aria-current={state === "active" ? "step" : undefined}
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 text-[10.5px] font-medium",
                CHIP[state],
              )}
            >
              {state === "done" ? (
                <Check
                  className="size-2.5 shrink-0"
                  strokeWidth={3}
                  aria-hidden="true"
                />
              ) : null}
              {s.label}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
