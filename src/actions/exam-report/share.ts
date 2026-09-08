"use server";

// ============================================================================
// 시험 리포트 — 공유 링크 발급/폐기 서버액션 (2관점, 26-09-03)
//
// ① 학생 리포트(ExamReportStudent, /r/[token]) — enable/disableExamReportShare
// ② 시험지 분석 리포트(ExamAnalysis, /r/exam/[token]) — enable/disableExamAnalysisShare
//    시험지 **자체**의 분석(총평·난이도·유형·문항별)을 학생·학부모에게 공유하는 축.
//    학생 개인 점수·이름과 무관하므로 학생 행을 전혀 건드리지 않는다.
//
// 발급: shareToken 이 없을 때만 새로 발급하고(@unique 충돌 시 재시도),
//       기존 토큰이 있으면 그대로 재사용해 켠다.
// 폐기: shareEnabled=false + shareToken=null → 재발급 시 자동 rotate.
// ============================================================================

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateShareToken } from "@/lib/exam-report/share-token";
import { requireAuth } from "./_helpers";

const studentPath = (analysisId: string, studentId: string) =>
  `/director/workbench/exam-report/${analysisId}/students/${studentId}`;

const SHARE_TOKEN_MAX_RETRY = 3;

export async function enableExamReportShare(
  studentId: string,
): Promise<{ token: string }> {
  const staff = await requireAuth();

  const student = await prisma.examReportStudent.findFirst({
    where: { id: studentId, academyId: staff.academyId, deletedAt: null },
    select: { id: true, shareToken: true, examAnalysisId: true },
  });
  if (!student) throw new Error("학생 리포트를 찾을 수 없습니다.");

  // 기존 토큰 재사용 — shareEnabled 만 켠다.
  if (student.shareToken) {
    await prisma.examReportStudent.update({
      where: { id: student.id },
      data: { shareEnabled: true, sharedAt: new Date() },
    });
    revalidatePath(studentPath(student.examAnalysisId, studentId));
    return { token: student.shareToken };
  }

  // 신규 발급 — @unique 충돌(P2002) 시 재시도.
  for (let attempt = 0; attempt < SHARE_TOKEN_MAX_RETRY; attempt++) {
    const token = generateShareToken();
    try {
      await prisma.examReportStudent.update({
        where: { id: student.id },
        data: { shareToken: token, shareEnabled: true, sharedAt: new Date() },
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
  throw new Error("공유 링크 발급에 실패했습니다. 다시 시도해 주세요.");
}

export async function disableExamReportShare(
  studentId: string,
): Promise<{ ok: true }> {
  const staff = await requireAuth();

  const student = await prisma.examReportStudent.findFirst({
    where: { id: studentId, academyId: staff.academyId, deletedAt: null },
    select: { id: true, examAnalysisId: true },
  });
  if (!student) throw new Error("학생 리포트를 찾을 수 없습니다.");

  // revoke — 토큰까지 null 로 지워 재발급 시 새 토큰이 rotate 되게 한다.
  await prisma.examReportStudent.update({
    where: { id: student.id },
    data: { shareEnabled: false, shareToken: null },
  });
  revalidatePath(studentPath(student.examAnalysisId, studentId));
  return { ok: true };
}

// ── ② 시험지 분석 리포트 공개 링크(/r/exam/[token]) ─────────────────────────

const analysisPath = (analysisId: string) =>
  `/director/workbench/exam-report/${analysisId}`;

/**
 * 시험지 분석 리포트 공유 켜기 — status ANALYZED 만 허용(분석 중·실패·초안은 공개할
 * 내용이 없다). 학생 행은 건드리지 않는다(학생 리포트 공유와 독립 축).
 */
export async function enableExamAnalysisShare(
  analysisId: string,
): Promise<{ token: string }> {
  const staff = await requireAuth();

  const analysis = await prisma.examAnalysis.findFirst({
    where: { id: analysisId, academyId: staff.academyId, deletedAt: null },
    select: { id: true, status: true, shareToken: true },
  });
  if (!analysis) throw new Error("시험 분석을 찾을 수 없습니다.");
  if (analysis.status !== "ANALYZED")
    throw new Error("분석이 완료된 시험지만 공유할 수 있습니다.");

  if (analysis.shareToken) {
    await prisma.examAnalysis.update({
      where: { id: analysis.id },
      data: { shareEnabled: true, sharedAt: new Date() },
    });
    revalidatePath(analysisPath(analysisId));
    return { token: analysis.shareToken };
  }

  for (let attempt = 0; attempt < SHARE_TOKEN_MAX_RETRY; attempt++) {
    const token = generateShareToken();
    try {
      await prisma.examAnalysis.update({
        where: { id: analysis.id },
        data: { shareToken: token, shareEnabled: true, sharedAt: new Date() },
      });
      revalidatePath(analysisPath(analysisId));
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
  throw new Error("공유 링크 발급에 실패했습니다. 다시 시도해 주세요.");
}

/** 시험지 분석 리포트 공유 끄기 — 토큰 회수(rotate). 기존 링크는 즉시 무효. */
export async function disableExamAnalysisShare(
  analysisId: string,
): Promise<{ ok: true }> {
  const staff = await requireAuth();

  const analysis = await prisma.examAnalysis.findFirst({
    where: { id: analysisId, academyId: staff.academyId, deletedAt: null },
    select: { id: true },
  });
  if (!analysis) throw new Error("시험 분석을 찾을 수 없습니다.");

  await prisma.examAnalysis.update({
    where: { id: analysis.id },
    data: { shareEnabled: false, shareToken: null },
  });
  revalidatePath(analysisPath(analysisId));
  return { ok: true };
}
