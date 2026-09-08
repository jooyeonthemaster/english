"use client";

// ============================================================================
// 「학생 관리」 뷰 — 중앙 판(students-pane)과 우측 레일(student-detail-rail)이
// **같은 자구·같은 뱃지·같은 집계**를 쓰기 위한 공용 모듈
// (docs/exam-analysis-v4-spec.md §3 U6-4·U6-5 · §4 디자인 언어)
//
// 라벨 맵을 두 파일에 복제하면 상태가 늘 때 한쪽만 고쳐져 판과 레일이 다른
// 말을 한다(계기판↔버튼 어긋남 금지 원칙 §1-3 과 같은 계통). 뱃지는 디자인
// 언어 v4 문법(`rounded-full + ring-1 ring-inset ring-*-200/60`, 신호등
// emerald→blue→amber→rose)을 여기 한 곳에서만 적는다.
// ============================================================================

import { toast } from "sonner";
import { GRADES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { copyText } from "@/components/students/devices/student-code-row";
import { EXAM_TYPE_LABEL } from "@/components/exam-report/hub/board-shared";
import type { StudentReportStatus } from "@/lib/exam-report/types";
import {
  classifyFunnelStudent,
  type FunnelStudentStage,
} from "@/lib/exam-report/next-step";
import type {
  StudioStudentExamEntry,
  StudioStudentExamRow,
} from "@/actions/studio/student-exams";

// ── 뱃지 ─────────────────────────────────────────────────────────────────────

const BADGE_BASE =
  "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-1.5 text-[10.5px] font-medium ring-1 ring-inset";

export const TONE_CLASS = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  blue: "bg-blue-50 text-blue-700 ring-blue-200/60",
  amber: "bg-amber-50 text-amber-700 ring-amber-200/60",
  rose: "bg-rose-50 text-rose-700 ring-rose-200/60",
  slate: "bg-slate-50 text-slate-500 ring-slate-200/60",
} as const;
export type BadgeTone = keyof typeof TONE_CLASS;

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(BADGE_BASE, TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}

/** 리포트 상태 뱃지 자구·톤(StudentReportStatus 정본 4값) */
export const REPORT_BADGE: Record<
  StudentReportStatus,
  { label: string; tone: BadgeTone }
> = {
  NONE: { label: "리포트 전", tone: "slate" },
  GENERATING: { label: "생성 중", tone: "blue" },
  GENERATED: { label: "리포트 완성", tone: "emerald" },
  FAILED: { label: "생성 실패", tone: "rose" },
};

// ── 시험 행 1건의 여정 분류 — next-step.ts 의 **같은 함수**로 판정 ─────────────
// 「답안 링크를 보내세요 (3명)」(레일)과 「채점 대기 3」(판)이 갈리던 결함의 수리:
// 판·레일은 채점 미확정을 뭉뚱그리지 않고 classifyFunnelStudent 의 배타 단계
// (needLink → awaitingAnswer → needGrading → …) 그대로 말한다. 산식을 여기에
// 복제하지 않는다(제출 증거 2계 — answerSubmittedAt·examSubmissionId — 도 그 함수 몫).
export function classifyEntry(entry: StudioStudentExamEntry): FunnelStudentStage {
  return classifyFunnelStudent({
      gradingConfirmed: entry.gradingConfirmed,
      reportStatus: entry.reportStatus,
      shareEnabled: entry.shareEnabled,
      answerToken: entry.answerToken,
      answerEnabled: entry.answerEnabled,
      answerSubmittedAt: entry.answerSubmittedAt,
      examSubmissionId: entry.examSubmissionId,
  });
}

/** 채점 축 뱃지 — classifyEntry 의 4단(링크 전 → 제출 대기 → 채점 대기 → 채점 확정) */
export function entryBadge(entry: StudioStudentExamEntry): {
  label: string;
  tone: BadgeTone;
} {
  switch (classifyEntry(entry)) {
    case "needLink":
      return { label: "링크 전", tone: "slate" };
    case "awaitingAnswer":
      return { label: "제출 대기", tone: "blue" };
    case "needGrading":
      return { label: "채점 대기", tone: "amber" };
    default:
      return { label: "채점 확정", tone: "emerald" };
  }
}

// ── 자구 헬퍼 ───────────────────────────────────────────────────────────────

export function gradeLabel(grade: number): string {
  return GRADES.find((g) => g.value === grade)?.label ?? `${grade}학년`;
}

export function examTypeLabel(examType: string): string {
  return (EXAM_TYPE_LABEL as Record<string, string>)[examType] ?? examType;
}

/** 점수 자구 — 채점 전(총점 null)은 숫자를 위조하지 않는다. */
export function formatScore(entry: StudioStudentExamEntry): string {
  if (entry.totalScore === null) return "채점 전";
  return entry.maxScore !== null
    ? `${entry.totalScore} / ${entry.maxScore}점`
    : `${entry.totalScore}점`;
}

/** 최신 시험(액션이 updatedAt desc 로 내린다) */
export function latestExam(
  row: StudioStudentExamRow,
): StudioStudentExamEntry | null {
  return row.exams[0] ?? null;
}

// ── 요약 집계(판 상단 스트립) ─────────────────────────────────────────────────
// 학생 단위로 센다(행 = 학생이므로 칩 숫자가 곧 「해당 행 몇 개」).
//   리포트 완성 = 리포트 GENERATED 인 시험이 1건 이상
//   공유 대기   = GENERATED 인데 공유 꺼진 시험이 1건 이상
//   채점 대기   = classifyEntry === needGrading 인 시험이 1건 이상
//   링크 대기   = classifyEntry ∈ {needLink, awaitingAnswer} 인 시험이 1건 이상
// 채점·링크 축은 next-step.ts classifyFunnelStudent/summarizeFunnelStudents 와
// 같은 판정(테스트 tests/unit/studio-students-summary.test.mjs 가 동치를 고정).
export interface StudentsSummary {
  total: number;
  reportDone: number;
  shareWaiting: number;
  gradingWaiting: number;
  linkWaiting: number;
}

export function summarizeStudents(rows: StudioStudentExamRow[]): StudentsSummary {
  let reportDone = 0;
  let shareWaiting = 0;
  let gradingWaiting = 0;
  let linkWaiting = 0;
  for (const s of rows) {
    if (s.exams.some((e) => e.reportStatus === "GENERATED")) reportDone += 1;
    if (s.exams.some((e) => e.reportStatus === "GENERATED" && !e.shareEnabled))
      shareWaiting += 1;
    const classes = s.exams.map(classifyEntry);
    if (classes.includes("needGrading")) gradingWaiting += 1;
    if (classes.includes("needLink") || classes.includes("awaitingAnswer"))
      linkWaiting += 1;
  }
  return {
    total: rows.length,
    reportDone,
    shareWaiting,
    gradingWaiting,
    linkWaiting,
  };
}

// ── 링크·복사 ────────────────────────────────────────────────────────────────

export function reportShareUrl(token: string): string {
  return `${window.location.origin}/r/${token}`;
}

export function answerLinkUrl(token: string): string {
  return `${window.location.origin}/a/${token}`;
}

/** 복사 + 토스트(rail-student-expand 자구 미러). 반환 = 성공 여부 */
export async function copyWithToast(
  text: string,
  okMessage: string,
): Promise<boolean> {
  const ok = await copyText(text);
  if (ok) toast.success(okMessage);
  else toast.error("클립보드 복사에 실패했습니다.");
  return ok;
}
