"use server";

// ============================================================================
// 학습지 스터디 모드 — 디렉터면 학습 현황 서버액션
//
// getWorksheetStudyOverview: WORKSHEET 과제의 학생별 스터디 상태
// (worksheet_study_states)와 문항 로그(worksheet_study_item_logs)를 반 단위로
// 집계한다. in-progress 부분 진행(answered·total·firstCorrect·firstTotal·lastAt
// — 파이프 v2 저장분)과 학생별 마지막 활동 시각도 매트릭스용으로 내린다.
// 스테이지 평균 점수는 상태 캐시(stageStates.score)에서, 취약점
// (문장·단어·어법 코드)은 첫 시도(attempt=1) 로그에서 계산한다. 정오 판정은
// grade.ts §5 규칙과 동일 — selfGrade "O"=정답, "D"/"X"=오답, 미채점
// (read/flash) 로그는 제외. academyId 스코프 필수(soft-ref 교차검증 포함).
// 계약: docs/worksheet-study-spec.md §10.
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isoOf, toErrorMessage, type StudyActionResult } from "./_shared";

/** 매트릭스 셀 — stageStates 1건. in-progress 필드는 파이프 v2(progress)가 저장 */
export interface StudyOverviewStageCell {
  status: string;
  /** 첫 시도 정답률(0~100) — done 스테이지만 */
  score?: number;
  /** in-progress 부분 진행 — 푼 문항 수 / 전체 문항 수 */
  answered?: number;
  total?: number;
  /** in-progress 첫 시도 정답 수 / 첫 시도 판정 수 */
  firstCorrect?: number;
  firstTotal?: number;
  /** 이 스테이지의 마지막 활동 시각(ISO) */
  lastAt?: string;
}

export interface StudyOverviewStudentRow {
  taskId: string;
  studentId: string;
  studentName: string;
  /** 필수 채점 스테이지 첫 시도 정답률 가중 평균 — 채점 완료 전 null */
  masteryPct: number | null;
  totalTimeMs: number;
  /** 필수 스테이지 전부 완료 시각 — 미완료면 null */
  completedAt: string | null;
  /** 마지막 활동 시각(ISO) — 전 스테이지 lastAt 의 max, 없으면 state.updatedAt */
  lastActivityAt: string;
  /** key = StudyStageId */
  stages: Record<string, StudyOverviewStageCell>;
}

export interface StudyOverviewAggregates {
  /** key = StudyStageId, 값 = 완주 학생들의 score 평균(0~100 반올림) */
  stageAvgScore: Record<string, number>;
  /** 오답률(%) 내림차순 상위 5 — 오답 0건 문장은 제외 */
  worstSentences: { sentenceNo: number; wrongRate: number; attempts: number }[];
  /** 오답 횟수 내림차순 상위 10 — 오답 0건 단어는 제외 */
  worstWords: { word: string; wrongCount: number }[];
  /** 어법 포인트 코드(a–m)별 오답률(%) 내림차순 — 출제된 코드 전부 */
  grammarWrongRates: { code: string; wrongRate: number; attempts: number }[];
}

/** 학생 취약 단어 드릴다운 — 단어 1건의 발생 이력 (원장면·시간순 최근) */
export interface StudentWeakWordOccurrence {
  worksheetTitle: string;
  at: string; // ISO
  correct: boolean;
  response: string | null;
  attempt: number;
}

export interface StudentWeakWordRow {
  word: string;
  meaning: string | null;
  wrongCount: number;
  totalCount: number;
  lastWrongAt: string; // ISO
  recovered: boolean;
  /** 최근순, 최대 20건 */
  occurrences: StudentWeakWordOccurrence[];
}

interface WrongAgg {
  wrong: number;
  total: number;
}

/**
 * 첫 시도 로그의 오답 여부 — spec §5: selfGrade O=정답, D/X=오답.
 * correct·selfGrade 둘 다 없는 로그(read/flash 완료 기록)는 집계 제외(null).
 */
function judgeWrong(log: { correct: boolean | null; selfGrade: string | null }): boolean | null {
  if (log.correct === true) return false;
  if (log.correct === false) return true;
  if (log.selfGrade === "O") return false;
  if (log.selfGrade === "D" || log.selfGrade === "X") return true;
  return null;
}

function bump<K>(map: Map<K, WrongAgg>, key: K, wrong: boolean): void {
  const agg = map.get(key) ?? { wrong: 0, total: 0 };
  agg.total += 1;
  if (wrong) agg.wrong += 1;
  map.set(key, agg);
}

/** 오답률 % (0~100 반올림) */
function wrongPct(agg: WrongAgg): number {
  return agg.total > 0 ? Math.round((agg.wrong / agg.total) * 100) : 0;
}

/** 유한 숫자만 통과 — Json 방어 파스용 */
function finiteOf(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** stageStates Json 방어 파스 — 손상 항목은 조용히 건너뛴다 */
function parseStageStates(raw: unknown): Record<string, StudyOverviewStageCell> {
  const out: Record<string, StudyOverviewStageCell> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [stageId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    const status =
      v.status === "in-progress" || v.status === "done" ? v.status : "todo";
    const cell: StudyOverviewStageCell = { status };
    const score = finiteOf(v.score);
    if (score !== undefined) cell.score = score;
    const answered = finiteOf(v.answered);
    if (answered !== undefined) cell.answered = answered;
    const total = finiteOf(v.total);
    if (total !== undefined) cell.total = total;
    const firstCorrect = finiteOf(v.firstCorrect);
    if (firstCorrect !== undefined) cell.firstCorrect = firstCorrect;
    const firstTotal = finiteOf(v.firstTotal);
    if (firstTotal !== undefined) cell.firstTotal = firstTotal;
    if (typeof v.lastAt === "string" && !Number.isNaN(Date.parse(v.lastAt))) {
      cell.lastAt = v.lastAt;
    }
    out[stageId] = cell;
  }
  return out;
}

export async function getWorksheetStudyOverview(
  assignmentId: string,
): Promise<
  StudyActionResult<{ students: StudyOverviewStudentRow[]; aggregates: StudyOverviewAggregates }>
> {
  try {
    const staff = await requireStaffAuth();
    const assignment = await prisma.studyAssignment.findFirst({
      where: { id: assignmentId, academyId: staff.academyId },
      select: { id: true, kind: true },
    });
    if (!assignment) return { success: false, error: "과제를 찾을 수 없습니다." };
    if (assignment.kind !== "WORKSHEET") {
      return { success: false, error: "학습 현황은 학습지 과제에서만 제공합니다." };
    }

    const states = await prisma.worksheetStudyState.findMany({
      where: { academyId: staff.academyId, assignmentId: assignment.id },
      select: {
        id: true,
        taskId: true,
        studentId: true,
        stageStates: true,
        masteryPct: true,
        totalTimeMs: true,
        completedAt: true,
        updatedAt: true,
      },
    });

    if (states.length === 0) {
      return {
        success: true,
        data: {
          students: [],
          aggregates: {
            stageAvgScore: {},
            worstSentences: [],
            worstWords: [],
            grammarWrongRates: [],
          },
        },
      };
    }

    // 학생 이름 조인 — studentId 는 FK 없는 soft-ref 라 academyId 로 교차검증
    // (getStudyAssignmentDetail 미러). 스코프 밖은 "(삭제된 학생)" 폴백.
    const studentRows = await prisma.student.findMany({
      where: { id: { in: states.map((s) => s.studentId) }, academyId: staff.academyId },
      select: { id: true, name: true },
    });
    const nameById = new Map(studentRows.map((s) => [s.id, s.name]));

    // 학생 행 + 스테이지 평균(상태 캐시 기반 — 로그 재집계 불필요)
    const scoreSums = new Map<string, { sum: number; n: number }>();
    const students: StudyOverviewStudentRow[] = states.map((st) => {
      const stages = parseStageStates(st.stageStates);
      // 마지막 활동 = 전 스테이지 lastAt 의 max — 없으면 state.updatedAt 폴백
      let lastActivityMs: number | null = null;
      for (const [stageId, s] of Object.entries(stages)) {
        if (typeof s.score === "number") {
          const acc = scoreSums.get(stageId) ?? { sum: 0, n: 0 };
          acc.sum += s.score;
          acc.n += 1;
          scoreSums.set(stageId, acc);
        }
        if (s.lastAt) {
          const t = Date.parse(s.lastAt);
          if (!Number.isNaN(t) && (lastActivityMs === null || t > lastActivityMs)) {
            lastActivityMs = t;
          }
        }
      }
      return {
        taskId: st.taskId,
        studentId: st.studentId,
        studentName: nameById.get(st.studentId) ?? "(삭제된 학생)",
        masteryPct: st.masteryPct,
        totalTimeMs: st.totalTimeMs,
        completedAt: isoOf(st.completedAt),
        lastActivityAt:
          lastActivityMs !== null
            ? new Date(lastActivityMs).toISOString()
            : st.updatedAt.toISOString(),
        stages,
      };
    });
    students.sort((a, b) => a.studentName.localeCompare(b.studentName, "ko"));

    const stageAvgScore: Record<string, number> = {};
    for (const [stageId, acc] of scoreSums) {
      stageAvgScore[stageId] = Math.round(acc.sum / acc.n);
    }

    // 취약점 집계 — 첫 시도(attempt=1)만. 정오 판정에 selfGrade 규칙이 개입하는
    // 조건부 카운트라 Prisma groupBy 로 표현되지 않아, select 를 최소 필드로
    // 좁힌 findMany 후 JS 집계한다(학생당 로그 ≤ plan 200 아이템 — 과대 없음).
    const logs = await prisma.worksheetStudyItemLog.findMany({
      where: {
        academyId: staff.academyId,
        stateId: { in: states.map((s) => s.id) },
        attempt: 1,
      },
      select: {
        sentenceNo: true,
        wordKey: true,
        grammarCode: true,
        correct: true,
        selfGrade: true,
      },
    });

    const bySentence = new Map<number, WrongAgg>();
    const byWord = new Map<string, WrongAgg>();
    const byGrammar = new Map<string, WrongAgg>();
    for (const log of logs) {
      const wrong = judgeWrong(log);
      if (wrong === null) continue;
      if (typeof log.sentenceNo === "number") bump(bySentence, log.sentenceNo, wrong);
      if (log.wordKey) bump(byWord, log.wordKey, wrong);
      if (log.grammarCode) bump(byGrammar, log.grammarCode, wrong);
    }

    const worstSentences = [...bySentence.entries()]
      .filter(([, a]) => a.wrong > 0)
      .map(([sentenceNo, a]) => ({
        sentenceNo,
        wrongRate: wrongPct(a),
        attempts: a.total,
      }))
      .sort(
        (x, y) =>
          y.wrongRate - x.wrongRate || y.attempts - x.attempts || x.sentenceNo - y.sentenceNo,
      )
      .slice(0, 5);

    const worstWords = [...byWord.entries()]
      .filter(([, a]) => a.wrong > 0)
      .map(([word, a]) => ({ word, wrongCount: a.wrong }))
      .sort((x, y) => y.wrongCount - x.wrongCount || x.word.localeCompare(y.word))
      .slice(0, 10);

    const grammarWrongRates = [...byGrammar.entries()]
      .map(([code, a]) => ({ code, wrongRate: wrongPct(a), attempts: a.total }))
      .sort(
        (x, y) =>
          y.wrongRate - x.wrongRate || y.attempts - x.attempts || x.code.localeCompare(y.code),
      );

    return {
      success: true,
      data: {
        students,
        aggregates: { stageAvgScore, worstSentences, worstWords, grammarWrongRates },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "학습 현황 조회 중 오류가 발생했습니다."),
    };
  }
}

// ── 학생별 취약 단어 드릴다운 ─────────────────────────────────────────────────

/** wordMeaning·정오·attempt 를 담은 로그 원자 — 단어별 집계 입력 */
interface WordLog {
  wordKey: string;
  wordMeaning: string | null;
  correct: boolean | null;
  selfGrade: string | null;
  attempt: number;
  response: string | null;
  createdAt: Date;
  assignmentId: string;
}

/**
 * 로그 목록 → 단어별 취약 이력 집계.
 * - 오답 = attempt=1 이고 judgeWrong=true.
 * - totalCount = attempt=1 시도 수. wrongCount = 그 중 오답 수.
 * - recovered = 그 단어의 모든 로그 중 가장 최근이 정답.
 * - meaning = 가장 최근 non-null wordMeaning.
 * - occurrences = 전 시도 최근순 ≤20 (학습지 제목·정오·학생답·시도).
 */
function aggregateWeakWords(
  logs: WordLog[],
  titleById: Map<string, string>,
): StudentWeakWordRow[] {
  const byWord = new Map<string, WordLog[]>();
  for (const log of logs) {
    const arr = byWord.get(log.wordKey) ?? [];
    arr.push(log);
    byWord.set(log.wordKey, arr);
  }

  const rows: StudentWeakWordRow[] = [];
  for (const [word, wordLogs] of byWord) {
    // 최근순 정렬(내림차순) — occurrences·recovered·meaning 판정 공용
    const sorted = [...wordLogs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    let wrongCount = 0;
    let totalCount = 0;
    let lastWrong: Date | null = null;
    for (const log of sorted) {
      if (log.attempt !== 1) continue;
      const wrong = judgeWrong(log);
      if (wrong === null) continue;
      totalCount += 1;
      if (wrong) {
        wrongCount += 1;
        if (!lastWrong) lastWrong = log.createdAt; // sorted desc → 첫 오답이 가장 최근
      }
    }
    if (wrongCount === 0) continue; // 오답 이력 없는 단어는 제외

    // 가장 최근 판정 로그의 정오(무판정 로그는 건너뜀)
    let recovered = false;
    for (const log of sorted) {
      const wrong = judgeWrong(log);
      if (wrong === null) continue;
      recovered = !wrong;
      break;
    }

    const meaning = sorted.find((l) => l.wordMeaning && l.wordMeaning.trim())?.wordMeaning ?? null;

    // 무판정 로그(카드 열람 등 correct·selfGrade 둘 다 없음)는 이력에서 제외 —
    // null 을 오답(✗)으로 강등 표시하면 안 된다(spec §5 판정 제외 규칙)
    const occurrences: StudentWeakWordOccurrence[] = sorted
      .filter((log) => judgeWrong(log) !== null)
      .slice(0, 20)
      .map((log) => ({
        worksheetTitle: titleById.get(log.assignmentId) ?? "(삭제된 과제)",
        at: log.createdAt.toISOString(),
        correct: judgeWrong(log) === false,
        response: log.response,
        attempt: log.attempt,
      }));

    rows.push({
      word,
      meaning,
      wrongCount,
      totalCount,
      lastWrongAt: (lastWrong ?? sorted[0].createdAt).toISOString(),
      recovered,
      occurrences,
    });
  }

  // 최근 오답순(내림차순) → 동률은 오답 횟수 → 알파벳
  rows.sort(
    (a, b) =>
      new Date(b.lastWrongAt).getTime() - new Date(a.lastWrongAt).getTime() ||
      b.wrongCount - a.wrongCount ||
      a.word.localeCompare(b.word),
  );
  return rows;
}

/**
 * 학생 1명의 취약 단어 — 이 과제만(assignmentId) 또는 전체 누적.
 * academyId 스코프 필수(state·log·assignment 3중 교차검증).
 */
export async function getStudentWeakWords(input: {
  studentId: string;
  assignmentId?: string;
}): Promise<StudyActionResult<{ entries: StudentWeakWordRow[] }>> {
  try {
    const staff = await requireStaffAuth();

    // 대상 state 집합 — academyId·studentId(·assignmentId) 스코프
    const states = await prisma.worksheetStudyState.findMany({
      where: {
        academyId: staff.academyId,
        studentId: input.studentId,
        ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
      },
      select: { id: true, assignmentId: true },
    });
    if (states.length === 0) return { success: true, data: { entries: [] } };

    const assignmentIdByState = new Map(states.map((s) => [s.id, s.assignmentId]));

    // 과제 제목 조인 — academyId 스코프
    const assignmentIds = [...new Set(states.map((s) => s.assignmentId))];
    const assignments = await prisma.studyAssignment.findMany({
      where: { id: { in: assignmentIds }, academyId: staff.academyId },
      select: { id: true, title: true },
    });
    const titleById = new Map(assignments.map((a) => [a.id, a.title]));

    // wordKey 있는 로그 전량(어휘 문항) — 단어별 이력 집계
    const raw = await prisma.worksheetStudyItemLog.findMany({
      where: {
        academyId: staff.academyId,
        stateId: { in: states.map((s) => s.id) },
        wordKey: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        stateId: true,
        wordKey: true,
        wordMeaning: true,
        correct: true,
        selfGrade: true,
        attempt: true,
        response: true,
        createdAt: true,
      },
    });

    const logs: WordLog[] = raw.map((l) => ({
      wordKey: l.wordKey as string,
      wordMeaning: l.wordMeaning,
      correct: l.correct,
      selfGrade: l.selfGrade,
      attempt: l.attempt,
      response: l.response,
      createdAt: l.createdAt,
      assignmentId: assignmentIdByState.get(l.stateId) ?? "",
    }));

    return { success: true, data: { entries: aggregateWeakWords(logs, titleById) } };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "취약 단어 조회 중 오류가 발생했습니다."),
    };
  }
}
