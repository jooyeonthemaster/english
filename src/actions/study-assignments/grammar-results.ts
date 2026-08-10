"use server";

// ============================================================================
// 통합 학습 과제 — GRAMMAR "훈련 현황" 탭 서버액션 (디렉터면 전용)
//
// getGrammarAssignmentResults: GRAMMAR 과제 1건의 학생별 훈련 진행을 반 단위로
// 집계한다. 진행(푼 문항 n/m)은 task-union.ts 와 동일 계약 — 배정 귀속
// GrammarDrillAttempt 수(spec.count 캡). 정답률·최근 활동도 같은 시도 로그에서
// 계산하고, 시도가 없는 완료(레거시)만 resultSummary({total,correct})로 보강.
// academyId 스코프 필수(soft-ref 교차검증 포함). 규범: docs/director-console-spec.md §3.2.
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveGrammarLiveStatus } from "@/lib/study-assignments/status";
import type {
  GrammarAssignmentPayload,
  StudyTaskStatus,
} from "@/lib/study-assignments/types";
import { isoOf, toErrorMessage, type StudyActionResult } from "./_shared";

export interface GrammarResultsStudentRow {
  taskId: string;
  studentId: string;
  studentName: string;
  status: StudyTaskStatus;
  /** 푼 문항 수 — 배정 귀속 시도 수(total 캡, task-union 계약) */
  solved: number;
  /** 출제 문항 수 — GrammarDrillAssignment.spec.count (파손 시 0) */
  total: number;
  /** 정답률(0~100 반올림) — 시도(레거시 완료는 resultSummary)가 없으면 null */
  accuracyPct: number | null;
  /** 마지막 활동 시각(최근 시도·시작·완료 중 최신) — 기록 없으면 null */
  lastActivityAt: string | null;
  completedAt: string | null;
}

export interface GrammarResultsSummary {
  /** 배정 학생 수 */
  taskCount: number;
  /** 훈련을 시작한 학생 수(시도 1건 이상 또는 상태 진행/완료) */
  startedCount: number;
  doneCount: number;
  /** 평균 진행률(0~100 반올림, solved/total) — 집계 대상 없으면 null */
  avgProgressPct: number | null;
  /** 평균 정답률(0~100 반올림) — 정답률 산출 학생이 없으면 null */
  avgAccuracyPct: number | null;
}

export interface GrammarResultsData {
  students: GrammarResultsStudentRow[];
  summary: GrammarResultsSummary;
}

/** spec.count 방어 파스 — task-union.ts grammarPayloadCount 미러 */
function grammarSpecCount(spec: unknown): number {
  const payload = (spec ?? {}) as Partial<GrammarAssignmentPayload>;
  return typeof payload.count === "number" && payload.count > 0 ? payload.count : 0;
}

/** resultSummary({total,correct}) → 정답률(0~100) — 파손·total 0 은 null */
function resultSummaryAccuracy(resultSummary: unknown): number | null {
  if (!resultSummary || typeof resultSummary !== "object" || Array.isArray(resultSummary)) {
    return null;
  }
  const rs = resultSummary as { total?: unknown; correct?: unknown };
  if (typeof rs.total !== "number" || rs.total <= 0) return null;
  const correct = typeof rs.correct === "number" ? rs.correct : 0;
  return Math.round((correct / rs.total) * 100);
}

export async function getGrammarAssignmentResults(
  assignmentId: string,
): Promise<StudyActionResult<GrammarResultsData>> {
  try {
    const staff = await requireStaffAuth();
    const assignment = await prisma.studyAssignment.findFirst({
      where: { id: assignmentId, academyId: staff.academyId },
      select: { id: true, kind: true },
    });
    if (!assignment) return { success: false, error: "과제를 찾을 수 없습니다." };
    if (assignment.kind !== "GRAMMAR") {
      return { success: false, error: "훈련 현황은 어법 훈련 과제에서만 제공합니다." };
    }

    const tasks = await prisma.studyAssignmentTask.findMany({
      where: { assignmentId: assignment.id, academyId: staff.academyId },
      select: {
        id: true,
        studentId: true,
        status: true,
        grammarAssignmentId: true,
        completedAt: true,
      },
    });
    if (tasks.length === 0) {
      return {
        success: true,
        data: {
          students: [],
          summary: {
            taskCount: 0,
            startedCount: 0,
            doneCount: 0,
            avgProgressPct: null,
            avgAccuracyPct: null,
          },
        },
      };
    }

    const gaIds = tasks
      .map((t) => t.grammarAssignmentId)
      .filter((id): id is string => !!id);

    // GRAMMAR 브리지(GrammarDrillAssignment) + 배정 귀속 시도 집계 + 학생 이름을
    // 병렬 로드. GrammarDrill*·studentId 는 FK 없는 soft-ref 라 academyId 교차검증.
    const [gas, attemptAgg, lastAttempts, studentRows] = await Promise.all([
      gaIds.length
        ? prisma.grammarDrillAssignment.findMany({
            where: { id: { in: gaIds }, academyId: staff.academyId },
            select: {
              id: true,
              status: true,
              spec: true,
              resultSummary: true,
              startedAt: true,
              completedAt: true,
            },
          })
        : Promise.resolve([]),
      gaIds.length
        ? prisma.grammarDrillAttempt.groupBy({
            by: ["assignmentId", "correct", "studentId"],
            where: { academyId: staff.academyId, assignmentId: { in: gaIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      gaIds.length
        ? prisma.grammarDrillAttempt.groupBy({
            by: ["assignmentId", "studentId"],
            where: { academyId: staff.academyId, assignmentId: { in: gaIds } },
            _max: { createdAt: true },
          })
        : Promise.resolve([]),
      prisma.student.findMany({
        where: { id: { in: tasks.map((t) => t.studentId) }, academyId: staff.academyId },
        select: { id: true, name: true },
      }),
    ]);

    const gaById = new Map(gas.map((g) => [g.id, g]));
    const nameById = new Map(studentRows.map((s) => [s.id, s.name]));
    // 시도 행의 studentId 가 그 배정의 소유 학생과 일치할 때만 집계 — 기록 측이
    // assignmentId 를 소유 검증 없이 저장하므로 여기서 교차검증(오염 차단)
    const ownerByGa = new Map<string, string>();
    for (const t of tasks) {
      if (t.grammarAssignmentId) ownerByGa.set(t.grammarAssignmentId, t.studentId);
    }
    const attemptsByGa = new Map<string, { correct: number; wrong: number }>();
    for (const row of attemptAgg) {
      const key = row.assignmentId ?? "";
      if (ownerByGa.get(key) !== row.studentId) continue;
      const acc = attemptsByGa.get(key) ?? { correct: 0, wrong: 0 };
      if (row.correct) acc.correct += row._count._all;
      else acc.wrong += row._count._all;
      attemptsByGa.set(key, acc);
    }
    const lastAttemptByGa = new Map<string, Date | null>();
    for (const row of lastAttempts) {
      const key = row.assignmentId ?? "";
      if (ownerByGa.get(key) !== row.studentId) continue;
      const prevAt = lastAttemptByGa.get(key);
      const at = row._max.createdAt;
      if (!prevAt || (at && at > prevAt)) lastAttemptByGa.set(key, at);
    }

    const students: GrammarResultsStudentRow[] = tasks.map((t) => {
      const ga = t.grammarAssignmentId ? gaById.get(t.grammarAssignmentId) : undefined;
      const attempts = t.grammarAssignmentId
        ? attemptsByGa.get(t.grammarAssignmentId)
        : undefined;
      const attemptTotal = (attempts?.correct ?? 0) + (attempts?.wrong ?? 0);

      const status: StudyTaskStatus = ga
        ? resolveGrammarLiveStatus(ga.status)
        : ((t.status as StudyTaskStatus) ?? "ASSIGNED");
      const total = ga ? grammarSpecCount(ga.spec) : 0;
      const solvedRaw = Math.min(attemptTotal, total || Infinity);
      const solved = Number.isFinite(solvedRaw) ? solvedRaw : 0;

      // 정답률 — 시도 로그 우선(진행 중 라이브 값), 시도 0건 완료는 resultSummary 폴백
      let accuracyPct: number | null = null;
      if (attemptTotal > 0) {
        accuracyPct = Math.round(((attempts?.correct ?? 0) / attemptTotal) * 100);
      } else if (ga && ga.status === "DONE") {
        accuracyPct = resultSummaryAccuracy(ga.resultSummary);
      }

      // 최근 활동 — 마지막 시도·시작·완료 중 가장 최신
      const candidates = [
        t.grammarAssignmentId ? lastAttemptByGa.get(t.grammarAssignmentId) : null,
        ga?.startedAt,
        ga?.completedAt,
      ].filter((d): d is Date => d instanceof Date);
      const lastActivity =
        candidates.length > 0
          ? candidates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b))
          : null;

      return {
        taskId: t.id,
        studentId: t.studentId,
        studentName: nameById.get(t.studentId) ?? "(삭제된 학생)",
        status,
        solved,
        total,
        accuracyPct,
        lastActivityAt: isoOf(lastActivity),
        completedAt: isoOf(ga?.completedAt ?? t.completedAt),
      };
    });
    students.sort((a, b) => a.studentName.localeCompare(b.studentName, "ko"));

    let startedCount = 0;
    let doneCount = 0;
    let progressSum = 0;
    let progressN = 0;
    let accuracySum = 0;
    let accuracyN = 0;
    for (const s of students) {
      if (s.status !== "ASSIGNED" || s.solved > 0) startedCount += 1;
      if (s.status === "DONE") doneCount += 1;
      if (s.total > 0) {
        progressSum += Math.min(100, (s.solved / s.total) * 100);
        progressN += 1;
      }
      if (s.accuracyPct != null) {
        accuracySum += s.accuracyPct;
        accuracyN += 1;
      }
    }

    return {
      success: true,
      data: {
        students,
        summary: {
          taskCount: students.length,
          startedCount,
          doneCount,
          avgProgressPct: progressN > 0 ? Math.round(progressSum / progressN) : null,
          avgAccuracyPct: accuracyN > 0 ? Math.round(accuracySum / accuracyN) : null,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "훈련 현황 조회 중 오류가 발생했습니다."),
    };
  }
}
