"use server";

// ============================================================================
// 학생 상세 "시험 리포트" 탭 — 이 학생에게 귀속된 ExamReportStudent 목록
//
// ExamReportStudent.studentId 는 soft-ref(FK 미설정)라 명시 조회한다.
// 내신 리포트 관리(library)와 학생 관리를 잇는 연계 축 — 워크스페이스·공개 리포트
// 딥링크를 함께 내려보낸다.
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface StudentExamReportRow {
  reportStudentId: string;
  analysisId: string;
  analysisTitle: string;
  schoolName: string | null;
  examType: string;
  examYear: number | null;
  semester: string | null;
  gradingConfirmed: boolean;
  reportStatus: string; // NONE | GENERATING | GENERATED | FAILED
  shareEnabled: boolean;
  /** 공개 리포트 뷰어 경로(/r/{token}) — 공유 꺼짐이면 null */
  sharePath: string | null;
  /** 채점 요약 — scoreSummary 캐시에서 파생 */
  scoreText: string | null;
  /** 정오 칩(채점만 끝난 카드용) — scoreSummary 캐시 파생, 판정 전이면 null */
  scoreCounts: { correct: number; wrong: number; unknown: number } | null;
  updatedAt: string;
  createdAt: string;
}

interface ActionResult<T> {
  success: boolean;
  error?: string;
  data?: T;
}

/** exam-report ScoreSummary(totalScore/maxScore/correctCount…) 방어적 파싱 */
function scoreTextOf(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const total = typeof s.totalScore === "number" ? s.totalScore : null;
  const max = typeof s.maxScore === "number" ? s.maxScore : null;
  const correct = typeof s.correctCount === "number" ? s.correctCount : null;
  const wrong = typeof s.wrongCount === "number" ? s.wrongCount : 0;
  const partial = typeof s.partialCount === "number" ? s.partialCount : 0;
  const unknown = typeof s.unknownCount === "number" ? s.unknownCount : 0;
  if (total !== null && max !== null) return `${total}점 / ${max}점`;
  if (correct !== null) {
    const denom = correct + wrong + partial + unknown;
    if (denom > 0) return `${correct} / ${denom} 정답`;
  }
  return null;
}

/** 정오 칩 파생 — ○/✕/미확인 카운트. 부분점수(△)는 칩에서 제외(scoreText 가 총점을 담당). */
function scoreCountsOf(
  raw: unknown,
): { correct: number; wrong: number; unknown: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const correct = num(s.correctCount);
  const wrong = num(s.wrongCount);
  const unknown = num(s.unknownCount);
  if (correct + wrong + unknown <= 0) return null;
  return { correct, wrong, unknown };
}

export async function listStudentExamReports(
  studentId: string,
): Promise<ActionResult<StudentExamReportRow[]>> {
  try {
    const staff = await requireStaffAuth();
    const student = await prisma.student.findFirst({
      where: { id: studentId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!student) return { success: false, error: "학생을 찾을 수 없습니다." };

    const rows = await prisma.examReportStudent.findMany({
      where: { studentId, academyId: staff.academyId, deletedAt: null },
      select: {
        id: true,
        examAnalysisId: true,
        gradingConfirmed: true,
        reportStatus: true,
        shareToken: true,
        shareEnabled: true,
        scoreSummary: true,
        createdAt: true,
        updatedAt: true,
        examAnalysis: {
          select: {
            title: true,
            schoolName: true,
            examType: true,
            examYear: true,
            semester: true,
            deletedAt: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return {
      success: true,
      data: rows
        .filter((r) => !r.examAnalysis.deletedAt)
        .map((r) => ({
          reportStudentId: r.id,
          analysisId: r.examAnalysisId,
          analysisTitle: r.examAnalysis.title,
          schoolName: r.examAnalysis.schoolName,
          examType: r.examAnalysis.examType,
          examYear: r.examAnalysis.examYear,
          semester: r.examAnalysis.semester,
          gradingConfirmed: r.gradingConfirmed,
          reportStatus: r.reportStatus,
          shareEnabled: r.shareEnabled,
          sharePath: r.shareEnabled && r.shareToken ? `/r/${r.shareToken}` : null,
          scoreText: scoreTextOf(r.scoreSummary),
          scoreCounts: scoreCountsOf(r.scoreSummary),
          updatedAt: r.updatedAt.toISOString(),
          createdAt: r.createdAt.toISOString(),
        })),
    };
  } catch (error) {
    console.error("[students] listStudentExamReports", error);
    return { success: false, error: "시험 리포트 조회에 실패했습니다." };
  }
}
