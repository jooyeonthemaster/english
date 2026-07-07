// ============================================================================
// 학생 답안 입력 — /a/[token] (무인증 · force-dynamic · noindex)
//
// /r/[token] 공개 리포트 골격을 미러한다: 토큰 형식검증 → answerEnabled/deletedAt
// 게이트 조회 → examMap 기반 답안지 렌더. 어떤 세션도 요구하지 않는다(토큰 소지
// = 접근 권한). 색인은 robots noindex 로 차단하고 메타데이터에 학생명·점수를
// 포함하지 않는다.
//
// 학생 공개면 철칙(계약 §1-7): 정답·정오·점수(correctAnswer/answerConfidence/
// status/scoreSummary/aiRead)는 클라이언트 컴포넌트 props 에조차 싣지 않는다 —
// buildAnswerSheet 가 구조적으로 스트립하고, 프리필도 {number, choice, text}
// 만 추출한다.
// ============================================================================

import type { Metadata } from "next";
import { cache } from "react";
import { Hourglass, Link2Off } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { isValidShareToken } from "@/lib/exam-report/share-token";
import { parseExamMap, parseStudentResponses } from "@/lib/exam-report/schemas";
import { buildAnswerSheet } from "@/lib/exam-report/answer-entry";
import type { AnswerSheetQuestion } from "@/lib/exam-report/answer-entry";
import type { ExamType } from "@/lib/exam-report/types";
import {
  AnswerEntryClient,
  type AnswerPrefillEntry,
} from "./answer-entry-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  MIDTERM: "중간고사",
  FINAL: "기말고사",
  MOCK: "모의고사",
  OTHER: "기타",
};

interface AnswerSheetData {
  studentName: string;
  examTitle: string;
  /** "OO고 · 2학년 · 기말고사" — 비어있을 수 있음 */
  schoolLine: string;
  /** gradingConfirmed — 채점 확정 후 읽기전용 */
  locked: boolean;
  /** 마지막 제출 시각(ISO) — 미제출이면 null */
  submittedAt: string | null;
  /** null = examMap 미준비(분석 전) — 준비 중 안내 화면 */
  questions: AnswerSheetQuestion[] | null;
  prefill: AnswerPrefillEntry[];
}

/** 토큰 → 답안지 로드(React cache 로 metadata/페이지 중복 조회 제거). */
const loadAnswerSheet = cache(
  async (token: string): Promise<AnswerSheetData | null> => {
    if (!isValidShareToken(token)) return null;

    const row = await prisma.examReportStudent.findFirst({
      where: {
        answerToken: token,
        answerEnabled: true,
        deletedAt: null,
        examAnalysis: { deletedAt: null },
      },
      select: {
        studentName: true,
        gradingConfirmed: true,
        answerSubmittedAt: true,
        responses: true,
        examAnalysis: {
          select: {
            title: true,
            schoolName: true,
            grade: true,
            examType: true,
            structure: true,
            status: true,
          },
        },
      },
    });
    if (!row) return null;

    const exam = row.examAnalysis;
    // examMap 미존재(분석 전) → questions null. POST /api/answer 의 NOT_READY 게이트와
    // 동일 조건 — 페이지는 "준비 중" 안내로 응대한다(만료와 구분).
    const examMap = parseExamMap(exam.structure);
    const built = examMap ? buildAnswerSheet(examMap) : null;
    const questions = built && built.length > 0 ? built : null;

    // 프리필: 기존 응답에서 학생 입력값만 추출 — status/aiRead/점수는 절대 싣지 않는다.
    const prefill: AnswerPrefillEntry[] = [];
    for (const response of parseStudentResponses(row.responses)) {
      const choice = response.chosenChoice;
      const text = response.studentAnswer;
      if (!choice && !text) continue;
      prefill.push({
        number: response.number,
        ...(choice ? { choice } : {}),
        ...(text ? { text } : {}),
      });
    }

    const examTypeLabel =
      EXAM_TYPE_LABEL[exam.examType as ExamType] ?? exam.examType;
    const schoolLine = [exam.schoolName, exam.grade, examTypeLabel]
      .filter(Boolean)
      .join(" · ");

    return {
      studentName: row.studentName,
      examTitle: exam.title,
      schoolLine,
      locked: row.gradingConfirmed,
      submittedAt: row.answerSubmittedAt
        ? row.answerSubmittedAt.toISOString()
        : null,
      questions,
      prefill,
    };
  },
);

export async function generateMetadata(): Promise<Metadata> {
  // 학생명·점수는 절대 포함하지 않는다(정적 메타 — 조회 자체가 불필요).
  return {
    title: "답안 입력 | SMOAT",
    description: "시험지에 표기한 답을 그대로 입력하는 페이지입니다.",
    robots: { index: false, follow: false },
  };
}

export default async function AnswerEntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadAnswerSheet(token);

  if (!data) return <ExpiredNotice />;
  if (!data.questions) return <NotReadyNotice />;

  return (
    <AnswerEntryClient
      token={token}
      studentName={data.studentName}
      examTitle={data.examTitle}
      schoolLine={data.schoolLine}
      locked={data.locked}
      submittedAt={data.submittedAt}
      questions={data.questions}
      prefill={data.prefill}
    />
  );
}

function ExpiredNotice() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Link2Off className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-slate-800">
          답안 입력 링크를 찾을 수 없어요
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          링크가 만료되었거나 비활성화되었습니다. 링크를 보내 준 선생님께 새
          링크를 요청해 주세요.
        </p>
        <p className="mt-6 text-[11px] text-slate-400">SMOAT 학생 답안 입력</p>
      </div>
    </div>
  );
}

function NotReadyNotice() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
          <Hourglass className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-slate-800">
          답안지가 아직 준비되지 않았어요
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          선생님이 시험지 등록을 마치면 답을 입력할 수 있습니다. 잠시 후 이
          링크를 다시 열어 주세요.
        </p>
        <p className="mt-6 text-[11px] text-slate-400">SMOAT 학생 답안 입력</p>
      </div>
    </div>
  );
}
