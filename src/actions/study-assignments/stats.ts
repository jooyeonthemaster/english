"use server";

// ============================================================================
// 통합 학습 과제 — 문항별 통계 서버액션 (디렉터면 전용)
//
// getAssignmentQuestionStats: EXAM·QUESTIONS 과제의 학생 답안을 문항 단위로
// 집계한다(정답률 오름차순 — 취약 문항 우선). 판정은 manualStatus(수동확정)가
// result.status 에 우선하는 getStudyTaskResponses 와 동일 규칙. EXAM 은 제출
// 이후(SUBMITTED/GRADED) 답안만 집계해 진행 중 자동저장 오염을 배제한다.
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { StudentInput, SubmissionResponse } from "@/lib/exam-scoring/types";
import type { StudyAssignmentKind } from "@/lib/study-assignments/types";
import { toErrorMessage, type StudyActionResult } from "./_shared";

export interface AssignmentQuestionStatRow {
  questionId: string;
  orderNum: number;
  /** 문항 텍스트 — 조인 실패(문항 삭제 등)면 null */
  questionText: string | null;
  /** 답안(input)이 기록된 학생 수 — 미입력은 제외 */
  attempted: number;
  correct: number;
  wrong: number;
  partial: number;
  needsReview: number;
  /** 정답률(%) — attempted 0 이면 null */
  correctRate: number | null;
  /** 오답 선지 분포 — [{choice:"③", count:5}] 빈도 내림차순 */
  wrongChoices: { choice: string; count: number }[];
}

export interface AssignmentQuestionStatsData {
  kind: StudyAssignmentKind;
  /** 집계에 포함된 학생(답안 세트) 수 */
  submittedCount: number;
  rows: AssignmentQuestionStatRow[];
}

/** 오답 분포용 선지 토큰 — SINGLE_CHOICE 우선, MULTI 는 결합 표기 */
function wrongChoiceToken(input: StudentInput | null): string | null {
  if (!input) return null;
  if (typeof input.choice === "string" && input.choice) return input.choice;
  if (Array.isArray(input.choices) && input.choices.length > 0) {
    return input.choices.filter((c) => typeof c === "string" && c).join("·") || null;
  }
  return null;
}

interface QuestionAgg {
  orderNum: number;
  attempted: number;
  correct: number;
  wrong: number;
  partial: number;
  needsReview: number;
  wrongChoiceCounts: Map<string, number>;
}

export async function getAssignmentQuestionStats(
  assignmentId: string,
): Promise<StudyActionResult<AssignmentQuestionStatsData>> {
  try {
    const staff = await requireStaffAuth();
    const assignment = await prisma.studyAssignment.findFirst({
      where: { id: assignmentId, academyId: staff.academyId },
      select: { id: true, kind: true, payload: true },
    });
    if (!assignment) return { success: false, error: "과제를 찾을 수 없습니다." };
    if (assignment.kind !== "EXAM" && assignment.kind !== "QUESTIONS") {
      return { success: false, error: "문항 통계는 시험·문제 세트 과제에서만 제공합니다." };
    }
    const kind = assignment.kind as StudyAssignmentKind;

    const tasks = await prisma.studyAssignmentTask.findMany({
      where: { assignmentId: assignment.id, academyId: staff.academyId },
      select: { responses: true, examSubmissionId: true },
    });

    // 학생별 답안 세트 수집 — QUESTIONS 는 태스크 행, EXAM 은 브리지 submission.
    let responseSets: unknown[][];
    if (kind === "QUESTIONS") {
      responseSets = tasks
        .map((t) => (Array.isArray(t.responses) ? (t.responses as unknown[]) : []))
        .filter((arr) => arr.length > 0);
    } else {
      const subIds = tasks
        .map((t) => t.examSubmissionId)
        .filter((id): id is string => !!id);
      const subs = subIds.length
        ? await prisma.examSubmission.findMany({
            where: { id: { in: subIds }, exam: { academyId: staff.academyId } },
            select: { responses: true, status: true },
          })
        : [];
      responseSets = subs
        .filter((s) => s.status === "SUBMITTED" || s.status === "GRADED")
        .map((s) => (Array.isArray(s.responses) ? (s.responses as unknown[]) : []))
        .filter((arr) => arr.length > 0);
    }

    // 문항별 집계 — 방어 파스는 getStudyTaskResponses 패턴 재사용.
    const byQuestion = new Map<string, QuestionAgg>();
    for (const set of responseSets) {
      for (const entry of set) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        const r = entry as unknown as Partial<SubmissionResponse>;
        if (typeof r.questionId !== "string") continue;
        let agg = byQuestion.get(r.questionId);
        if (!agg) {
          agg = {
            orderNum: 0,
            attempted: 0,
            correct: 0,
            wrong: 0,
            partial: 0,
            needsReview: 0,
            wrongChoiceCounts: new Map(),
          };
          byQuestion.set(r.questionId, agg);
        }
        if (agg.orderNum === 0 && typeof r.orderNum === "number") agg.orderNum = r.orderNum;
        const input = r.input ?? null;
        if (input) agg.attempted += 1;
        const status = r.manualStatus ?? r.result?.status ?? null;
        if (status === "CORRECT") agg.correct += 1;
        else if (status === "PARTIAL") agg.partial += 1;
        else if (status === "NEEDS_REVIEW") agg.needsReview += 1;
        else if (status === "WRONG") {
          agg.wrong += 1;
          const token = wrongChoiceToken(input);
          if (token) {
            agg.wrongChoiceCounts.set(token, (agg.wrongChoiceCounts.get(token) ?? 0) + 1);
          }
        }
      }
    }

    // QUESTIONS: orderNum 미기록 문항은 payload.questionIds 스냅샷 순서로 폴백.
    const payload = (assignment.payload ?? {}) as { questionIds?: unknown };
    const snapshotIds = Array.isArray(payload.questionIds)
      ? payload.questionIds.filter((id): id is string => typeof id === "string")
      : [];
    const snapshotOrder = new Map(snapshotIds.map((id, i) => [id, i + 1]));

    const questionIds = [...byQuestion.keys()];
    // deletedAt 필터 없이 조회 — 휴지통 문항도 텍스트는 통계에 남긴다.
    const questions = questionIds.length
      ? await prisma.question.findMany({
          where: { id: { in: questionIds }, academyId: staff.academyId },
          select: { id: true, questionText: true },
        })
      : [];
    const textById = new Map(questions.map((q) => [q.id, q.questionText]));

    const rows: AssignmentQuestionStatRow[] = questionIds.map((questionId) => {
      const agg = byQuestion.get(questionId)!;
      const orderNum = agg.orderNum || snapshotOrder.get(questionId) || 0;
      const correctRate =
        agg.attempted > 0 ? Math.round((agg.correct / agg.attempted) * 1000) / 10 : null;
      const wrongChoices = [...agg.wrongChoiceCounts.entries()]
        .map(([choice, count]) => ({ choice, count }))
        .sort((a, b) => b.count - a.count);
      return {
        questionId,
        orderNum,
        questionText: textById.get(questionId) ?? null,
        attempted: agg.attempted,
        correct: agg.correct,
        wrong: agg.wrong,
        partial: agg.partial,
        needsReview: agg.needsReview,
        correctRate,
        wrongChoices,
      };
    });
    // 정답률 오름차순(취약 문항 우선) — 미집계(null)는 뒤로, 동률은 문항 순서.
    rows.sort((a, b) => {
      const ar = a.correctRate ?? Infinity;
      const br = b.correctRate ?? Infinity;
      if (ar !== br) return ar - br;
      return a.orderNum - b.orderNum;
    });

    return {
      success: true,
      data: { kind, submittedCount: responseSets.length, rows },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "문항 통계 조회 중 오류가 발생했습니다.") };
  }
}
