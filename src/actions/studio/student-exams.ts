"use server";

// ============================================================================
// 클래스 스튜디오 「학생 관리」 — 로스터 × 시험 리포트 현황 서버 액션
// (docs/exam-analysis-v4-spec.md §2.5 U6 액션 · §3 U6-3)
//
// 왜 별도 액션인가: 기존 listStudioClassStudents(students.ts)는 「스튜디오 과제
// 진행」(study_assignments raw SQL + task groupBy)을 집계하는 학생 탭 전용이고,
// 「학생 관리」 뷰의 본체는 **시험 리포트 여정**(채점 → 리포트 → 공유)이다.
// 두 집계를 한 액션에 얹으면 어느 뷰도 안 쓰는 절반을 매번 지불한다.
//
// 조인 축: ClassEnrollment(ENROLLED) → Student → ExamReportStudent.studentId
// (soft-ref, FK 없음 — schema.prisma:933). 분석 제목·유형·원천은 ExamAnalysis 로
// include. 응답은 스칼라만(scoreSummary 는 parseScoreSummary 로 총점/만점 2필드만
// 추려 싣는다 — raw JSON egress 0 규칙 §2.1 관례).
//
// 초대 링크 조립용 학원 코드도 함께 내린다(getStudioInviteKit 은 학생 1명씩
// 1왕복이라 로스터 전체에는 부적합 — 학원 코드는 로스터 공통값).
// 불변식: 전 액션 requireStaffAuth + academyId 스코프 + 클래스 소유 검증
// (students.ts 파일 헤더 관례 그대로).
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseScoreSummary } from "@/lib/exam-report/schemas";
import type { StudentReportStatus } from "@/lib/exam-report/types";
import type { StudioActionResult } from "./classes";

/** 학생 1명 × 시험 분석 1건의 리포트 행(ExamReportStudent 1행). */
export interface StudioStudentExamEntry {
  /** ExamReportStudent.id — 레일 콘솔 focusStudent·공유/답안 액션의 인자 */
  reportStudentId: string;
  /** ExamAnalysis.id — 「시험 분석에서 열기」 딥링크 */
  analysisId: string;
  title: string;
  examType: string;
  /** "MANUAL" | "INTERNAL" — INTERNAL 은 답안 링크 축이 없다 */
  sourceType: string;
  updatedAt: string;
  totalScore: number | null;
  maxScore: number | null;
  gradingConfirmed: boolean;
  reportStatus: StudentReportStatus;
  shareEnabled: boolean;
  shareToken: string | null;
  answerEnabled: boolean;
  answerToken: string | null;
  answerSubmittedAt: string | null;
  /** 앱 응시 제출 증거(§16) — 링크만 보낸 학생과 실제 응시자를 가른다. */
  examSubmissionId: string | null;
}

export interface StudioStudentExamRow {
  studentId: string;
  name: string;
  studentCode: string;
  grade: number;
  lastStudyAt: string | null;
  /** 최신 갱신순(updatedAt desc) */
  exams: StudioStudentExamEntry[];
}

export interface StudioClassStudentExams {
  academyCode: string;
  students: StudioStudentExamRow[];
}

const REPORT_STATUSES: ReadonlySet<string> = new Set<StudentReportStatus>([
  "NONE",
  "GENERATING",
  "GENERATED",
  "FAILED",
]);

function toReportStatus(value: string): StudentReportStatus {
  return REPORT_STATUSES.has(value) ? (value as StudentReportStatus) : "NONE";
}

export async function listStudioClassStudentExams(
  classId: string,
): Promise<StudioActionResult<StudioClassStudentExams>> {
  try {
    const staff = await requireStaffAuth();
    const [cls, academy] = await Promise.all([
      prisma.class.findFirst({
        where: { id: classId, academyId: staff.academyId },
        select: { id: true },
      }),
      prisma.academy.findUnique({
        where: { id: staff.academyId },
        select: { code: true },
      }),
    ]);
    if (!cls || !academy) {
      return { success: false, error: "클래스를 찾을 수 없습니다." };
    }

    // 학원 이중 게이트 — 클래스 소유는 위에서 검증했지만 학생 축에도 academyId 를
    // 건다(파일 헤더 불변식: 전 액션 academyId 스코프).
    const enrollments = await prisma.classEnrollment.findMany({
      where: {
        classId,
        status: "ENROLLED",
        student: { status: "ACTIVE", academyId: staff.academyId },
      },
      select: {
        student: {
          select: {
            id: true,
            name: true,
            studentCode: true,
            grade: true,
            lastStudyDate: true,
          },
        },
      },
      orderBy: { enrolledAt: "asc" },
      take: 300,
    });
    if (enrollments.length === 0) {
      return {
        success: true,
        data: { academyCode: academy.code, students: [] },
      };
    }

    const studentIds = enrollments.map((e) => e.student.id);
    // 학원 스코프 이중 게이트 — studentId 는 soft-ref 라 academyId 를 함께 건다.
    const reportRows = await prisma.examReportStudent.findMany({
      where: {
        academyId: staff.academyId,
        studentId: { in: studentIds },
        deletedAt: null,
        examAnalysis: { deletedAt: null },
      },
      select: {
        id: true,
        studentId: true,
        scoreSummary: true,
        gradingConfirmed: true,
        reportStatus: true,
        shareEnabled: true,
        shareToken: true,
        answerEnabled: true,
        answerToken: true,
        answerSubmittedAt: true,
        examSubmissionId: true,
        updatedAt: true,
        examAnalysis: {
          select: {
            id: true,
            title: true,
            examType: true,
            sourceType: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 3000,
    });

    const examsByStudent = new Map<string, StudioStudentExamEntry[]>();
    for (const r of reportRows) {
      if (!r.studentId) continue;
      const score = parseScoreSummary(r.scoreSummary);
      const entry: StudioStudentExamEntry = {
        reportStudentId: r.id,
        analysisId: r.examAnalysis.id,
        title: r.examAnalysis.title,
        examType: r.examAnalysis.examType,
        sourceType: r.examAnalysis.sourceType,
        updatedAt: r.updatedAt.toISOString(),
        totalScore: score?.totalScore ?? null,
        maxScore: score?.maxScore ?? null,
        gradingConfirmed: r.gradingConfirmed,
        reportStatus: toReportStatus(r.reportStatus),
        shareEnabled: r.shareEnabled,
        shareToken: r.shareToken,
        answerEnabled: r.answerEnabled,
        answerToken: r.answerToken,
        examSubmissionId: r.examSubmissionId,
        answerSubmittedAt: r.answerSubmittedAt
          ? r.answerSubmittedAt.toISOString()
          : null,
      };
      const list = examsByStudent.get(r.studentId);
      if (list) list.push(entry);
      else examsByStudent.set(r.studentId, [entry]);
    }

    return {
      success: true,
      data: {
        academyCode: academy.code,
        students: enrollments.map(({ student: s }) => ({
          studentId: s.id,
          name: s.name,
          studentCode: s.studentCode,
          grade: s.grade,
          lastStudyAt: s.lastStudyDate ? s.lastStudyDate.toISOString() : null,
          exams: examsByStudent.get(s.id) ?? [],
        })),
      },
    };
  } catch (error) {
    // 원문(Prisma 엔진 텍스트 등)은 클라이언트로 내보내지 않는다 — 판이 그대로
    // 렌더한다. 인증·권한만 한국어로 매핑하고 나머지는 고정 자구 + 서버 로그.
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") {
      return { success: false, error: "로그인이 필요합니다." };
    }
    if (message === "Forbidden") {
      return { success: false, error: "이 클래스를 볼 권한이 없습니다." };
    }
    console.error("[listStudioClassStudentExams] failed", {
      classId,
      name: error instanceof Error ? error.name : typeof error,
      message,
    });
    return {
      success: false,
      error: "학생 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}
