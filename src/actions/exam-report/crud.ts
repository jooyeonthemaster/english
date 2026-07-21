"use server";

// ============================================================================
// 학생 시험 리포트 v3 — 시험 분석(ExamAnalysis) CRUD 서버액션
//
// 편집 저장은 전부 낙관적 락(CAS): updateMany({where:{id, academyId, version}}).
// count 0 → throw 아닌 {ok:false, error:'VERSION_CONFLICT'} 반환.
// v3: 구조검수 개념 폐기. sourceFiles 첨부(attachExamSources) → 직접분석(analyze
// 라우트 E1a)이 examMap 을 생성. examMap 정정은 updateExamMap(배점 변경 시 학생 점수
// 재집계). mapConfirmed 는 confirmExamMap.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  isExamReportPagePath,
  parseExamAnalysisResult,
  parseExamMap,
  parseExamReviewState,
  parseScoreSummary,
  parseStudentResponses,
} from "@/lib/exam-report/schemas";
import { computeScoreSummary } from "@/lib/exam-report/grading";
import type { ExamReviewState } from "@/lib/exam-report/types";
import {
  requireAuth,
  assertExamAnalysisBelongsToAcademy,
  toJson,
  type CasResult,
  type AttachExamSourcesInput,
  type CreateExamAnalysisInput,
  type UpdateExamMetaInput,
} from "./_helpers";

const HUB_PATH = "/director/workbench/exam-report";
const LIBRARY_PATH = "/director/workbench/exam-report/library";
const workspacePath = (id: string) => `/director/workbench/exam-report/${id}`;

// ── 생성 ─────────────────────────────────────────────────────────────────────

/** DRAFT 시험 분석을 생성한다(업로드 경로 확보를 위해 id 선발급). */
export async function createExamAnalysis(
  input: CreateExamAnalysisInput,
): Promise<{ id: string }> {
  const staff = await requireAuth();
  const created = await prisma.examAnalysis.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      title: input.title.trim() || "제목 없는 시험",
      schoolName: input.schoolName?.trim() || null,
      grade: input.grade?.trim() || null,
      examType: input.examType,
      examYear: input.examYear ?? null,
      semester: input.semester?.trim() || null,
      sourceType: input.sourceType,
      status: "DRAFT",
    },
    select: { id: true },
  });
  revalidatePath(HUB_PATH);
  revalidatePath(LIBRARY_PATH);
  return { id: created.id };
}

// ── 시험지 사진 첨부 (+ 선택적 학생1 동시 등록) ─────────────────────────────

/**
 * 업로드된 시험지 페이지를 analysis.sourceFiles 로 확정 저장한다. firstStudentName 이
 * 있으면 '학생 답안지' 흐름 — 같은 사진을 sourceFiles 로 학생1 을 동시 생성한다
 * (별도 업로드 없이 시험 사진을 그대로 학생 판독 대상으로 공유). 경로는 이 분석 전용
 * pages 키 형식과 정확히 일치해야 한다(임의 키 주입 차단).
 */
export async function attachExamSources(
  id: string,
  input: AttachExamSourcesInput,
): Promise<
  CasResult<"NOT_FOUND" | "INVALID_PATH" | "NO_PAGES"> & { firstStudentId?: string }
> {
  const staff = await requireAuth();

  const pages = input.pages
    .filter((p) => typeof p.path === "string" && p.path.length > 0)
    .map((p, i) => ({ path: p.path, page: typeof p.page === "number" ? p.page : i + 1 }));
  if (pages.length === 0) return { ok: false, error: "NO_PAGES" };
  if (pages.some((p) => !isExamReportPagePath(p.path, staff.academyId, id))) {
    return { ok: false, error: "INVALID_PATH" };
  }

  const analysis = await prisma.examAnalysis.findFirst({
    where: { id, academyId: staff.academyId, deletedAt: null },
    select: { id: true, aiMeta: true },
  });
  if (!analysis) return { ok: false, error: "NOT_FOUND" };

  // B2 락아웃 복구: 시험지 사진을 새로 첨부(교체)하면 E1a 무과금 프로브 카운터
  // (aiMeta.probeRuns)를 0 으로 리셋한다 — 화질/각도를 고쳐 다시 올려 재시도하는
  // 정상 경로가 PROBE_LIMIT(5회) 영구 락아웃에 걸리지 않게 한다. aiMeta 의 다른
  // 필드는 보존하고 probeRuns 만 덮는다(스키마 밖 확장 필드).
  const priorAiMeta =
    analysis.aiMeta && typeof analysis.aiMeta === "object" && !Array.isArray(analysis.aiMeta)
      ? (analysis.aiMeta as Record<string, unknown>)
      : {};

  const pagesJson = toJson(pages);
  const updated = await prisma.examAnalysis.updateMany({
    where: { id, academyId: staff.academyId, deletedAt: null },
    data: {
      sourceFiles: pagesJson,
      sourceType: "IMAGE",
      aiMeta: toJson({ ...priorAiMeta, probeRuns: 0 }),
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) return { ok: false, error: "NOT_FOUND" };

  let firstStudentId: string | undefined;
  const name = input.firstStudentName?.trim();
  if (name) {
    // B3: 멱등화 — 같은 analysisId 에 같은 이름의 학생(soft-delete 제외)이 이미
    // 있으면 신규 생성 대신 sourceFiles 만 갱신해 재사용한다(인테이크 재시도 시
    // 동명 학생 중복 생성 차단).
    const existingStudent = await prisma.examReportStudent.findFirst({
      where: {
        examAnalysisId: id,
        academyId: staff.academyId,
        studentName: name,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existingStudent) {
      await prisma.examReportStudent.updateMany({
        where: { id: existingStudent.id, academyId: staff.academyId, deletedAt: null },
        data: { sourceFiles: pagesJson, version: { increment: 1 } },
      });
      firstStudentId = existingStudent.id;
    } else {
      const student = await prisma.examReportStudent.create({
        data: {
          examAnalysisId: id,
          academyId: staff.academyId,
          studentName: name,
          sourceFiles: pagesJson,
        },
        select: { id: true },
      });
      firstStudentId = student.id;
    }
  }

  revalidatePath(workspacePath(id));
  return { ok: true, firstStudentId };
}

// ── 메타 수정 ────────────────────────────────────────────────────────────────

export async function updateExamMeta(
  id: string,
  meta: UpdateExamMetaInput,
  version: number,
): Promise<CasResult> {
  const staff = await requireAuth();

  const data: Record<string, unknown> = { version: { increment: 1 } };
  if (meta.title !== undefined) data.title = meta.title.trim() || "제목 없는 시험";
  if (meta.schoolName !== undefined) data.schoolName = meta.schoolName?.trim() || null;
  if (meta.grade !== undefined) data.grade = meta.grade?.trim() || null;
  if (meta.examType !== undefined) data.examType = meta.examType;
  if (meta.examYear !== undefined) data.examYear = meta.examYear;
  if (meta.semester !== undefined) data.semester = meta.semester?.trim() || null;

  const result = await prisma.examAnalysis.updateMany({
    where: { id, academyId: staff.academyId, version, deletedAt: null },
    data,
  });
  if (result.count === 0) return { ok: false, error: "VERSION_CONFLICT" };
  revalidatePath(workspacePath(id));
  return { ok: true };
}

// ── examMap 정정 (정답/배점/유형 인라인 수정) ───────────────────────────────

/**
 * examMap(structure 컬럼)을 정정 저장한다. 배점 변경이 이미 채점된 학생 점수와
 * 어긋날 수 있으므로, 저장 후 소속 학생의 scoreSummary 를 grading.ts 로 재집계한다
 * (응답의 정오 상태는 그대로, 배점만 반영). 응답에 영향 학생 수를 알린다.
 */
export async function updateExamMap(
  id: string,
  examMap: unknown,
  version: number,
): Promise<
  CasResult<"VERSION_CONFLICT" | "INVALID_MAP"> & {
    affectedStudents?: number;
    /** 확인 해제까지 반영된 최종 reviewState — 클라가 이걸로 동기화한다(서버 권위). */
    reviewState?: ExamReviewState;
  }
> {
  const staff = await requireAuth();

  const parsed = parseExamMap(examMap);
  if (!parsed || parsed.questions.length === 0) {
    return { ok: false, error: "INVALID_MAP" };
  }

  // 이전 상태는 총점 보존(B1)과 확인 해제 판정 양쪽에 필요하므로 한 번만 읽는다.
  const existing = await prisma.examAnalysis.findFirst({
    where: { id, academyId: staff.academyId, deletedAt: null },
    select: { structure: true, reviewState: true },
  });
  const priorMap = parseExamMap(existing?.structure);

  // B1: totalPoints 파괴 방지(클라 방어와 동일 규칙) — 전 문항 배점이 non-null 일
  // 때만 합계를 총점으로 신뢰하고, null 이 하나라도 있으면 기존 저장 총점을 보존한다
  // (부분 입력·손상 payload 가 총점을 0/오합으로 덮어쓰는 것 차단).
  // ※ 화면의 "입력분 부분 합계"는 표시 전용으로 클라이언트가 계산한다 — 저장 총점의
  //   신뢰 규칙은 여기 그대로 두어야 과거 총점 파괴 버그가 부활하지 않는다.
  const allPointsPresent = parsed.questions.every((q) => q.points != null);
  if (!allPointsPresent) {
    parsed.totalPoints = priorMap?.totalPoints ?? parsed.totalPoints;
  }

  // 정답·배점이 바뀐 문항은 확인을 해제해 재확인을 강제한다(게이트 무결성).
  // 이게 없으면 22/22 확인 후 값을 전부 바꿔도 게이트가 열린 채로 남는다.
  const priorByNumber = new Map(
    (priorMap?.questions ?? []).map((q) => [q.number, q]),
  );
  const changedNumbers = parsed.questions
    .filter((q) => {
      const before = priorByNumber.get(q.number);
      if (!before) return false;
      return (
        before.points !== q.points ||
        before.correctAnswer !== q.correctAnswer ||
        before.kind !== q.kind
      );
    })
    .map((q) => q.number);

  const reviewState = parseExamReviewState(existing?.reviewState);
  const nextReviewState =
    changedNumbers.length > 0 &&
    (reviewState.mapConfirmedNumbers?.length ?? 0) > 0
      ? {
          ...reviewState,
          mapConfirmedNumbers: (reviewState.mapConfirmedNumbers ?? []).filter(
            (n) => !changedNumbers.includes(n),
          ),
        }
      : null;

  const result = await prisma.examAnalysis.updateMany({
    where: { id, academyId: staff.academyId, version, deletedAt: null },
    data: {
      structure: toJson(parsed),
      ...(nextReviewState ? { reviewState: toJson(nextReviewState) } : {}),
      version: { increment: 1 },
    },
  });
  if (result.count === 0) return { ok: false, error: "VERSION_CONFLICT" };

  // 배점 재집계 — 소속 학생 점수 요약만 갱신(정오 상태·reviewed 불변).
  const students = await prisma.examReportStudent.findMany({
    where: { examAnalysisId: id, academyId: staff.academyId, deletedAt: null },
    select: { id: true, responses: true, scoreSummary: true },
  });
  for (const s of students) {
    const prior = parseScoreSummary(s.scoreSummary);
    const summary = computeScoreSummary(parsed, parseStudentResponses(s.responses), {
      classAverage: prior?.classAverage ?? null,
      gradeBand: prior?.gradeBand ?? null,
    });
    await prisma.examReportStudent.updateMany({
      where: { id: s.id, academyId: staff.academyId, deletedAt: null },
      data: { scoreSummary: toJson(summary), version: { increment: 1 } },
    });
  }

  revalidatePath(workspacePath(id));
  return {
    ok: true,
    affectedStudents: students.length,
    reviewState: nextReviewState ?? reviewState,
  };
}

// ── examMap 확인 완료 (강사 확정) ───────────────────────────────────────────

/** reviewState.mapConfirmed 를 켠다(정답/배점 강사 확인 완료 뱃지 소스). */
export async function confirmExamMap(
  id: string,
  version: number,
  confirmedNumbers?: string[],
): Promise<CasResult> {
  const staff = await requireAuth();

  const existing = await prisma.examAnalysis.findFirst({
    where: { id, academyId: staff.academyId, deletedAt: null },
    select: { reviewState: true },
  });
  if (!existing) return { ok: false, error: "VERSION_CONFLICT" };
  const reviewState = parseExamReviewState(existing.reviewState);

  const result = await prisma.examAnalysis.updateMany({
    where: { id, academyId: staff.academyId, version, deletedAt: null },
    data: {
      reviewState: toJson({
        ...reviewState,
        mapConfirmed: true,
        ...(confirmedNumbers ? { confirmedNumbers } : {}),
      }),
      version: { increment: 1 },
    },
  });
  if (result.count === 0) return { ok: false, error: "VERSION_CONFLICT" };
  revalidatePath(workspacePath(id));
  return { ok: true };
}

/**
 * 정답·배점 **문항별** 확인 토글 — 학생 관리 게이트(map-gate)의 유일한 기록 경로.
 * 일괄 confirmExamMap(레거시 뱃지)과 달리 번호 단위라, 배점/정답을 고치면
 * 해당 번호만 빼서 재확인을 강제할 수 있다.
 */
export async function setMapQuestionConfirmed(
  id: string,
  version: number,
  numbers: string[],
  confirmed: boolean,
): Promise<CasResult> {
  const staff = await requireAuth();

  const existing = await prisma.examAnalysis.findFirst({
    where: { id, academyId: staff.academyId, deletedAt: null },
    select: { reviewState: true },
  });
  if (!existing) return { ok: false, error: "VERSION_CONFLICT" };
  const reviewState = parseExamReviewState(existing.reviewState);

  // 병합 갱신(덮어쓰기 금지) — 「전체 검수 완료」가 배열을 통째로 갈아엎어
  // 부분 되돌리기가 불가능했던 전철을 밟지 않는다.
  const next = new Set(reviewState.mapConfirmedNumbers ?? []);
  for (const n of numbers) {
    if (confirmed) next.add(n);
    else next.delete(n);
  }

  const result = await prisma.examAnalysis.updateMany({
    where: { id, academyId: staff.academyId, version, deletedAt: null },
    data: {
      reviewState: toJson({
        ...reviewState,
        mapConfirmedNumbers: [...next],
      }),
      version: { increment: 1 },
    },
  });
  if (result.count === 0) return { ok: false, error: "VERSION_CONFLICT" };
  revalidatePath(workspacePath(id));
  return { ok: true };
}

// ── 분석 편집 저장 (문항분석 카드 인라인 수정 + reviewState) ─────────────────

export async function updateAnalysisEdits(
  id: string,
  analysis: unknown,
  reviewState: unknown,
  version: number,
): Promise<CasResult<"VERSION_CONFLICT" | "INVALID_INPUT">> {
  const staff = await requireAuth();

  const parsedAnalysis = parseExamAnalysisResult(analysis);
  if (!parsedAnalysis) return { ok: false, error: "INVALID_INPUT" };
  const parsedReview = parseExamReviewState(reviewState);

  const result = await prisma.examAnalysis.updateMany({
    where: { id, academyId: staff.academyId, version, deletedAt: null },
    data: {
      analysis: toJson(parsedAnalysis),
      reviewState: toJson(parsedReview),
      version: { increment: 1 },
    },
  });
  if (result.count === 0) return { ok: false, error: "VERSION_CONFLICT" };
  revalidatePath(workspacePath(id));
  return { ok: true };
}

// ── 삭제 (soft-delete + 소속 학생 동반) ──────────────────────────────────────

export async function deleteExamAnalysis(id: string): Promise<{ ok: true }> {
  const staff = await requireAuth();
  await assertExamAnalysisBelongsToAcademy(id, staff.academyId);

  const now = new Date();
  await prisma.$transaction([
    prisma.examAnalysis.updateMany({
      where: { id, academyId: staff.academyId, deletedAt: null },
      data: { deletedAt: now },
    }),
    prisma.examReportStudent.updateMany({
      where: { examAnalysisId: id, academyId: staff.academyId, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);

  revalidatePath(HUB_PATH);
  revalidatePath(LIBRARY_PATH);
  return { ok: true };
}
