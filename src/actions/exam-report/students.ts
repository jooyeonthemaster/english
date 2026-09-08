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
import {
  parseExamMap,
  parseExamReviewState,
  parseStudentResponses,
} from "@/lib/exam-report/schemas";
import { getMapGateStatus } from "@/lib/exam-report/map-gate";
import { parseStudentReportEnvelope } from "@/lib/exam-report/report-schema";
import {
  clampEarnedPoints,
  computeScoreSummary,
  normalizeResponses,
} from "@/lib/exam-report/grading";
import { createStudent } from "@/actions/students";
import { enableAnswerLink } from "./answer-link";
import { syncInternalAnalysisForExam } from "@/lib/exam-scoring/report-bridge";
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

/**
 * 학생 추가 허용 판정 — 모든 수동 추가 경로가 통과해야 하는 서버 가드
 * (26-09-01, 정본 docs/studio-exam-analysis-integration.md §8 C2·C3).
 *
 * ① INTERNAL(자체 시험지 합성 분석) 거부: 정본 등록 경로는 배포·응시 브리지
 *    (report-bridge upsert)다. 수동 행이 먼저 생기면 브리지 매칭 키(행 id ∪
 *    examSubmissionId)에 studentId 가 없어 **중복 행** + trend EXTERNAL 축
 *    이중 계상이 성립한다 — 실측 확인된 결함이라 서버가 자른다.
 * ② 검수 게이트: mapConfirmedNumbers 승계 규칙(map-gate.ts)은 studentCount>0
 *    이면 게이트를 여는데(레거시 구제), 미검수 분석에 학생 1명을 담는 행위
 *    자체가 그 승계를 **만들어** 0/N 이 N/N 으로 둔갑한다 — UI disabled 만으론
 *    부족해 서버가 같은 판정 함수로 재검증한다(게이트 판정 단일 소스 유지).
 *    examMap 이 아직 없으면(분석 전) 기존 동작 그대로 허용한다.
 */
/**
 * 학생 추가 허용 판정.
 *
 * mode(26-09-04):
 *  · "freeform" — 이름만으로 만드는 행(studentId 없음). 자체 시험지(INTERNAL)에서는
 *    **계속 금지**한다: 로스터 귀속이 없어 나중에 그 학생이 앱으로 응시해도 브리지가
 *    같은 사람인지 알 방법이 없다 → 목록에 두 줄, 퍼널 이중 계상.
 *  · "roster"  — 로스터 학생(studentId 있음)에 귀속되는 행. **INTERNAL 도 허용**한다.
 *    사용자 지시(26-09-04): "저 학생 목록에는 해당 클래스의 모든 학생이 보여야지.
 *    그 학생들에게 해당 시험지 링크를 보낼 수 있도록 해줘야 하는 거라고."
 *    중복 위험은 브리지 쪽에서 없앴다 — syncSubmissionToReport 가 (분석, studentId)
 *    로도 기존 행을 찾아 **먼저 만들어 둔 행에 응시 결과를 얹는다**.
 */
async function assertStudentAddAllowed(
  analysisId: string,
  academyId: string,
  mode: "roster" | "freeform" = "freeform",
): Promise<void> {
  const analysis = await prisma.examAnalysis.findFirst({
    where: { id: analysisId, academyId, deletedAt: null },
    select: {
      sourceExamId: true,
      structure: true,
      reviewState: true,
      _count: { select: { students: { where: { deletedAt: null } } } },
    },
  });
  if (!analysis) throw new Error("시험 분석을 찾을 수 없습니다.");
  if (analysis.sourceExamId && mode === "freeform") {
    throw new Error(
      "스모트 시험지 분석은 이름만으로 추가할 수 없습니다 — 클래스 학생 명단에서 선택하세요.",
    );
  }
  // INTERNAL(자체 시험지)의 검수 게이트는 **구조상 열림**이다 — 정답·배점은 시험지가
  // 이미 확정한 값이라 검수 대상이 아니다(funnel.ts·next-step.ts 와 같은 규칙).
  // 이 예외가 없으면 학생 0명인 자체 시험지에서 「정답·배점 검수를 완료해야」가 떠
  // 링크를 보낼 수 없다 — 검수 화면 자체가 그 시험지엔 존재하지 않는데도.
  const map = analysis.sourceExamId ? null : parseExamMap(analysis.structure);
  if (map && map.questions.length > 0) {
    const gate = getMapGateStatus({
      questionNumbers: map.questions.map((q) => q.number),
      reviewState: parseExamReviewState(analysis.reviewState),
      studentCount: analysis._count.students,
    });
    if (!gate.open) {
      throw new Error("정답·배점 검수를 완료해야 학생을 등록할 수 있습니다.");
    }
  }
}


/** 여러 줄 이름 붙여넣기 → 트리밍·빈 줄 제거 후 일괄 생성. 생성된 행을 반환. */
export async function addExamStudents(
  analysisId: string,
  names: string[],
): Promise<{ students: { id: string; studentName: string }[] }> {
  const staff = await requireAuth();
  await assertStudentAddAllowed(analysisId, staff.academyId);

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

// ── 로스터(Student) 연동 ─────────────────────────────────────────────────────
// 시험 리포트의 학생은 원래 이름 자유입력이라 학원 로스터와 따로 놀았다. 이제
// 추가 경로를 로스터 기준으로 통일한다: 기존 학생은 studentId 로 귀속시키고,
// 로스터에 없는 이름은 로스터에 먼저 등록(학생코드 발급)한 뒤 담는다. 그래야
// 학생 관리 화면과 시험 리포트가 같은 학생을 가리키고 응시 이력이 축적된다.

export type RosterStudentPick = {
  id: string;
  name: string;
  grade: number;
  studentCode: string;
  schoolName: string | null;
  /** 이미 이 분석에 담긴 학생 — 중복 추가 차단용 */
  alreadyAdded: boolean;
};

/** 로스터 학생 검색(경량) — 시험 리포트 학생 추가 피커용. */
export async function searchRosterStudents(
  analysisId: string,
  query: string,
): Promise<RosterStudentPick[]> {
  const staff = await requireAuth();
  await assertExamAnalysisBelongsToAcademy(analysisId, staff.academyId);

  const q = query.trim();
  const [students, linked] = await Promise.all([
    prisma.student.findMany({
      where: {
        academyId: staff.academyId,
        status: { not: "WITHDRAWN" },
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      select: {
        id: true,
        name: true,
        grade: true,
        studentCode: true,
        school: { select: { name: true } },
      },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      take: 50,
    }),
    prisma.examReportStudent.findMany({
      where: {
        examAnalysisId: analysisId,
        deletedAt: null,
        studentId: { not: null },
      },
      select: { studentId: true },
    }),
  ]);

  const addedIds = new Set(linked.map((r) => r.studentId));
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    grade: s.grade,
    studentCode: s.studentCode,
    schoolName: s.school?.name ?? null,
    alreadyAdded: addedIds.has(s.id),
  }));
}

/** 학교 목록 — 학생 추가 폼의 학교 선택용(세션 학원 스코프). */
export async function listAcademySchools(): Promise<
  { id: string; name: string; type: string }[]
> {
  const staff = await requireAuth();
  return prisma.school.findMany({
    where: { academyId: staff.academyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });
}

/** 로스터 학생을 이 시험 리포트에 담는다(studentId 귀속). 이미 담겼으면 그 행을 반환. */
export async function addExamStudentFromRoster(
  analysisId: string,
  studentId: string,
): Promise<{ student: { id: string; studentName: string } }> {
  const staff = await requireAuth();
  await assertStudentAddAllowed(analysisId, staff.academyId, "roster");

  const roster = await prisma.student.findFirst({
    where: { id: studentId, academyId: staff.academyId },
    select: { id: true, name: true },
  });
  if (!roster) throw new Error("학생을 찾을 수 없습니다.");

  const existing = await prisma.examReportStudent.findFirst({
    where: { examAnalysisId: analysisId, studentId: roster.id, deletedAt: null },
    select: { id: true, studentName: true },
  });
  if (existing) return { student: existing };

  const created = await prisma.examReportStudent.create({
    data: {
      examAnalysisId: analysisId,
      academyId: staff.academyId,
      studentName: roster.name,
      studentId: roster.id,
    },
    select: { id: true, studentName: true },
  });

  revalidatePath(workspacePath(analysisId));
  return { student: created };
}

/**
 * 로스터에 없는 학생 — 로스터에 먼저 등록(학생코드 자동 발급)하고 이 시험에 담는다.
 * 학생 관리 화면에서도 즉시 보이도록 createStudent 재사용(재검증 포함).
 */
export async function createRosterStudentForExam(
  analysisId: string,
  /** 학생 관리 등록과 동일 수준의 정보 — 학교·생년월일·성별·연락처·학부모까지. */
  input: {
    name: string;
    grade: number;
    birthDate?: string;
    gender?: string;
    phone?: string;
    schoolId?: string;
    memo?: string;
    parentName?: string;
    parentPhone?: string;
    parentRelation?: string;
    emergencyContact?: string;
  },
): Promise<{
  student: { id: string; studentName: string };
  rosterStudentId: string;
  studentCode: string;
}> {
  const staff = await requireAuth();
  // 신규 로스터 등록 → 그 학생에 귀속되는 행이므로 roster 모드.
  await assertStudentAddAllowed(analysisId, staff.academyId, "roster");

  const name = input.name.trim();
  if (!name) throw new Error("학생 이름을 입력해 주세요.");
  const grade = Math.min(3, Math.max(1, Math.round(input.grade || 1)));

  const result = await createStudent(staff.academyId, { ...input, name, grade });
  if (!result.success || !result.studentId || !result.studentCode) {
    throw new Error(result.error || "학생 등록에 실패했습니다.");
  }

  const created = await prisma.examReportStudent.create({
    data: {
      examAnalysisId: analysisId,
      academyId: staff.academyId,
      studentName: name,
      studentId: result.studentId,
    },
    select: { id: true, studentName: true },
  });

  revalidatePath(workspacePath(analysisId));
  return {
    student: created,
    rosterStudentId: result.studentId,
    studentCode: result.studentCode,
  };
}

/**
 * 로스터에 연결되지 않은 기존 학생(studentId=null — 이름 자유입력 시절 데이터)을
 * 학생 관리에 편입시킨다. 같은 이름의 로스터 학생이 있으면 연결하고, 없으면
 * 로스터에 새로 등록(학생코드 발급)한 뒤 연결한다.
 */
export async function syncExamStudentsToRoster(
  analysisId: string,
  defaultGrade = 1,
): Promise<{ linked: number; created: number }> {
  const staff = await requireAuth();
  await assertExamAnalysisBelongsToAcademy(analysisId, staff.academyId);

  const orphans = await prisma.examReportStudent.findMany({
    where: {
      examAnalysisId: analysisId,
      academyId: staff.academyId,
      deletedAt: null,
      studentId: null,
    },
    select: { id: true, studentName: true },
  });
  if (orphans.length === 0) return { linked: 0, created: 0 };

  const grade = Math.min(3, Math.max(1, Math.round(defaultGrade || 1)));
  let linked = 0;
  let created = 0;

  // 순차 처리 — 학생코드 발급이 학원 스코프 중복 검사를 하므로 병렬 금지.
  for (const orphan of orphans) {
    const name = orphan.studentName.trim();
    if (!name) continue;

    // 이미 이 분석에 같은 로스터 학생이 붙어 있으면 중복 연결하지 않는다.
    const match = await prisma.student.findFirst({
      where: { academyId: staff.academyId, name, status: { not: "WITHDRAWN" } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    let rosterId = match?.id;
    if (rosterId) {
      linked += 1;
    } else {
      const result = await createStudent(staff.academyId, { name, grade });
      if (!result.success || !result.studentId) continue;
      rosterId = result.studentId;
      created += 1;
    }

    await prisma.examReportStudent.updateMany({
      where: { id: orphan.id, academyId: staff.academyId },
      data: { studentId: rosterId },
    });
  }

  revalidatePath(workspacePath(analysisId));
  return { linked, created };
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

// ── 클래스 로스터 × 이 시험(26-09-04) ────────────────────────────────────────
//
// 사용자 지시: "당연히 저 학생 목록에는 해당 클래스의 모든 학생이 보여야지. 그리고
// 그 학생들에게 해당 시험지 링크를 보낼 수 있도록 해줘야 하는 거라고."
//
// 종전 레일 [학생] 탭은 **응시·등록된 학생**(ExamReportStudent)만 그렸다. 자체
// 시험지는 응시가 곧 등록이라, 아직 안 본 학생은 화면에 존재하지 않았고 링크를
// 보낼 대상조차 고를 수 없었다. 여기서 클래스 로스터를 내려 「미응시」 축을 만든다.
//
// 반환은 로스터 전원 + 이 분석에 이미 담긴 행 id(연결됨 판정). 정렬은 이름순.

export interface ExamRosterEntry {
  /** Student.id(로스터) */
  studentId: string;
  name: string;
  grade: number;
  studentCode: string;
  /** 이 분석에 이미 담긴 ExamReportStudent.id — 없으면 미등록(=미응시) */
  reportStudentId: string | null;
}

/** 클래스 로스터 전원 + 이 분석 등록 여부. 클래스·분석 모두 학원 스코프 이중 게이트. */
export async function listExamClassRoster(
  analysisId: string,
  classId: string,
): Promise<ExamRosterEntry[]> {
  const staff = await requireAuth();
  await assertExamAnalysisBelongsToAcademy(analysisId, staff.academyId);

  const [enrollments, linked] = await Promise.all([
    prisma.classEnrollment.findMany({
      where: {
        classId,
        status: "ENROLLED",
        class: { academyId: staff.academyId },
        student: { status: "ACTIVE", academyId: staff.academyId },
      },
      select: {
        student: {
          select: { id: true, name: true, grade: true, studentCode: true },
        },
      },
      orderBy: { enrolledAt: "asc" },
      take: 300,
    }),
    prisma.examReportStudent.findMany({
      where: {
        examAnalysisId: analysisId,
        academyId: staff.academyId,
        deletedAt: null,
        studentId: { not: null },
      },
      select: { id: true, studentId: true },
    }),
  ]);

  const byStudent = new Map(linked.map((r) => [r.studentId as string, r.id]));
  return enrollments
    .map((e) => ({
      studentId: e.student.id,
      name: e.student.name,
      grade: e.student.grade,
      studentCode: e.student.studentCode,
      reportStudentId: byStudent.get(e.student.id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/**
 * 로스터 학생에게 **이 시험의 답안(OMR) 링크를 한 번에 준비**한다(26-09-04).
 * 담기(없으면 생성 — 로스터 귀속)와 링크 발급을 한 호출로 묶는다: 강사 입장에서
 * 「이 학생에게 시험지 보내기」는 한 동작이지 두 동작이 아니다.
 *
 * 멱등: 이미 담긴 학생은 그 행을 재사용하고, 토큰이 있으면 재사용해 켜기만 한다
 * (enableAnswerLink 규약). 자체 시험지도 허용된다 — 로스터 귀속 행이라 나중에
 * 앱 응시가 들어와도 브리지가 같은 행에 얹는다(report-bridge 3축 조회).
 */
export async function issueExamAnswerLinkForRoster(
  analysisId: string,
  rosterStudentId: string,
): Promise<{ reportStudentId: string; studentName: string; token: string }> {
  const { student } = await addExamStudentFromRoster(analysisId, rosterStudentId);
  const { token } = await enableAnswerLink(student.id);
  return {
    reportStudentId: student.id,
    studentName: student.studentName,
    token,
  };
}

// ── 후보(분석 행 없는 스모트 시험지) 스코프(26-09-04 §14) ────────────────────
//
// 후보 레일도 클래스 로스터를 보여주고 링크를 보낼 수 있어야 한다(사용자 지적:
// "그 기본 분석 전에는 왜 오른쪽 탭에 애초에 아무것도 표시조차 안 돼"). 그런데
// 후보는 ExamAnalysis 행이 **아직 없어서** 분석 스코프 액션을 쓸 수 없다. 그래서
// examId 를 받아 ① 조회는 행이 있으면 그 행 기준, 없으면 「등록 0」으로 ② 발급은
// 행을 **그 자리에서 만든 뒤**(syncInternalAnalysisForExam — AI 0콜·무과금, 학생이
// 응시했을 때 일어나는 것과 같은 동기화) 진행한다.

/** examId 가 이 학원 소유인지 확인하고 INTERNAL 분석 행 id 를 찾는다(없으면 null). */
async function resolveInternalAnalysisId(
  examId: string,
  academyId: string,
): Promise<string | null> {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId },
    select: { id: true },
  });
  if (!exam) throw new Error("시험지를 찾을 수 없습니다.");
  const analysis = await prisma.examAnalysis.findFirst({
    where: { sourceExamId: examId, sourceType: "INTERNAL", academyId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return analysis?.id ?? null;
}

/** 후보/행 무관 — examId 기준 클래스 로스터. 분석 행이 없으면 전원 미등록으로 돌려준다. */
export async function listExamClassRosterByExam(
  examId: string,
  classId: string,
): Promise<ExamRosterEntry[]> {
  const staff = await requireAuth();
  const analysisId = await resolveInternalAnalysisId(examId, staff.academyId);
  if (analysisId) return listExamClassRoster(analysisId, classId);

  const enrollments = await prisma.classEnrollment.findMany({
    where: {
      classId,
      status: "ENROLLED",
      class: { academyId: staff.academyId },
      student: { status: "ACTIVE", academyId: staff.academyId },
    },
    select: { student: { select: { id: true, name: true, grade: true, studentCode: true } } },
    orderBy: { enrolledAt: "asc" },
    take: 300,
  });
  return enrollments
    .map((e) => ({
      studentId: e.student.id,
      name: e.student.name,
      grade: e.student.grade,
      studentCode: e.student.studentCode,
      reportStudentId: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/**
 * 후보 시험지에서 바로 답안(OMR) 링크 보내기 — 분석 행이 없으면 만들고 발급한다.
 * 만들기(syncInternalAnalysisForExam)는 AI 0콜·무과금이고 멱등이다. 이 호출로
 * 후보가 분석 행으로 승격되므로 왼쪽 목록에서 카드가 「분석 전」→ 행 카드로 옮겨간다.
 */
export async function issueExamAnswerLinkByExam(
  examId: string,
  rosterStudentId: string,
): Promise<{ reportStudentId: string; studentName: string; token: string }> {
  const staff = await requireAuth();
  await resolveInternalAnalysisId(examId, staff.academyId); // 소유 가드(행 유무 무관)
  const { analysisId } = await syncInternalAnalysisForExam(examId);
  return issueExamAnswerLinkForRoster(analysisId, rosterStudentId);
}
