"use client";

// ============================================================================
// 클래스 스튜디오 — 「시험 분석」 판 순수 헬퍼(analysis-pane.tsx 500줄 상한 분리,
// 26-09-02). 동작 무변경 이사: 카드 힌트 줄 렌더러(행·후보 — 레일과 같은
// deriveExamNextStep · NEXT_STEP_COSTS 단일 출처), 인테이크 낙관 행, 선택 행
// 신선도 서명. 상태·effect 는 전부 analysis-pane 이 든다.
// ============================================================================

import { ArrowRight } from "lucide-react";
import {
  deriveExamNextStep,
  type ExamNextStep,
} from "@/lib/exam-report/next-step";
import type {
  ExamCandidateRow,
  ExamReportSummaryRow,
} from "@/hooks/use-exam-report-activity";
import type { ExamMetaValue } from "@/components/exam-report/hub/exam-meta-form";
import { NEXT_STEP_COSTS } from "./analysis-rail/rail-next-step";

// 크레딧 단가는 레일과 같은 단일 출처 NEXT_STEP_COSTS(rail-next-step — CREDIT_COSTS
// 실값에서만 파생, 스펙 §1-9 숫자 하드코딩 금지). 여기서 복제하지 않는다.

/**
 * 힌트 줄 1벌 — 행 카드·후보 카드가 같은 조판을 쓴다(11px truncate).
 * 26-09-05: 이 줄은 카드에서 유일한 「다음 행동」이라 메타(slate-500 regular)와
 * 같은 무게면 묻힌다 → 글자 slate-600 medium, 화살표 파랑. 크기는 그대로.
 */
function nextStepHint(step: ExamNextStep) {
  return (
    <span
      data-next-step-hint={step.kind}
      className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-slate-600"
      title={step.title}
    >
      <ArrowRight className="size-3 shrink-0 text-blue-500" aria-hidden="true" />
      <span className="min-w-0 truncate">{step.title}</span>
    </span>
  );
}

/**
 * 카드 힌트 줄(§3 U4-2) — deriveExamNextStep(row).title 1줄. 모듈 상수 함수라
 * 참조가 절대 바뀌지 않는다(AnalysesBoard 의 renderHint 안정 참조 계약).
 */
export function renderNextStepHint(row: ExamReportSummaryRow) {
  return nextStepHint(deriveExamNextStep({ row, costs: NEXT_STEP_COSTS }));
}

/** 후보 카드 힌트 줄 — 같은 함수의 candidate 분기(「AI 분석을 시작하세요」). */
export function renderCandidateNextStepHint(candidate: ExamCandidateRow) {
  return nextStepHint(
    deriveExamNextStep({ row: null, candidate, costs: NEXT_STEP_COSTS }),
  );
}

/** 인테이크 성공 직후 폴이 실제 행을 내려주기 전까지 보드에 띄울 낙관 행(허브 사본). */
export function buildOptimisticRow(
  id: string,
  meta: ExamMetaValue,
  hasStudent: boolean,
): ExamReportSummaryRow {
  const now = new Date().toISOString();
  return {
    id,
    title: meta.title.trim() || "새 시험 분석",
    status: "ANALYZING",
    schoolName: meta.schoolName.trim() || null,
    grade: meta.grade.trim() || null,
    examType: meta.examType,
    studentCount: hasStudent ? 1 : 0,
    reportCount: 0,
    hasSourceFiles: true,
    progress: null,
    failedCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 선택 행 신선도 서명 — 레일이 다시 받아야 할 변화만 고른다(5초 폴 틱마다의
 * 무의미한 셸 리렌더 차단). v4: funnel 스칼라(깊이·boost·게이트·need*)를 포함 —
 * 레일 「다음 단계」 블록이 row.funnel 로 판정하므로 이게 빠지면 카드 힌트는
 * 바뀌는데 레일은 옛 단계를 보여주는 모순이 생긴다.
 */
export function freshnessSignature(row: ExamReportSummaryRow): string {
  const f = row.funnel;
  const st = f?.students;
  return [
    row.id,
    row.status,
    row.updatedAt,
    row.studentCount,
    row.reportCount ?? 0,
    row.progress?.completed ?? "",
    f?.depth ?? "",
    f?.boost?.status ?? "",
    f?.boost?.completed ?? "",
    f?.boost?.total ?? "",
    // INTERNAL 재동기로 문항 수가 바뀌면 레일 「N cr」 라벨이 재파생돼야 한다.
    f?.questionCount ?? "",
    f?.gateOpen ? 1 : 0,
    f?.confirmedCount ?? "",
    st
      ? `${st.needLink}/${st.awaitingAnswer}/${st.needGrading}/${st.needReport}/${st.needShare}/${st.reportGenerating}/${st.reportFailed}/${st.graded}`
      : "",
  ].join(":");
}
