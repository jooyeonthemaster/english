// ---------------------------------------------------------------------------
// 응시 학생 할당(assignments.ts) 전용 — 타입 계약 + 내부 헬퍼(플레인 모듈).
//
// "use server" 모듈은 async 함수만 export 할 수 있어, 동기 유틸·타입·비액션
// 조회 헬퍼는 이 플레인 모듈에 둔다(_types.ts · _exam-subject-where.ts 관례).
// assignments.ts 가 type 재export 하므로 외부는 그 경로만 알면 된다.
// ---------------------------------------------------------------------------

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isMissingColumnError } from "./_exam-subject-where";

// ── 타입(직렬화 가능 — 클라이언트 컴포넌트가 그대로 소비) ────────────────────

/** assignments 공통 반환 봉투 — exams/_types.ActionResult 에 data 슬롯이 없어 자체 정의 */
export interface AssignmentActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

/** 응시 모드 — TABLET(웹 응시) | OMR(답안만 입력) */
export type ExamAssignMode = "TABLET" | "OMR";

/** 할당 시점 문항 순서 스냅샷 원소 — exam_submissions.orderSnapshot jsonb 계약 */
export interface OrderSnapshotEntry {
  questionId: string;
  orderNum: number;
  points: number;
}

/** scoreSummary jsonb 의 목록용 요약(방어적 파싱 산출물 — 원본은 ScoreSummary 동형) */
export interface ScoreSummaryBrief {
  totalScore: number | null;
  maxScore: number | null;
  correctCount: number;
  wrongCount: number;
  partialCount: number;
  unknownCount: number;
}

/** getExamAssignments 목록 행 */
export interface ExamAssignmentItem {
  submissionId: string;
  studentId: string;
  studentName: string;
  /** 학생 응시 코드(로그인 코드) — 공유 QR 자기등록 시 학생이 입력. 교사 화면 전용 노출. */
  studentCode: string;
  grade: number;
  schoolName: string | null;
  status: string; // "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED" | "GRADED"
  mode: string | null;
  accessEnabled: boolean;
  /** 학생 응시 링크 상대경로(/t/{token}) — 토큰 미발급이면 null */
  tokenPath: string | null;
  scoreSummary: ScoreSummaryBrief | null;
  assignedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  /** 리포트 브리지로 생성된 ExamReportStudent.id(soft-ref) — 미연결이면 null */
  reportStudentId: string | null;
  /** 위 리포트 학생이 속한 분석 id(ExamReportStudent.examAnalysisId) — 미연결/삭제 시 null.
   *  reportStudentId 와 둘 다 있어야 학생 리포트 워크스페이스로 딥링크 가능(없으면 허브 폴백) */
  reportAnalysisId: string | null;
}

/** assignStudentsToExam 결과 — 학생별 처리 내역 */
export interface AssignResultRow {
  studentId: string;
  submissionId: string;
  /** CREATED=신규 할당 / UPDATED=기존 할당 갱신(모드·스냅샷) */
  action: "CREATED" | "UPDATED";
  status: string;
  mode: string | null;
  tokenPath: string | null;
}

export interface AssignResultData {
  assigned: AssignResultRow[];
  /** SUBMITTED/GRADED 등 재할당 불가로 건너뛴 학생 */
  skipped: { studentId: string; reason: string }[];
}

/** getAssignableStudents 목록 행 */
export interface AssignableStudentItem {
  id: string;
  name: string;
  /** 학생 응시 코드(로그인 코드) — 공유 QR 자기등록 안내용. 교사 화면 전용 노출. */
  studentCode: string;
  grade: number;
  schoolName: string | null;
  classes: { id: string; name: string }[];
  /** 이 시험에 이미 할당(어떤 상태든 submission 행 존재) 여부 */
  alreadyAssigned: boolean;
  /** 할당돼 있으면 그 상태("ASSIGNED"…) — 미할당 null */
  assignmentStatus: string | null;
}

export interface AssignableStudentsData {
  students: AssignableStudentItem[];
  /** 반 필터 UI 용 — 이 학원의 활성 반 목록 */
  classes: { id: string; name: string }[];
}

// ── 동기 헬퍼 ────────────────────────────────────────────────────────────────

export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function isAssignMode(value: unknown): value is ExamAssignMode {
  return value === "TABLET" || value === "OMR";
}

export function tokenPathOf(token: string | null): string | null {
  return token ? `/t/${token}` : null;
}

export function isoOf(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/** scoreSummary jsonb → 목록 요약. 형태가 어긋나면 null(추정 금지) */
export function summarizeScore(value: unknown): ScoreSummaryBrief | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const count = (v: unknown): number => num(v) ?? 0;
  // 카운트 4종이 전부 없으면 ScoreSummary 동형으로 보지 않는다.
  if (
    rec.correctCount == null &&
    rec.wrongCount == null &&
    rec.partialCount == null &&
    rec.unknownCount == null
  ) {
    return null;
  }
  return {
    totalScore: num(rec.totalScore),
    maxScore: num(rec.maxScore),
    correctCount: count(rec.correctCount),
    wrongCount: count(rec.wrongCount),
    partialCount: count(rec.partialCount),
    unknownCount: count(rec.unknownCount),
  };
}

// ── 비액션 조회/부수효과 헬퍼(assignments.ts 내부 전용) ──────────────────────

/** revalidate 관례 — 목록 + 상세(exam-paper-builder.ts 미러, 설계 §4.1) */
export function revalidateExamPaths(examId: string): void {
  revalidatePath("/director/exams");
  revalidatePath(`/director/exams/${examId}`);
}

/**
 * 테넌트 스코프 시험지 조회(+과목 판정). subject 컬럼 미ALTER DB(P2022)에서는
 * crud.getExams 와 동일하게 살아있는 KO_ 문항 조인추론으로 강등한다.
 */
export async function loadOwnedExam(
  examId: string,
  academyId: string,
): Promise<{ id: string; subject: string | null } | null> {
  try {
    return await prisma.exam.findFirst({
      where: { id: examId, academyId },
      select: { id: true, subject: true },
    });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId },
      select: {
        id: true,
        _count: {
          select: {
            questions: {
              where: { question: { deletedAt: null, subType: { startsWith: "KO_" } } },
            },
          },
        },
      },
    });
    if (!exam) return null;
    return { id: exam.id, subject: exam._count.questions > 0 ? "KOREAN" : null };
  }
}

/** 테넌트 스코프 submission 단건 조회 — exam 릴레이션 경유 academyId 교차검증 */
export async function loadOwnedSubmission(submissionId: string, academyId: string) {
  return prisma.examSubmission.findFirst({
    where: { id: submissionId, exam: { academyId } },
    select: {
      id: true,
      examId: true,
      studentId: true,
      status: true,
      mode: true,
      accessToken: true,
      accessEnabled: true,
      examReportStudentId: true,
    },
  });
}
