"use server";

// ============================================================================
// 학생 시험 리포트 — 학생(ExamReportStudent) 채점·리포트 서버액션
//
// 채점 저장은 클라 계산을 신뢰하지 않는다: 클라가 보낸 responses 를 서버가
// grading.ts 로 구조 기준 재정규화·점수 재계산해 responses/scoreSummary 를
// 함께 CAS 저장한다.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  isExamReportStudentPagePath,
} from "@/app/api/exam-report/_lib/paths";
import { parseExamMap, parseStudentResponses } from "@/lib/exam-report/schemas";
import { parseStudentReportEnvelope } from "@/lib/exam-report/report-schema";
import {
  clampEarnedPoints,
  computeScoreSummary,
  normalizeResponses,
} from "@/lib/exam-report/grading";
import {
  requireAuth,
  assertExamAnalysisBelongsToAcademy,
  toJson,
  type CasResult,
  type ExamSourcePage,
  type UpdateStudentGradingInput,
} from "./_helpers";

const workspacePath = (analysisId: string) =>
  `/director/workbench/exam-report/${analysisId}`;
const studentPath = (analysisId: string, studentId: string) =>
  `/director/workbench/exam-report/${analysisId}/students/${studentId}`;

// ── 학생 일괄 등록 ───────────────────────────────────────────────────────────

/** 여러 줄 이름 붙여넣기 → 트리밍·빈 줄 제거 후 일괄 생성. 생성된 행을 반환. */
export async function addExamStudents(
  analysisId: string,
  names: string[],
): Promise<{ students: { id: string; studentName: string }[] }> {
  const staff = await requireAuth();
  await assertExamAnalysisBelongsToAcademy(analysisId, staff.academyId);

  const cleaned = names.map((n) => n.trim()).filter((n) => n.length > 0);
  if (cleaned.length === 0) return { students: [] };

  const created = await prisma.examReportStudent.createManyAndReturn({
    data: cleaned.map((studentName) => ({
      examAnalysisId: analysisId,
      academyId: staff.academyId,
      studentName,
    })),
    select: { id: true, studentName: true },
  });

  revalidatePath(workspacePath(analysisId));
  return { students: created };
}

// ── 학생 마킹 사진 첨부 ──────────────────────────────────────────────────────

/**
 * 업로드 완료된 학생 마킹 사진 경로를 student.sourceFiles 로 확정 저장한다(판독 대상).
 * 경로는 이 학생 전용 키 형식과 정확히 일치해야 한다(임의 키 주입 차단).
 */
export async function setStudentSources(
  studentId: string,
  pages: ExamSourcePage[],
): Promise<CasResult<"NOT_FOUND" | "INVALID_PATH" | "NO_PAGES">> {
  const staff = await requireAuth();

  const cleaned = pages
    .filter((p) => typeof p.path === "string" && p.path.length > 0)
    .map((p, i) => ({ path: p.path, page: typeof p.page === "number" ? p.page : i + 1 }));
  if (cleaned.length === 0) return { ok: false, error: "NO_PAGES" };

  const student = await prisma.examReportStudent.findFirst({
    where: { id: studentId, academyId: staff.academyId, deletedAt: null },
    select: { id: true, examAnalysisId: true },
  });
  if (!student) return { ok: false, error: "NOT_FOUND" };

  if (
    cleaned.some(
      (p) =>
        !isExamReportStudentPagePath(p.path, staff.academyId, student.examAnalysisId, studentId),
    )
  ) {
    return { ok: false, error: "INVALID_PATH" };
  }

  await prisma.examReportStudent.updateMany({
    where: { id: studentId, academyId: staff.academyId, deletedAt: null },
    data: { sourceFiles: toJson(cleaned), version: { increment: 1 } },
  });
  revalidatePath(studentPath(student.examAnalysisId, studentId));
  return { ok: true };
}

// ── 채점 저장 (서버 결정론 재계산) ──────────────────────────────────────────

export async function updateStudentGrading(
  studentId: string,
  input: UpdateStudentGradingInput,
  version: number,
): Promise<CasResult<"VERSION_CONFLICT" | "STRUCTURE_MISSING" | "GENERATING">> {
  const staff = await requireAuth();

  // 부모 분석의 구조(정답·배점 기준)를 스코프 조회.
  const student = await prisma.examReportStudent.findFirst({
    where: { id: studentId, academyId: staff.academyId, deletedAt: null },
    select: {
      reportStatus: true,
      examAnalysisId: true,
      examAnalysis: { select: { structure: true } },
    },
  });
  if (!student) return { ok: false, error: "VERSION_CONFLICT" };
  // 리포트 생성 중에는 저장을 거부한다 — 생성 최종 쓰기가 채점을 클로버하지 않도록
  // (라우트는 GENERATING 게이트로 커밋하고, 저장 측은 여기서 막아 양방향 클로버를 차단).
  if (student.reportStatus === "GENERATING") return { ok: false, error: "GENERATING" };

  const examMap = parseExamMap(student.examAnalysis.structure);
  if (!examMap) return { ok: false, error: "STRUCTURE_MISSING" };

  // 클라 계산 불신: 응답 파싱 → examMap 기준 정규화 → 점수 재계산.
  const parsedResponses = parseStudentResponses(input.responses);
  // 클라가 보낸 부분점수를 [0, 배점] 으로 클램프해 만점 초과·음수 총점을 원천 차단.
  let normalized = clampEarnedPoints(examMap, normalizeResponses(examMap, parsedResponses));
  // 정오표 확정 시: 전 응답을 reviewed:true 로 마킹(검수 완료 소스오브트루스).
  if (input.gradingConfirmed === true) {
    normalized = normalized.map((r) => ({ ...r, reviewed: true }));
  }
  const scoreSummary = computeScoreSummary(examMap, normalized, {
    classAverage: input.classAverage ?? null,
    gradeBand: input.gradeBand ?? null,
  });

  const data: Record<string, unknown> = {
    responses: toJson(normalized),
    scoreSummary: toJson(scoreSummary),
    version: { increment: 1 },
  };
  if (input.gradingConfirmed !== undefined) data.gradingConfirmed = input.gradingConfirmed;

  const result = await prisma.examReportStudent.updateMany({
    where: { id: studentId, academyId: staff.academyId, version, deletedAt: null },
    data,
  });
  if (result.count === 0) return { ok: false, error: "VERSION_CONFLICT" };
  revalidatePath(studentPath(student.examAnalysisId, studentId));
  return { ok: true };
}

// ── 학생 삭제 (soft-delete) ──────────────────────────────────────────────────

export async function deleteExamStudent(studentId: string): Promise<{ ok: true }> {
  const staff = await requireAuth();

  const student = await prisma.examReportStudent.findFirst({
    where: { id: studentId, academyId: staff.academyId, deletedAt: null },
    select: { examAnalysisId: true },
  });
  if (!student) throw new Error("학생 리포트를 찾을 수 없습니다.");

  await prisma.examReportStudent.updateMany({
    where: { id: studentId, academyId: staff.academyId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  revalidatePath(workspacePath(student.examAnalysisId));
  return { ok: true };
}

// ── 리포트 문서 저장 (에디터) ────────────────────────────────────────────────

export async function updateStudentReportDoc(
  studentId: string,
  envelope: unknown,
  version: number,
): Promise<CasResult<"VERSION_CONFLICT" | "INVALID_INPUT" | "GENERATING">> {
  const staff = await requireAuth();

  const parsed = parseStudentReportEnvelope(envelope);
  if (!parsed) return { ok: false, error: "INVALID_INPUT" };

  const student = await prisma.examReportStudent.findFirst({
    where: { id: studentId, academyId: staff.academyId, deletedAt: null },
    select: { reportStatus: true, examAnalysisId: true, report: true },
  });
  if (!student) return { ok: false, error: "VERSION_CONFLICT" };
  // 재생성이 진행 중이면 편집 저장을 거부한다 — 생성 최종 쓰기와의 상호 클로버 차단.
  if (student.reportStatus === "GENERATING") return { ok: false, error: "GENERATING" };

  // 클라이언트는 previous 를 알 수 없으므로(GET 이 current 만 노출) DB 의 previous
  // 슬롯을 보존 병합 — 없으면 인라인 편집 1회에 롤백 슬롯이 유실된다.
  const existing = parseStudentReportEnvelope(student.report);
  const merged = {
    current: parsed.current,
    previous: parsed.previous ?? existing?.previous,
  };

  const result = await prisma.examReportStudent.updateMany({
    where: { id: studentId, academyId: staff.academyId, version, deletedAt: null },
    data: { report: toJson(merged), version: { increment: 1 } },
  });
  if (result.count === 0) return { ok: false, error: "VERSION_CONFLICT" };
  revalidatePath(studentPath(student.examAnalysisId, studentId));
  return { ok: true };
}

// ── 리포트 롤백 (current ↔ previous 스왑) ───────────────────────────────────

export async function rollbackStudentReport(
  studentId: string,
  version: number,
): Promise<CasResult<"VERSION_CONFLICT" | "NO_PREVIOUS">> {
  const staff = await requireAuth();

  const student = await prisma.examReportStudent.findFirst({
    where: { id: studentId, academyId: staff.academyId, deletedAt: null },
    select: { examAnalysisId: true, report: true },
  });
  if (!student) return { ok: false, error: "VERSION_CONFLICT" };

  const envelope = parseStudentReportEnvelope(student.report);
  if (!envelope || !envelope.previous) return { ok: false, error: "NO_PREVIOUS" };
  const swapped = { current: envelope.previous, previous: envelope.current };

  const result = await prisma.examReportStudent.updateMany({
    where: { id: studentId, academyId: staff.academyId, version, deletedAt: null },
    data: { report: toJson(swapped), version: { increment: 1 } },
  });
  if (result.count === 0) return { ok: false, error: "VERSION_CONFLICT" };
  revalidatePath(studentPath(student.examAnalysisId, studentId));
  return { ok: true };
}
