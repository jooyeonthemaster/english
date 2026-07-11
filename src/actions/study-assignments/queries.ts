"use server";

// ============================================================================
// 통합 학습 과제 — 조회 서버액션 (디렉터면 전용)
//
// 라이브 상태는 저장값이 아니라 조회 시 브리지 조인으로 계산한다
// (src/lib/study-assignments/task-union.ts loadTaskLiveMap 정본).
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type {
  StudyAssignmentDetail,
  StudyAssignmentKind,
  StudyAssignmentListRow,
  StudyAssignmentStatus,
  StudyTargetSnapshot,
  StudentStudyTaskRow,
} from "@/lib/study-assignments/types";
import { isStudyAssignmentKind } from "@/lib/study-assignments/types";
import { isTaskOverdue } from "@/lib/study-assignments/status";
import {
  loadStudentUnifiedTasks,
  loadTaskLiveMap,
} from "@/lib/study-assignments/task-union";
import type { StudentInput, SubmissionResponse } from "@/lib/exam-scoring/types";
import { isoOf, toErrorMessage, type StudyActionResult } from "./_shared";

// ── 배포 대상 로스터 ─────────────────────────────────────────────────────────

export interface AssignTargetsData {
  classes: { id: string; name: string; studentCount: number }[];
  students: {
    id: string;
    name: string;
    grade: number;
    studentCode: string;
    schoolName: string | null;
    classNames: string[];
    /** ENROLLED 반 id — 반→개별 전환·id 기반 선택 카운트의 데이터원(classNames 와 동순) */
    classIds: string[];
  }[];
}

export async function getAssignTargets(): Promise<StudyActionResult<AssignTargetsData>> {
  try {
    const staff = await requireStaffAuth();
    const [classes, students] = await Promise.all([
      prisma.class.findMany({
        where: { academyId: staff.academyId, isActive: true },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              enrollments: {
                where: { status: "ENROLLED", student: { status: "ACTIVE" } },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.student.findMany({
        where: { academyId: staff.academyId, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          grade: true,
          studentCode: true,
          school: { select: { name: true } },
          classEnrollments: {
            where: { status: "ENROLLED" },
            select: { class: { select: { id: true, name: true } } },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      success: true,
      data: {
        classes: classes.map((c) => ({
          id: c.id,
          name: c.name,
          studentCount: c._count.enrollments,
        })),
        students: students.map((s) => ({
          id: s.id,
          name: s.name,
          grade: s.grade,
          studentCode: s.studentCode,
          schoolName: s.school?.name ?? null,
          classNames: s.classEnrollments.map((e) => e.class.name),
          classIds: s.classEnrollments.map((e) => e.class.id),
        })),
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "대상 목록 조회 중 오류가 발생했습니다.") };
  }
}

// ── 과제 목록 (관리 페이지·캘린더) ──────────────────────────────────────────

export interface ListStudyAssignmentsInput {
  kind?: StudyAssignmentKind | "ALL";
  status?: StudyAssignmentStatus | "ALL";
  /** "2026-07" — 캘린더 월 필터(dueAt 또는 availableFrom 이 해당 월) */
  month?: string;
  /** 학생별 필터 — 이 학생에게 태스크가 배정된 과제만(relation-free 2쿼리) */
  studentId?: string;
  /** 반별 필터 — targets 스냅샷에 해당 반이 포함된 과제만(jsonb 부분 일치) */
  classId?: string;
}

export async function listStudyAssignments(
  input?: ListStudyAssignmentsInput,
): Promise<StudyActionResult<StudyAssignmentListRow[]>> {
  try {
    const staff = await requireStaffAuth();
    const where: Record<string, unknown> = { academyId: staff.academyId };
    if (input?.kind && input.kind !== "ALL") where.kind = input.kind;
    if (input?.status && input.status !== "ALL") where.status = input.status;
    else where.status = { not: "ARCHIVED" };
    if (input?.studentId) {
      // relation-free 2쿼리 패턴 — 태스크 테이블에서 이 학생의 assignmentId 를
      // 선조회해 id in 으로 좁힌다(StudyAssignmentTask 는 FK 없는 soft-ref).
      const taskRefs = await prisma.studyAssignmentTask.findMany({
        where: { studentId: input.studentId, academyId: staff.academyId },
        select: { assignmentId: true },
      });
      const assignmentIds = [...new Set(taskRefs.map((t) => t.assignmentId))];
      if (assignmentIds.length === 0) return { success: true, data: [] };
      where.id = { in: assignmentIds };
    }
    if (input?.classId) {
      // targets jsonb 스냅샷 원소 부분 일치(@>) — [{type:"CLASS", id}] 포함 매칭.
      // name 은 스냅샷마다 다르므로 type+id 로만 매칭한다.
      where.targets = { array_contains: [{ type: "CLASS", id: input.classId }] };
    }
    let isMonthQuery = false;
    if (input?.month && /^\d{4}-\d{2}$/.test(input.month)) {
      isMonthQuery = true;
      const [y, m] = input.month.split("-").map(Number);
      // 서울(UTC+9) 달력월 경계
      const start = new Date(Date.UTC(y, m - 1, 1, -9));
      const end = new Date(Date.UTC(y, m, 1, -9));
      where.OR = [
        { dueAt: { gte: start, lt: end } },
        // availableFrom OR-암 유지 판단: dueAt 없는 과제는 이 암이 없으면 어느 월에도
        // 매칭되지 않아 캘린더에서 영구 미노출된다 — 시작월에 표시되도록 유지한다.
        // (dueAt 있는 과제는 위 dueAt-암이 전담하므로 이중 매칭은 없다.)
        { dueAt: null, availableFrom: { gte: start, lt: end } },
      ];
    }

    const assignments = await prisma.studyAssignment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      // 월 필터는 이미 기간으로 좁혀진 조회라 200 절단 시 월중 과제가 캘린더에서
      // 소리 없이 누락된다 — 500 으로 상향. 무필터 관리 목록은 최신 200 유지.
      take: isMonthQuery ? 500 : 200,
    });
    if (assignments.length === 0) return { success: true, data: [] };

    const tasks = await prisma.studyAssignmentTask.findMany({
      where: { assignmentId: { in: assignments.map((a) => a.id) } },
      select: {
        id: true,
        assignmentId: true,
        status: true,
        startedAt: true,
        completedAt: true,
        examSubmissionId: true,
        grammarAssignmentId: true,
        result: true,
      },
    });
    const liveMap = await loadTaskLiveMap(staff.academyId, tasks);
    const now = new Date();

    const rows: StudyAssignmentListRow[] = assignments.map((a) => {
      const mine = tasks.filter((t) => t.assignmentId === a.id);
      let done = 0;
      let inProgress = 0;
      let overdue = 0;
      for (const t of mine) {
        const live = liveMap.get(t.id);
        const status = live?.liveStatus ?? "ASSIGNED";
        if (status === "DONE") done += 1;
        else if (status === "IN_PROGRESS") inProgress += 1;
        if (isTaskOverdue(a.dueAt, status, now)) overdue += 1;
      }
      return {
        id: a.id,
        kind: isStudyAssignmentKind(a.kind) ? a.kind : "QUESTIONS",
        title: a.title,
        refId: a.refId,
        status: (a.status as StudyAssignmentStatus) ?? "ACTIVE",
        availableFrom: a.availableFrom.toISOString(),
        dueAt: isoOf(a.dueAt),
        targetSummary: a.targetSummary,
        instructions: a.instructions,
        createdAt: a.createdAt.toISOString(),
        taskCount: mine.length,
        doneCount: done,
        inProgressCount: inProgress,
        overdueCount: overdue,
      };
    });
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "과제 목록 조회 중 오류가 발생했습니다.") };
  }
}

// ── 과제 상세 (학생별 태스크) ────────────────────────────────────────────────

export async function getStudyAssignmentDetail(
  assignmentId: string,
): Promise<StudyActionResult<StudyAssignmentDetail>> {
  try {
    const staff = await requireStaffAuth();
    const a = await prisma.studyAssignment.findFirst({
      where: { id: assignmentId, academyId: staff.academyId },
    });
    if (!a) return { success: false, error: "과제를 찾을 수 없습니다." };

    const tasks = await prisma.studyAssignmentTask.findMany({
      where: { assignmentId: a.id },
      select: {
        id: true,
        studentId: true,
        status: true,
        startedAt: true,
        completedAt: true,
        examSubmissionId: true,
        grammarAssignmentId: true,
        result: true,
        // hasResponses 직렬화용 — 원문은 getStudyTaskResponses 로 지연 조회
        responses: true,
      },
    });
    const [liveMap, students] = await Promise.all([
      loadTaskLiveMap(staff.academyId, tasks),
      prisma.student.findMany({
        // 테넌트 스코프 — 태스크 studentId 는 생성 시점에 자기 학원생으로 검증되지만,
        // soft-ref(FK 없음)라 이후 이관·오염 가능성에 대비해 조회에서도 교차검증한다.
        // 스코프 밖 학생은 아래 "(삭제된 학생)" 폴백으로 표시된다.
        where: { id: { in: tasks.map((t) => t.studentId) }, academyId: staff.academyId },
        select: { id: true, name: true, studentCode: true, grade: true },
      }),
    ]);
    const studentById = new Map(students.map((s) => [s.id, s]));
    const now = new Date();

    let done = 0;
    let inProgress = 0;
    let overdueCount = 0;
    const taskRows = tasks
      .map((t) => {
        const live = liveMap.get(t.id);
        const status = live?.liveStatus ?? "ASSIGNED";
        if (status === "DONE") done += 1;
        else if (status === "IN_PROGRESS") inProgress += 1;
        const overdue = isTaskOverdue(a.dueAt, status, now);
        if (overdue) overdueCount += 1;
        const student = studentById.get(t.studentId);
        return {
          taskId: t.id,
          studentId: t.studentId,
          studentName: student?.name ?? "(삭제된 학생)",
          studentCode: student?.studentCode ?? "",
          grade: student?.grade ?? 0,
          liveStatus: status,
          overdue,
          startedAt: isoOf(live?.startedAt ?? t.startedAt),
          completedAt: isoOf(live?.completedAt ?? t.completedAt),
          scoreText: live?.scoreText ?? null,
          scorePercent: live?.scorePercent ?? null,
          tokenPath: live?.tokenPath ?? null,
          examSubmissionId: t.examSubmissionId,
          grammarAssignmentId: t.grammarAssignmentId,
          hasResponses: Array.isArray(t.responses) && t.responses.length > 0,
        };
      })
      .sort((x, y) => x.studentName.localeCompare(y.studentName, "ko"));

    return {
      success: true,
      data: {
        id: a.id,
        kind: isStudyAssignmentKind(a.kind) ? a.kind : "QUESTIONS",
        title: a.title,
        refId: a.refId,
        status: (a.status as StudyAssignmentStatus) ?? "ACTIVE",
        availableFrom: a.availableFrom.toISOString(),
        dueAt: isoOf(a.dueAt),
        targetSummary: a.targetSummary,
        instructions: a.instructions,
        createdAt: a.createdAt.toISOString(),
        taskCount: tasks.length,
        doneCount: done,
        inProgressCount: inProgress,
        overdueCount,
        targets: (a.targets ?? []) as unknown as StudyTargetSnapshot[],
        payload: (a.payload ?? {}) as StudyAssignmentDetail["payload"],
        tasks: taskRows,
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "과제 상세 조회 중 오류가 발생했습니다.") };
  }
}

// ── 학생 상세 "과제" 탭 ──────────────────────────────────────────────────────

export async function listStudentStudyTasks(
  studentId: string,
): Promise<StudyActionResult<StudentStudyTaskRow[]>> {
  try {
    const staff = await requireStaffAuth();
    const student = await prisma.student.findFirst({
      where: { id: studentId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!student) return { success: false, error: "학생을 찾을 수 없습니다." };

    const records = await loadStudentUnifiedTasks(studentId, staff.academyId);
    const now = new Date();
    const rows: StudentStudyTaskRow[] = records.map((r) => {
      const overdue = isTaskOverdue(r.dueAt, r.status, now);
      let scoreText: string | null = null;
      if (r.score && r.score.earned !== null) {
        scoreText = `${r.score.earned}점${r.score.max !== null ? ` / ${r.score.max}점` : ""}`;
      } else if (r.score) {
        scoreText = `${r.score.correct} / ${r.score.total} 정답`;
      }
      const progressText =
        r.progress && r.progress.total > 0
          ? `${r.progress.done}/${r.progress.total} 문항`
          : null;
      return {
        taskId: r.taskId,
        source: r.source,
        assignmentId: r.assignmentId,
        kind: r.kind,
        title: r.title,
        liveStatus: r.status,
        overdue,
        dueAt: isoOf(r.dueAt),
        availableFrom: isoOf(r.availableFrom),
        assignedAt: r.assignedAt.toISOString(),
        completedAt: isoOf(r.completedAt),
        scoreText,
        progressText,
        // UnifiedTaskRecord 가 이미 로드한 필드 재사용 — 추가 쿼리 0(링크 복사 버튼용).
        tokenPath:
          r.examAccessEnabled && r.examAccessToken ? `/t/${r.examAccessToken}` : null,
        examSubmissionId: r.examSubmissionId,
        grammarAssignmentId: r.grammarAssignmentId,
      };
    });
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "학생 과제 조회 중 오류가 발생했습니다.") };
  }
}

// ── QUESTIONS 태스크 답안 원본 (문항별 답안 대조 드릴다운) ──────────────────

/** 문항 1개의 학생 답안 직렬화 — 수동확정(manualStatus)이 판정 정본 */
export interface StudyTaskResponseItem {
  questionId: string;
  orderNum: number;
  input: StudentInput | null;
  /** null = 미입력 또는 판정 없음 */
  status: "CORRECT" | "WRONG" | "PARTIAL" | "NEEDS_REVIEW" | null;
  earnedPoints: number | null;
}

/** 태스크에 저장된 responses(SubmissionResponse[] 동형)를 대조용으로 직렬화 */
export async function getStudyTaskResponses(
  taskId: string,
): Promise<StudyActionResult<StudyTaskResponseItem[]>> {
  try {
    const staff = await requireStaffAuth();
    const task = await prisma.studyAssignmentTask.findFirst({
      where: { id: taskId, academyId: staff.academyId },
      select: { responses: true },
    });
    if (!task) return { success: false, error: "태스크를 찾을 수 없습니다." };

    const raw = Array.isArray(task.responses) ? task.responses : [];
    const items: StudyTaskResponseItem[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const r = entry as unknown as Partial<SubmissionResponse>;
      if (typeof r.questionId !== "string") continue;
      items.push({
        questionId: r.questionId,
        orderNum: typeof r.orderNum === "number" ? r.orderNum : items.length + 1,
        input: r.input ?? null,
        status: r.manualStatus ?? r.result?.status ?? null,
        earnedPoints:
          typeof r.manualEarnedPoints === "number"
            ? r.manualEarnedPoints
            : (r.result?.earnedPoints ?? null),
      });
    }
    items.sort((a, b) => a.orderNum - b.orderNum);
    return { success: true, data: items };
  } catch (error) {
    return { success: false, error: toErrorMessage(error, "학생 답안 조회 중 오류가 발생했습니다.") };
  }
}
