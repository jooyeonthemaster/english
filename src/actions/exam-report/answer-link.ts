"use server";

// ============================================================================
// 학생 시험 리포트 — 답안 링크(/a/[token]) 발급/폐기 서버액션 (share.ts 미러)
//
// 발급: answerToken 이 없을 때만 새로 발급하고(@unique 충돌 시 재시도),
//       기존 토큰이 있으면 그대로 재사용해 켠다.
// 폐기: answerEnabled=false + answerToken=null → 재발급 시 자동 rotate.
// answerSubmittedAt 은 학생 제출 시각(공개 라우트 소유) — 여기서 건드리지 않는다.
// ============================================================================

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateShareToken } from "@/lib/exam-report/share-token";
import { requireAuth } from "./_helpers";

const studentPath = (analysisId: string, studentId: string) =>
  `/director/workbench/exam-report/${analysisId}/students/${studentId}`;

const ANSWER_TOKEN_MAX_RETRY = 3;

export async function enableAnswerLink(
  studentId: string,
): Promise<{ token: string }> {
  const staff = await requireAuth();

  const student = await prisma.examReportStudent.findFirst({
    where: { id: studentId, academyId: staff.academyId, deletedAt: null },
    select: { id: true, answerToken: true, examAnalysisId: true },
  });
  if (!student) throw new Error("학생 리포트를 찾을 수 없습니다.");

  // 기존 토큰 재사용 — answerEnabled 만 켠다.
  if (student.answerToken) {
    await prisma.examReportStudent.update({
      where: { id: student.id },
      data: { answerEnabled: true },
    });
    revalidatePath(studentPath(student.examAnalysisId, studentId));
    return { token: student.answerToken };
  }

  // 신규 발급 — @unique 충돌(P2002) 시 재시도.
  for (let attempt = 0; attempt < ANSWER_TOKEN_MAX_RETRY; attempt++) {
    const token = generateShareToken();
    try {
      await prisma.examReportStudent.update({
        where: { id: student.id },
        data: { answerToken: token, answerEnabled: true },
      });
      revalidatePath(studentPath(student.examAnalysisId, studentId));
      return { token };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("답안 링크 발급에 실패했습니다. 다시 시도해 주세요.");
}

export async function disableAnswerLink(
  studentId: string,
): Promise<{ ok: true }> {
  const staff = await requireAuth();

  const student = await prisma.examReportStudent.findFirst({
    where: { id: studentId, academyId: staff.academyId, deletedAt: null },
    select: { id: true, examAnalysisId: true },
  });
  if (!student) throw new Error("학생 리포트를 찾을 수 없습니다.");

  // revoke — 토큰까지 null 로 지워 재발급 시 새 토큰이 rotate 되게 한다.
  // version 증가: 폐기 직전에 findAnswerTarget 를 통과한 학생 POST 의 version CAS 가
  // 여기와 반드시 충돌 → 재조회 시 answerEnabled:false 라 404 강등 — revoke 직후
  // 답안 쓰기가 성공하는 레이스 봉쇄. (enable 은 레이스 없음 — 불변)
  await prisma.examReportStudent.update({
    where: { id: student.id },
    data: { answerEnabled: false, answerToken: null, version: { increment: 1 } },
  });
  revalidatePath(studentPath(student.examAnalysisId, studentId));
  return { ok: true };
}
