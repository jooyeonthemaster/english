// ============================================================================
// 통합 학습 과제 — QUESTIONS(문제 세트) 런타임 (서버 전용)
//
// 학생 앱 /g/q/[taskId] 플레이어의 페이로드 조립 + 제출 채점 정본.
// 보안 계약: 학생에게 나가는 문항은 반드시 buildStudentSafeQuestion /
// buildAnswerUiSpec(화이트리스트 조립) 경유 — 정답성 필드 구조적 미포함.
// 채점은 exam-scoring 결정론 엔진(gradeAnswer, AI 0콜) 재사용.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { buildAnswerSpec } from "@/lib/exam-scoring/answer-spec";
import { gradeAnswer } from "@/lib/exam-scoring/grade";
import {
  buildAnswerUiSpec,
  buildStudentSafeQuestion,
  type AnswerUiSpec,
  type StudentSafeQuestion,
} from "@/lib/exam-scoring/student-safe";
import type { StudentInput, SubmissionResponse } from "@/lib/exam-scoring/types";

export interface QuestionsPlayerItem {
  question: StudentSafeQuestion;
  answerUi: AnswerUiSpec;
  orderNum: number;
  points: number;
}

/** 스냅샷 questionIds → 살아있는 문항만, 스냅샷 순서 유지 */
async function loadLiveQuestions(academyId: string, questionIds: string[]) {
  if (questionIds.length === 0) return [];
  const rows = await prisma.question.findMany({
    where: { id: { in: questionIds }, academyId, deletedAt: null },
    select: {
      id: true,
      type: true,
      subType: true,
      questionText: true,
      questionImage: true,
      options: true,
      correctAnswer: true,
      structuredData: true,
      points: true,
      passage: { select: { content: true } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return questionIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r);
}

function parseStructured(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** 학생 플레이어 페이로드 — 정답성 0 (student-safe 화이트리스트) */
export async function buildQuestionsPlayerItems(
  academyId: string,
  questionIds: string[],
): Promise<QuestionsPlayerItem[]> {
  const rows = await loadLiveQuestions(academyId, questionIds);
  return rows.map((q, idx) => {
    const structuredData = parseStructured(q.structuredData);
    const spec = buildAnswerSpec({
      id: q.id,
      type: q.type,
      subType: q.subType,
      options: q.options,
      correctAnswer: q.correctAnswer,
      structuredData,
      sourcePassageContent: q.passage?.content,
      points: q.points > 0 ? q.points : 1,
    });
    return {
      question: buildStudentSafeQuestion({
        id: q.id,
        type: q.type,
        subType: q.subType,
        questionText: q.questionText,
        questionImage: q.questionImage,
        options: q.options,
        structuredData,
        correctAnswer: q.correctAnswer,
        passage: q.passage,
      }),
      answerUi: buildAnswerUiSpec(spec),
      orderNum: idx + 1,
      points: q.points > 0 ? q.points : 1,
    };
  });
}

export interface QuestionsGradeSummary {
  score: number;
  maxScore: number;
  percent: number | null;
  correct: number;
  wrong: number;
  partial: number;
  needsReview: number;
  total: number;
}

export interface QuestionsGradeOutcome {
  responses: SubmissionResponse[];
  summary: QuestionsGradeSummary;
  /** 응답 누락 문항 orderNum 목록 — 비어 있지 않으면 INCOMPLETE */
  missingOrderNums: number[];
}

/** 제출 채점 — 살아있는 전 문항에 대해 입력을 요구(누락 시 INCOMPLETE 보고) */
export async function gradeQuestionsSubmission(
  academyId: string,
  questionIds: string[],
  answers: Record<string, StudentInput | null | undefined>,
): Promise<QuestionsGradeOutcome> {
  const rows = await loadLiveQuestions(academyId, questionIds);
  const responses: SubmissionResponse[] = [];
  const missingOrderNums: number[] = [];
  let score = 0;
  let maxScore = 0;
  let correct = 0;
  let wrong = 0;
  let partial = 0;
  let needsReview = 0;

  rows.forEach((q, idx) => {
    const orderNum = idx + 1;
    const points = q.points > 0 ? q.points : 1;
    maxScore += points;
    const input = answers[q.id] ?? null;
    const hasInput =
      !!input &&
      (typeof input.choice === "string" ||
        (Array.isArray(input.choices) && input.choices.length > 0) ||
        (input.texts && Object.values(input.texts).some((t) => t?.trim())));
    if (!hasInput) {
      missingOrderNums.push(orderNum);
      responses.push({ questionId: q.id, orderNum, input: null });
      return;
    }
    const spec = buildAnswerSpec({
      id: q.id,
      type: q.type,
      subType: q.subType,
      options: q.options,
      correctAnswer: q.correctAnswer,
      structuredData: parseStructured(q.structuredData),
      sourcePassageContent: q.passage?.content,
      points,
    });
    const result = gradeAnswer(spec, input);
    if (result.status === "CORRECT") correct += 1;
    else if (result.status === "WRONG") wrong += 1;
    else if (result.status === "PARTIAL") partial += 1;
    else needsReview += 1;
    score += result.earnedPoints ?? 0;
    responses.push({ questionId: q.id, orderNum, input, result });
  });

  const gradedMax = maxScore || 1;
  return {
    responses,
    summary: {
      score: Math.round(score * 100) / 100,
      maxScore,
      percent: maxScore > 0 ? Math.round((score / gradedMax) * 1000) / 10 : null,
      correct,
      wrong,
      partial,
      needsReview,
      total: rows.length,
    },
    missingOrderNums,
  };
}
