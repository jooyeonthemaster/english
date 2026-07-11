// ============================================================================
// 통합 학습 과제 — 학생 1명의 태스크 유니온 로더 (서버 전용)
//
// 디렉터(학생 상세 과제 탭)와 학생 앱(/api/g/tasks)이 공유하는 조립 정본.
// 유니온 = StudyAssignmentTask(과제 소속) + 고아 배포(DIRECT):
//   - 과제 브리지 없이 직접 배포된 ExamSubmission(구 태블릿 배포 모달 경로)
//   - 과제 브리지 없이 직접 생성된 GrammarDrillAssignment(구 학습 배정 경로)
// 브리지 id 로 dedupe 하므로 이중 표시가 없다. 라이브 상태 규칙은 ./status.ts.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { summarizeScore } from "@/actions/exams/_assignments-shared";
import { parseOrderSnapshot } from "@/lib/exam-scoring/taking-payload";
import type {
  GrammarAssignmentPayload,
  StudyAssignmentKind,
  StudyTaskStatus,
} from "./types";
import { examPayloadDurationMin, isStudyAssignmentKind } from "./types";
import { resolveExamLiveStatus, resolveGrammarLiveStatus } from "./status";

export interface UnifiedTaskRecord {
  /** 실제 태스크 id 또는 합성 id("sub:{submissionId}" | "ga:{assignmentId}") */
  taskId: string;
  source: "ASSIGNMENT" | "DIRECT";
  assignmentId: string | null;
  /** 소속 과제 상태 — DIRECT 는 "ACTIVE" 고정 */
  assignmentStatus: "ACTIVE" | "CLOSED";
  kind: StudyAssignmentKind;
  title: string;
  instructions: string | null;
  availableFrom: Date | null;
  dueAt: Date | null;
  status: StudyTaskStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  assignedAt: Date;
  refId: string | null;
  payload: unknown;
  // EXAM 브리지
  examSubmissionId: string | null;
  examAccessToken: string | null;
  examAccessEnabled: boolean;
  examShowResults: boolean;
  /** EXAM: 응시 모드 — TABLET(웹 응시) | OMR(답안만 입력) */
  examMode: "TABLET" | "OMR" | null;
  /** EXAM: orderSnapshot 문항 수 — 스냅샷 미기록이면 null */
  examQuestionCount: number | null;
  /** EXAM: 제한시간(분) — exam.duration, 없으면 null */
  examDuration: number | null;
  /** EXAM: 채점 확정(GRADED) 여부 — showResults 와 함께 결과 화면(/g/x) 게이트 */
  examGraded: boolean;
  // GRAMMAR 브리지
  grammarAssignmentId: string | null;
  /** {done,total} — GRAMMAR 진행 캐시 */
  progress: { done: number; total: number } | null;
  /** 점수 캐시 — EXAM(GRADED)·QUESTIONS(제출 후) */
  score: {
    earned: number | null;
    max: number | null;
    correct: number;
    total: number;
    needsReview: number;
  } | null;
}

function questionsResultScore(result: unknown): UnifiedTaskRecord["score"] {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    earned: num(r.score),
    max: num(r.maxScore),
    correct: num(r.correct) ?? 0,
    total: num(r.total) ?? 0,
    needsReview: num(r.needsReview) ?? 0,
  };
}

/** QUESTIONS result.percent 방어 파스 — 유한수만 인정(소수 1자리 반올림) */
function questionsResultPercent(result: unknown): number | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const p = (result as { percent?: unknown }).percent;
  return typeof p === "number" && Number.isFinite(p) ? Math.round(p * 10) / 10 : null;
}

function grammarPayloadCount(payload: unknown): number {
  const spec = (payload ?? {}) as Partial<GrammarAssignmentPayload>;
  return typeof spec.count === "number" && spec.count > 0 ? spec.count : 0;
}

function normalizeExamMode(mode: string | null): "TABLET" | "OMR" | null {
  return mode === "TABLET" || mode === "OMR" ? mode : null;
}

/** orderSnapshot 문항 수 — 파손/미기록은 null(표시 억제) */
function examSnapshotCount(orderSnapshot: unknown): number | null {
  const count = parseOrderSnapshot(orderSnapshot).length;
  return count > 0 ? count : null;
}

/** GrammarDrillAssignment.resultSummary({total,correct}) → 정답 수 캐시
 *  (디렉터면 loadTaskLiveMap 의 scoreText 파싱 선례와 동일 계약) */
function grammarResultScore(resultSummary: unknown): UnifiedTaskRecord["score"] {
  if (!resultSummary || typeof resultSummary !== "object" || Array.isArray(resultSummary)) {
    return null;
  }
  const rs = resultSummary as { total?: unknown; correct?: unknown };
  if (typeof rs.total !== "number" || rs.total <= 0) return null;
  return {
    earned: null,
    max: null,
    correct: typeof rs.correct === "number" ? rs.correct : 0,
    total: rs.total,
    needsReview: 0,
  };
}

/** 학생 1명의 통합 태스크 전부 — 미정렬 원본이 아니라 기본 정렬(미완료 우선) */
export async function loadStudentUnifiedTasks(
  studentId: string,
  academyId: string,
): Promise<UnifiedTaskRecord[]> {
  const tasks = await prisma.studyAssignmentTask.findMany({
    where: { studentId, academyId },
    orderBy: { createdAt: "desc" },
  });

  const assignmentIds = [...new Set(tasks.map((t) => t.assignmentId))];
  const assignments = assignmentIds.length
    ? await prisma.studyAssignment.findMany({
        where: { id: { in: assignmentIds }, academyId },
      })
    : [];
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));

  // ── EXAM 브리지 + 고아 ExamSubmission 을 한 번에 로드 ──
  const bridgedSubIds = tasks
    .map((t) => t.examSubmissionId)
    .filter((id): id is string => !!id);
  const submissions = await prisma.examSubmission.findMany({
    where: {
      studentId,
      exam: { academyId },
      OR: [
        { id: { in: bridgedSubIds.length ? bridgedSubIds : ["__none__"] } },
        { assignedAt: { not: null } },
        { status: "ASSIGNED" },
      ],
    },
    select: {
      id: true,
      status: true,
      mode: true,
      accessToken: true,
      accessEnabled: true,
      scoreSummary: true,
      orderSnapshot: true,
      assignedAt: true,
      startedAt: true,
      submittedAt: true,
      gradedAt: true,
      exam: {
        select: { id: true, title: true, duration: true, showResults: true, subject: true },
      },
    },
  });
  const submissionById = new Map(submissions.map((s) => [s.id, s]));

  // ── GRAMMAR 브리지 + 고아 GrammarDrillAssignment ──
  const bridgedGaIds = tasks
    .map((t) => t.grammarAssignmentId)
    .filter((id): id is string => !!id);
  const grammarRows = await prisma.grammarDrillAssignment.findMany({
    where: { studentId, academyId },
    orderBy: { createdAt: "desc" },
  });
  const grammarById = new Map(grammarRows.map((g) => [g.id, g]));

  // GRAMMAR 진행 — 배정 귀속 시도 수(assignmentId 별)
  const gaIdsAll = [...new Set([...bridgedGaIds, ...grammarRows.map((g) => g.id)])];
  const attemptCounts = gaIdsAll.length
    ? await prisma.grammarDrillAttempt.groupBy({
        by: ["assignmentId"],
        where: { studentId, assignmentId: { in: gaIdsAll } },
        _count: { _all: true },
      })
    : [];
  const attemptCountByGa = new Map(
    attemptCounts.map((row) => [row.assignmentId ?? "", row._count._all]),
  );

  const records: UnifiedTaskRecord[] = [];

  for (const task of tasks) {
    const assignment = assignmentById.get(task.assignmentId);
    if (!assignment) continue; // 고아 태스크(과제 삭제 경합) — 표시 생략
    if (assignment.status === "ARCHIVED") continue;
    const kind = isStudyAssignmentKind(assignment.kind) ? assignment.kind : null;
    if (!kind) continue;

    const base: UnifiedTaskRecord = {
      taskId: task.id,
      source: "ASSIGNMENT",
      assignmentId: assignment.id,
      assignmentStatus: assignment.status === "CLOSED" ? "CLOSED" : "ACTIVE",
      kind,
      title: assignment.title,
      instructions: assignment.instructions,
      availableFrom: assignment.availableFrom,
      dueAt: assignment.dueAt,
      status: (task.status as StudyTaskStatus) ?? "ASSIGNED",
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      assignedAt: task.createdAt,
      refId: assignment.refId,
      payload: assignment.payload,
      examSubmissionId: task.examSubmissionId,
      examAccessToken: null,
      examAccessEnabled: false,
      examShowResults: false,
      examMode: null,
      examQuestionCount: null,
      examDuration: null,
      examGraded: false,
      grammarAssignmentId: task.grammarAssignmentId,
      progress: null,
      score: null,
    };

    if (kind === "EXAM" && task.examSubmissionId) {
      const sub = submissionById.get(task.examSubmissionId);
      if (sub) {
        base.status = resolveExamLiveStatus(sub.status);
        base.examAccessToken = sub.accessToken;
        base.examAccessEnabled = sub.accessEnabled;
        base.examShowResults = sub.exam.showResults;
        base.examMode = normalizeExamMode(sub.mode);
        base.examQuestionCount = examSnapshotCount(sub.orderSnapshot);
        // 과제 레벨 제한시간 오버라이드(payload.durationMin)가 시험지 duration 에 우선.
        // DIRECT 배포(과제 없음)는 아래 고아 분기에서 시험지 duration 그대로.
        base.examDuration =
          examPayloadDurationMin(assignment.payload) ?? sub.exam.duration ?? null;
        base.examGraded = sub.status === "GRADED";
        base.startedAt = base.status === "ASSIGNED" ? null : sub.startedAt;
        base.completedAt = sub.submittedAt ?? sub.gradedAt ?? null;
        const brief = summarizeScore(sub.scoreSummary);
        if (sub.status === "GRADED" && brief) {
          base.score = {
            earned: brief.totalScore,
            max: brief.maxScore,
            correct: brief.correctCount,
            total:
              brief.correctCount + brief.wrongCount + brief.partialCount + brief.unknownCount,
            needsReview: brief.unknownCount,
          };
        }
      }
    } else if (kind === "GRAMMAR" && task.grammarAssignmentId) {
      const ga = grammarById.get(task.grammarAssignmentId);
      if (ga) {
        base.status = resolveGrammarLiveStatus(ga.status);
        base.startedAt = ga.startedAt;
        base.completedAt = ga.completedAt;
        const total = grammarPayloadCount(ga.spec);
        const done = Math.min(attemptCountByGa.get(ga.id) ?? 0, total || Infinity);
        base.progress = { done: Number.isFinite(done) ? done : 0, total };
        // DONE 카드 정답 수 — resultSummary({total,correct}) 파싱(loadTaskLiveMap 선례)
        if (ga.status === "DONE") base.score = grammarResultScore(ga.resultSummary);
      }
    } else if (kind === "QUESTIONS") {
      base.score = questionsResultScore(task.result);
      const payload = (assignment.payload ?? {}) as { questionIds?: string[] };
      const total = Array.isArray(payload.questionIds) ? payload.questionIds.length : 0;
      if (base.status !== "DONE") base.progress = { done: 0, total };
    }

    records.push(base);
  }

  // ── 고아 배포(DIRECT) — 브리지되지 않은 배포를 태스크로 승격 표시 ──
  const bridgedSubSet = new Set(bridgedSubIds);
  for (const sub of submissions) {
    if (bridgedSubSet.has(sub.id)) continue;
    if (sub.exam.subject === "KOREAN") continue;
    if (!sub.assignedAt && sub.status !== "ASSIGNED") continue; // 레거시 exam-taking 행 제외
    const status = resolveExamLiveStatus(sub.status);
    const brief = summarizeScore(sub.scoreSummary);
    records.push({
      taskId: `sub:${sub.id}`,
      source: "DIRECT",
      assignmentId: null,
      assignmentStatus: "ACTIVE",
      kind: "EXAM",
      title: sub.exam.title,
      instructions: null,
      availableFrom: null,
      dueAt: null,
      status,
      startedAt: status === "ASSIGNED" ? null : sub.startedAt,
      completedAt: sub.submittedAt ?? sub.gradedAt ?? null,
      assignedAt: sub.assignedAt ?? sub.startedAt,
      refId: sub.exam.id,
      payload: {},
      examSubmissionId: sub.id,
      examAccessToken: sub.accessToken,
      examAccessEnabled: sub.accessEnabled,
      examShowResults: sub.exam.showResults,
      examMode: normalizeExamMode(sub.mode),
      examQuestionCount: examSnapshotCount(sub.orderSnapshot),
      examDuration: sub.exam.duration ?? null,
      examGraded: sub.status === "GRADED",
      grammarAssignmentId: null,
      progress: null,
      score:
        sub.status === "GRADED" && brief
          ? {
              earned: brief.totalScore,
              max: brief.maxScore,
              correct: brief.correctCount,
              total:
                brief.correctCount +
                brief.wrongCount +
                brief.partialCount +
                brief.unknownCount,
              needsReview: brief.unknownCount,
            }
          : null,
    });
  }

  const bridgedGaSet = new Set(bridgedGaIds);
  for (const ga of grammarRows) {
    if (bridgedGaSet.has(ga.id)) continue;
    const total = grammarPayloadCount(ga.spec);
    const done = Math.min(attemptCountByGa.get(ga.id) ?? 0, total || Infinity);
    records.push({
      taskId: `ga:${ga.id}`,
      source: "DIRECT",
      assignmentId: null,
      assignmentStatus: "ACTIVE",
      kind: "GRAMMAR",
      title: ga.title,
      instructions: ga.note,
      availableFrom: null,
      dueAt: null,
      status: resolveGrammarLiveStatus(ga.status),
      startedAt: ga.startedAt,
      completedAt: ga.completedAt,
      assignedAt: ga.createdAt,
      refId: null,
      payload: ga.spec,
      examSubmissionId: null,
      examAccessToken: null,
      examAccessEnabled: false,
      examShowResults: false,
      examMode: null,
      examQuestionCount: null,
      examDuration: null,
      examGraded: false,
      grammarAssignmentId: ga.id,
      progress: { done: Number.isFinite(done) ? done : 0, total },
      // DONE 카드 정답 수 — 브리지(ASSIGNMENT) 분기와 동일 계약
      score: ga.status === "DONE" ? grammarResultScore(ga.resultSummary) : null,
    });
  }

  // 기본 정렬 — 미완료(마감 임박) 우선, 완료는 뒤로.
  const weight = (s: StudyTaskStatus) => (s === "DONE" ? 1 : 0);
  records.sort((a, b) => {
    const w = weight(a.status) - weight(b.status);
    if (w !== 0) return w;
    const ad = a.dueAt?.getTime() ?? Infinity;
    const bd = b.dueAt?.getTime() ?? Infinity;
    if (ad !== bd) return ad - bd;
    return b.assignedAt.getTime() - a.assignedAt.getTime();
  });

  return records;
}

// ── 과제 스코프 라이브 상태 배치 계산 (디렉터 목록/상세용) ────────────────────

export interface TaskLiveEntry {
  liveStatus: StudyTaskStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  scoreText: string | null;
  /** 백분위 점수(0~100, 소수 1자리) — EXAM=총점/만점, GRAMMAR=정답/문항, QUESTIONS=result.percent */
  scorePercent: number | null;
  tokenPath: string | null;
}

interface MinimalTaskRow {
  id: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  examSubmissionId: string | null;
  grammarAssignmentId: string | null;
  result: unknown;
}

/**
 * 여러 태스크의 라이브 상태를 브리지 2쿼리로 배치 계산.
 * EXAM→ExamSubmission, GRAMMAR→GrammarDrillAssignment 조인, 나머지는 행 자체.
 */
export async function loadTaskLiveMap(
  academyId: string,
  tasks: MinimalTaskRow[],
): Promise<Map<string, TaskLiveEntry>> {
  const subIds = tasks
    .map((t) => t.examSubmissionId)
    .filter((id): id is string => !!id);
  const gaIds = tasks
    .map((t) => t.grammarAssignmentId)
    .filter((id): id is string => !!id);

  const [subs, gas] = await Promise.all([
    subIds.length
      ? prisma.examSubmission.findMany({
          where: { id: { in: subIds }, exam: { academyId } },
          select: {
            id: true,
            status: true,
            accessToken: true,
            accessEnabled: true,
            startedAt: true,
            submittedAt: true,
            gradedAt: true,
            scoreSummary: true,
          },
        })
      : Promise.resolve([]),
    gaIds.length
      ? prisma.grammarDrillAssignment.findMany({
          where: { id: { in: gaIds }, academyId },
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            resultSummary: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const subById = new Map(subs.map((s) => [s.id, s]));
  const gaById = new Map(gas.map((g) => [g.id, g]));

  const map = new Map<string, TaskLiveEntry>();
  for (const t of tasks) {
    let live: StudyTaskStatus = (t.status as StudyTaskStatus) ?? "ASSIGNED";
    let startedAt = t.startedAt;
    let completedAt = t.completedAt;
    let scoreText: string | null = null;
    let scorePercent: number | null = null;
    let tokenPath: string | null = null;

    const sub = t.examSubmissionId ? subById.get(t.examSubmissionId) : undefined;
    if (sub) {
      live = resolveExamLiveStatus(sub.status);
      startedAt = live === "ASSIGNED" ? null : sub.startedAt;
      completedAt = sub.submittedAt ?? sub.gradedAt ?? null;
      tokenPath = sub.accessToken && sub.accessEnabled ? `/t/${sub.accessToken}` : null;
      const brief = summarizeScore(sub.scoreSummary);
      if (sub.status === "GRADED" && brief && brief.totalScore !== null) {
        scoreText = `${brief.totalScore}점${brief.maxScore !== null ? ` / ${brief.maxScore}점` : ""}`;
        if (brief.maxScore !== null && brief.maxScore > 0) {
          scorePercent = Math.round((brief.totalScore / brief.maxScore) * 1000) / 10;
        }
      }
    }
    const ga = t.grammarAssignmentId ? gaById.get(t.grammarAssignmentId) : undefined;
    if (ga) {
      live = resolveGrammarLiveStatus(ga.status);
      startedAt = ga.startedAt;
      completedAt = ga.completedAt;
      const rs = (ga.resultSummary ?? null) as { total?: number; correct?: number } | null;
      if (ga.status === "DONE" && rs && typeof rs.total === "number") {
        scoreText = `${rs.correct ?? 0} / ${rs.total} 정답`;
        if (rs.total > 0) {
          scorePercent = Math.round(((rs.correct ?? 0) / rs.total) * 1000) / 10;
        }
      }
    }
    if (!sub && !ga) {
      const qScore = questionsResultScore(t.result);
      if (qScore && qScore.earned !== null) {
        scoreText = `${qScore.earned}점${qScore.max !== null ? ` / ${qScore.max}점` : ""}`;
      }
      scorePercent = questionsResultPercent(t.result);
    }
    map.set(t.id, { liveStatus: live, startedAt, completedAt, scoreText, scorePercent, tokenPath });
  }
  return map;
}
