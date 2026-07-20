"use server";

// ============================================================================
// 통합 학습 과제 — 생성/수정/종료/삭제 서버액션
//
// 계약(설계 §3·§4):
//  - 전 액션 requireStaffAuth + academyId 교차검증.
//  - 생성 = targets 확장(반→재원생, dedupe) → kind별 브리지 생성 → assignment+tasks
//    원자쌍($transaction). 브리지 생성 후 원자쌍이 실패하면 GRAMMAR 브리지는 catch
//    에서 보상 삭제(고아 훈련 차단). EXAM 은 기존 assignStudentsToExam(응시 링크·
//    orderSnapshot·CAS 규율 전부 재사용) — 외부 액션이라 트랜잭션 밖 유지,
//    GRAMMAR 는 GrammarDrillAssignment 행 생성(드릴 엔진이 소비).
//  - 삭제 = 과제+태스크 삭제. GRAMMAR 브리지는 미완료 행만 함께 삭제(엔진 노출 제거),
//    EXAM 브리지(ExamSubmission)는 보존 — 시험 배포 수명주기는 배포 모달 소관.
// ============================================================================

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assignStudentsToExam } from "@/actions/exams/assignments";
import { countGrammarDrillPool } from "@/actions/grammar-drill-admin";
import type {
  ExamAssignmentPayload,
  GrammarAssignmentPayload,
  QuestionsAssignmentPayload,
  StudyAssignmentKind,
  StudyTargetInput,
  WorksheetAssignmentPayload,
} from "@/lib/study-assignments/types";
import { isStudyAssignmentKind } from "@/lib/study-assignments/types";
import {
  STUDY_ASSIGNMENT_PATHS,
  expandTargets,
  toErrorMessage,
  type StudyActionResult,
} from "./_shared";

export type { StudyActionResult } from "./_shared";

function revalidateAll() {
  for (const p of STUDY_ASSIGNMENT_PATHS) revalidatePath(p, "layout");
}

export interface CreateStudyAssignmentInput {
  kind: StudyAssignmentKind;
  title?: string;
  instructions?: string;
  /** ISO — 미지정 시 즉시 */
  availableFrom?: string | null;
  /** ISO — null/미지정 = 마감 없음 */
  dueAt?: string | null;
  targets: StudyTargetInput[];
  /** durationMin: 제한시간 오버라이드(분) — null/미지정 = 시험지 duration 사용 */
  exam?: { examId: string; mode: "TABLET" | "OMR"; durationMin?: number | null };
  /** study: 모바일 스터디 모드 — 미지정 시 { mode:"standard", required:true } 로 배포 */
  worksheet?: {
    passageReportId: string;
    study?: { mode: "off" | "light" | "standard" | "intense"; required: boolean };
  };
  questions?: { questionIds: string[] };
  grammar?: GrammarAssignmentPayload;
}

export interface CreateStudyAssignmentData {
  assignmentId: string;
  taskCount: number;
  /** EXAM: 재응시 불가 등으로 링크 재발급이 건너뛰어진 학생 수(태스크는 생성됨) */
  skippedCount: number;
}

export async function createStudyAssignment(
  input: CreateStudyAssignmentInput,
): Promise<StudyActionResult<CreateStudyAssignmentData>> {
  // 보상 삭제용 추적 — GRAMMAR 브리지는 assignment 원자쌍보다 먼저(트랜잭션 밖)
  // 생성되므로, 이후 단계 실패 시 catch 에서 이 id 들을 지워 고아를 막는다.
  const createdGrammarBridgeIds: string[] = [];
  let assignmentCommitted = false;
  try {
    const staff = await requireStaffAuth();
    if (!isStudyAssignmentKind(input.kind)) {
      return { success: false, error: "올바르지 않은 과제 종류입니다." };
    }

    const expanded = await expandTargets(staff.academyId, input.targets ?? []);
    if ("error" in expanded) return { success: false, error: expanded.error };

    const availableFrom = input.availableFrom ? new Date(input.availableFrom) : new Date();
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (Number.isNaN(availableFrom.getTime())) {
      return { success: false, error: "시작일이 올바르지 않습니다." };
    }
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      return { success: false, error: "마감일이 올바르지 않습니다." };
    }
    if (dueAt && dueAt.getTime() < availableFrom.getTime()) {
      return { success: false, error: "마감일은 시작일 이후여야 합니다." };
    }

    let title = input.title?.trim() ?? "";
    let refId: string | null = null;
    let payload:
      | ExamAssignmentPayload
      | WorksheetAssignmentPayload
      | QuestionsAssignmentPayload
      | GrammarAssignmentPayload;
    /** studentId → 브리지 id */
    const examSubmissionByStudent = new Map<string, string>();
    let grammarIdByStudent = new Map<string, string>();
    let skippedCount = 0;

    if (input.kind === "EXAM") {
      if (!input.exam?.examId) {
        return { success: false, error: "배포할 시험지를 선택해 주세요." };
      }
      const exam = await prisma.exam.findFirst({
        where: { id: input.exam.examId, academyId: staff.academyId },
        select: { id: true, title: true, subject: true },
      });
      if (!exam) return { success: false, error: "시험지를 찾을 수 없습니다." };
      if (exam.subject === "KOREAN") {
        return { success: false, error: "국어 시험지는 아직 학생 앱 배포를 지원하지 않습니다." };
      }
      // 응시 링크·orderSnapshot·상태 규율 전부 기존 배포 액션에 위임.
      const assigned = await assignStudentsToExam({
        examId: exam.id,
        studentIds: expanded.studentIds,
        mode: input.exam.mode,
      });
      if (!assigned.success || !assigned.data) {
        return { success: false, error: assigned.error ?? "시험 배포에 실패했습니다." };
      }
      skippedCount = assigned.data.skipped.length;
      // skipped(SUBMITTED/GRADED) 학생도 기존 submission 에 브리지 — 과제 카드에는 완료로 뜬다.
      const existing = await prisma.examSubmission.findMany({
        where: { examId: exam.id, studentId: { in: expanded.studentIds } },
        select: { id: true, studentId: true },
      });
      for (const row of existing) examSubmissionByStudent.set(row.studentId, row.id);
      title = title || exam.title;
      refId = exam.id;
      // 제한시간 오버라이드 — payload 에만 저장(DB 스키마 불변 계약), 1~600 클램프.
      // /t 응시면은 taking-bridge 가 이 값을 읽어 세션 duration 을 페이지 레벨 패치한다.
      const durationMin =
        typeof input.exam.durationMin === "number" && Number.isFinite(input.exam.durationMin)
          ? Math.max(1, Math.min(600, Math.round(input.exam.durationMin)))
          : null;
      payload = {
        mode: input.exam.mode,
        ...(durationMin ? { durationMin } : {}),
      } satisfies ExamAssignmentPayload;
    } else if (input.kind === "WORKSHEET") {
      if (!input.worksheet?.passageReportId) {
        return { success: false, error: "배포할 학습지를 선택해 주세요." };
      }
      const report = await prisma.passageReport.findFirst({
        where: {
          id: input.worksheet.passageReportId,
          academyId: staff.academyId,
          deletedAt: null,
        },
        select: { id: true, title: true },
      });
      if (!report) return { success: false, error: "학습지를 찾을 수 없습니다." };
      title = title || report.title;
      refId = report.id;
      // 스터디 모드 설정 방어 정규화 — 신규 배포 기본은 표준 코스 + 완료 조건 on.
      const rawStudy = input.worksheet.study;
      const studyMode =
        rawStudy?.mode === "off" ||
        rawStudy?.mode === "light" ||
        rawStudy?.mode === "standard" ||
        rawStudy?.mode === "intense"
          ? rawStudy.mode
          : "standard";
      const study = {
        mode: studyMode,
        required: studyMode !== "off" && rawStudy?.required !== false,
      };
      payload = { passageTitle: report.title, study } satisfies WorksheetAssignmentPayload;
    } else if (input.kind === "QUESTIONS") {
      const questionIds = [...new Set(input.questions?.questionIds ?? [])].filter(Boolean);
      if (questionIds.length === 0) {
        return { success: false, error: "배포할 문제를 선택해 주세요." };
      }
      if (questionIds.length > 50) {
        return { success: false, error: "문제 세트는 한 번에 50문항까지 배포할 수 있습니다." };
      }
      const owned = await prisma.question.count({
        where: { id: { in: questionIds }, academyId: staff.academyId, deletedAt: null },
      });
      if (owned !== questionIds.length) {
        return { success: false, error: "일부 문제를 찾을 수 없습니다. 삭제된 문제가 포함됐는지 확인해 주세요." };
      }
      title = title || `문제 세트 ${questionIds.length}문항`;
      payload = { questionIds } satisfies QuestionsAssignmentPayload;
    } else {
      // GRAMMAR
      const spec = input.grammar;
      const count = Math.max(1, Math.min(100, Math.round(spec?.count ?? 0)));
      if (!spec || !count) {
        return { success: false, error: "어법 훈련 구성을 확인해 주세요." };
      }
      const clean: GrammarAssignmentPayload = {
        count,
        ...(spec.unitIds?.length ? { unitIds: spec.unitIds.map(String) } : {}),
        ...(spec.conceptIds?.length ? { conceptIds: spec.conceptIds.map(String) } : {}),
        ...(spec.itemTypes?.length ? { itemTypes: spec.itemTypes.map(String) } : {}),
        ...(spec.difficulties?.length
          ? { difficulties: spec.difficulties.map((d) => Number(d)).filter((d) => d >= 1 && d <= 4) }
          : {}),
      };
      // 빈 풀 가드 — 조건과 일치하는 문항이 0개면 영원히 완료 불가한 과제가 되므로
      // 브리지 생성 전에 배포를 거부한다(필터 술어는 드릴 엔진 assignment 풀과 동일).
      const poolCount = await countGrammarDrillPool({
        unitIds: clean.unitIds,
        conceptIds: clean.conceptIds,
        itemTypes: clean.itemTypes,
        difficulties: clean.difficulties,
      });
      if (poolCount.total === 0) {
        return { success: false, error: "선택한 조건과 일치하는 어법 문항이 없습니다." };
      }
      title = title || `어법 훈련 ${count}문항`;
      payload = clean;
      const note = input.instructions?.trim() || null;
      const created = await prisma.grammarDrillAssignment.createManyAndReturn({
        data: expanded.studentIds.map((studentId) => ({
          academyId: staff.academyId,
          studentId,
          staffId: staff.id,
          title,
          note,
          spec: clean as unknown as Prisma.InputJsonValue,
        })),
        select: { id: true, studentId: true },
      });
      grammarIdByStudent = new Map(created.map((row) => [row.studentId, row.id]));
      createdGrammarBridgeIds.push(...created.map((row) => row.id));
    }

    // assignment + tasks 는 인터랙티브 트랜잭션으로 원자화 — 태스크 없는 껍데기 과제나
    // 소속 과제 없는 태스크가 남는 반쪽 상태를 차단한다. EXAM 브리지
    // (assignStudentsToExam)는 자체 트랜잭션·revalidate 를 가진 외부 액션이라 트랜잭션
    // 밖 유지 — 여기서 실패해도 ExamSubmission 은 배포 모달 소관 산출물로 보존된다
    // (deleteStudyAssignment 의 EXAM 브리지 보존 계약과 동일한 방향).
    const assignment = await prisma.$transaction(async (tx) => {
      const createdAssignment = await tx.studyAssignment.create({
        data: {
          academyId: staff.academyId,
          createdById: staff.id,
          kind: input.kind,
          refId,
          payload: payload as unknown as Prisma.InputJsonValue,
          title,
          instructions: input.instructions?.trim() || null,
          availableFrom,
          dueAt,
          targets: expanded.snapshots as unknown as Prisma.InputJsonValue,
          targetSummary: expanded.summary,
        },
        select: { id: true },
      });

      await tx.studyAssignmentTask.createMany({
        data: expanded.studentIds.map((studentId) => ({
          academyId: staff.academyId,
          assignmentId: createdAssignment.id,
          studentId,
          examSubmissionId: examSubmissionByStudent.get(studentId) ?? null,
          grammarAssignmentId: grammarIdByStudent.get(studentId) ?? null,
        })),
      });
      return createdAssignment;
    });
    assignmentCommitted = true;

    revalidateAll();
    return {
      success: true,
      data: {
        assignmentId: assignment.id,
        taskCount: expanded.studentIds.length,
        skippedCount,
      },
    };
  } catch (error) {
    // GRAMMAR 브리지 보상 삭제 — 원자쌍이 커밋되지 못했는데 브리지만 남으면 소속 과제
    // 없는 고아 훈련이 드릴 엔진(학생 앱)에 노출된다. 방금 생성한 행(응시 이력 0)만
    // id 로 지우고, 보상 자체의 실패는 원인 에러 메시지를 가리지 않도록 삼킨다.
    if (!assignmentCommitted && createdGrammarBridgeIds.length > 0) {
      await prisma.grammarDrillAssignment
        .deleteMany({ where: { id: { in: createdGrammarBridgeIds } } })
        .catch(() => {});
    }
    return { success: false, error: toErrorMessage(error, "과제 생성 중 오류가 발생했습니다.") };
  }
}

async function loadOwnedAssignment(assignmentId: string, academyId: string) {
  return prisma.studyAssignment.findFirst({
    where: { id: assignmentId, academyId },
    // availableFrom/dueAt 은 updateStudyAssignment 의 시작·마감 교차검증 기준값.
    select: { id: true, kind: true, status: true, availableFrom: true, dueAt: true },
  });
}

export async function updateStudyAssignment(input: {
  assignmentId: string;
  title?: string;
  instructions?: string | null;
  dueAt?: string | null;
  availableFrom?: string;
}): Promise<StudyActionResult> {
  try {
    const staff = await requireStaffAuth();
    const owned = await loadOwnedAssignment(input.assignmentId, staff.academyId);
    if (!owned) return { success: false, error: "과제를 찾을 수 없습니다." };

    const data: Prisma.StudyAssignmentUpdateInput = {};
    if (typeof input.title === "string" && input.title.trim()) data.title = input.title.trim();
    if (input.instructions !== undefined) {
      data.instructions = input.instructions?.trim() || null;
    }
    // 시작·마감 교차검증 — 입력에 없는 쪽은 저장값을 기준으로 유효쌍을 계산해
    // dueAt < availableFrom 을 거부한다(create 와 동일 규칙·동일 문구).
    const nextFrom = input.availableFrom ? new Date(input.availableFrom) : owned.availableFrom;
    const nextDue =
      input.dueAt !== undefined ? (input.dueAt ? new Date(input.dueAt) : null) : owned.dueAt;
    if (input.availableFrom && Number.isNaN(nextFrom.getTime())) {
      return { success: false, error: "시작일이 올바르지 않습니다." };
    }
    if (input.dueAt && nextDue && Number.isNaN(nextDue.getTime())) {
      return { success: false, error: "마감일이 올바르지 않습니다." };
    }
    if (nextDue && nextDue.getTime() < nextFrom.getTime()) {
      return { success: false, error: "마감일은 시작일 이후여야 합니다." };
    }
    if (input.dueAt !== undefined) data.dueAt = nextDue;
    if (input.availableFrom) data.availableFrom = nextFrom;

    await prisma.studyAssignment.update({ where: { id: owned.id }, data });
    revalidateAll();
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "과제 수정 중 오류가 발생했습니다.") };
  }
}

/** 과제 종료 — 학생 앱 목록에서 잠금 표시(신규 진입 차단은 kind별 뷰어가 status 확인) */
export async function closeStudyAssignment(assignmentId: string): Promise<StudyActionResult> {
  return setAssignmentStatus(assignmentId, "CLOSED");
}

export async function reopenStudyAssignment(assignmentId: string): Promise<StudyActionResult> {
  return setAssignmentStatus(assignmentId, "ACTIVE");
}

async function setAssignmentStatus(
  assignmentId: string,
  status: "ACTIVE" | "CLOSED",
): Promise<StudyActionResult> {
  try {
    const staff = await requireStaffAuth();
    const owned = await loadOwnedAssignment(assignmentId, staff.academyId);
    if (!owned) return { success: false, error: "과제를 찾을 수 없습니다." };
    await prisma.studyAssignment.update({ where: { id: owned.id }, data: { status } });
    revalidateAll();
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "상태 변경 중 오류가 발생했습니다.") };
  }
}

/**
 * 과제 삭제 — 태스크 함께 삭제. GRAMMAR 브리지는 미완료(≠DONE) 행만 삭제해
 * 학생 앱 노출을 제거한다(완료 기록·시도 로그는 보존). EXAM 브리지는 보존.
 */
export async function deleteStudyAssignment(assignmentId: string): Promise<StudyActionResult> {
  try {
    const staff = await requireStaffAuth();
    const owned = await loadOwnedAssignment(assignmentId, staff.academyId);
    if (!owned) return { success: false, error: "과제를 찾을 수 없습니다." };

    const tasks = await prisma.studyAssignmentTask.findMany({
      where: { assignmentId: owned.id, academyId: staff.academyId },
      select: { grammarAssignmentId: true },
    });
    const gaIds = tasks
      .map((t) => t.grammarAssignmentId)
      .filter((id): id is string => !!id);

    await prisma.$transaction([
      ...(gaIds.length
        ? [
            prisma.grammarDrillAssignment.deleteMany({
              where: {
                id: { in: gaIds },
                academyId: staff.academyId,
                status: { not: "DONE" },
              },
            }),
          ]
        : []),
      prisma.studyAssignmentTask.deleteMany({
        where: { assignmentId: owned.id, academyId: staff.academyId },
      }),
      prisma.studyAssignment.delete({ where: { id: owned.id } }),
    ]);

    revalidateAll();
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "과제 삭제 중 오류가 발생했습니다.") };
  }
}
