"use server";

// ============================================================================
// 학생 단위 학습 분석 — 디렉터 학생 상세 "학습 분석" 탭 서버액션
//
// getStudentStudyAnalytics: 학생 1명의 학습지 스터디 기록 전량
// (worksheet_study_states + worksheet_study_item_logs 최근 5000건)을
// 스킬별·문장별·어법코드별·단어별·과제별로 집계한다. 정오 판정은
// worksheet-study-spec §5 규칙 — correct 우선, 없으면 selfGrade(O=정답,
// D/X=오답), 둘 다 없는 read/flash 로그는 판정 제외. academyId 스코프 필수
// (state·log·assignment 교차검증). 계약: docs/director-console-spec.md §4.2.
// ============================================================================

import {
  isoOf,
  toErrorMessage,
  type StudyActionResult,
} from "@/actions/study-assignments/_shared";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeStudyMastery, type StudyMastery } from "@/lib/worksheet-study/grade";

// ── 반환 계약 ───────────────────────────────────────────────────────────────

/** 스킬축별 첫 시도 정오 누계 — key = StudySkill (미출제 스킬은 부재) */
export type StudentSkillMasteryMap = Record<string, { correct: number; total: number }>;

export interface StudentWeakSentenceRow {
  sentenceNo: number;
  /** 오답률 % (0~100 반올림, 첫 시도 기준) */
  wrongRate: number;
  wrongCount: number;
  attempts: number;
}

export interface StudentWeakGrammarRow {
  /** 어법 포인트 코드 a–m */
  code: string;
  wrongRate: number;
  wrongCount: number;
  attempts: number;
}

export interface StudentWeakWordSummaryRow {
  word: string;
  /** 기록 시점 뜻 스냅샷 — 최근 non-null 우선 */
  meaning: string | null;
  wrongCount: number;
  totalCount: number;
}

/** stageStates 셀 요약 — StudyStageState 의 디렉터 표기 부분집합 */
export interface StudentStudyStageCell {
  status: "todo" | "in-progress" | "done";
  /** done 스테이지의 첫 시도 정답률(0~100) */
  score?: number;
  /** in-progress 부분 진행 — 푼 문항 수 / 전체 문항 수 */
  answered?: number;
  total?: number;
  /** in-progress 첫 시도 정답 수 (툴팁용) */
  firstCorrect?: number;
  /**
   * 첫 시도 채점 문항 수 — 정답 수(firstCorrect)의 분모. 이게 없으면 UI 가
   * "4/4 인데 첫 시도 정답 0개"를 해독할 수 없다(2607 §3.4).
   */
  firstTotal?: number;
}

export interface StudentStudyAssignmentRow {
  assignmentId: string;
  title: string;
  /** key = StudyStageId */
  stages: Record<string, StudentStudyStageCell>;
  /**
   * 첫 시도 정답률(%) — `mastery.firstTryPct` 의 별칭(호환 유지).
   * 저장 스냅샷(WorksheetStudyState.masteryPct)이 아니라 **매 조회 재계산**이다:
   * 저장값은 학생의 마지막 플러시 시점 값이라 학생면과 교사면이 갈렸고, 구 정의는
   * 진행 중 스테이지를 분모에서 빼 부분 학습을 100%로 보고했다(2607 §3.1·§3.3).
   */
  masteryPct: number | null;
  /** 정답률·진도·표본을 한 덩어리로 — 정답률 단독 노출 금지(2607 §3.4) */
  mastery: StudyMastery;
  totalTimeMs: number;
  completedAt: string | null;
  /** 이 과제의 마지막 학습 활동(state.updatedAt) */
  lastActivityAt: string;
  /** 과제 배포 시각 — 같은 제목의 학습지가 여러 번 배포됐을 때 칩·행 구분용 */
  assignedAt: string | null;
  /** 첫 시도 채점 문항 수 — 지문 필터 칩의 모수 */
  gradedCount: number;
  /** 첫 시도 오답 수 — 지문 필터 칩 배지 */
  wrongCount: number;
  /**
   * 원본 학습지(PassageReport) id — 「이 학습지 다시 보내기」 CTA 의 컴포저
   * content.refId 직결용(v3 D2-2). 과제가 삭제·스코프 밖이면 null.
   */
  refId: string | null;
  /**
   * 이 학생 state 의 마지막 플러시 시점 plan 해시 — 문항 상세 팝업의
   * planStale 판정(getStudyItemPreview 에 전달, spec §4.2.2)용.
   */
  planHash: string | null;
}

export interface StudentStudyEventRow {
  at: string; // ISO
  /** 지문(학습지) 필터 키 — spec §4.2.1 */
  assignmentId: string;
  assignmentTitle: string;
  stageId: string;
  itemKey: string;
  skill: string;
  attempt: number;
  /** 판정 — null 은 무채점(read/flash) 완료 기록 */
  correct: boolean | null;
  /** 자기채점 원값(O/D/X) — 상세 시트에서 세모(D) 구분 표기 */
  selfGrade: string | null;
  response: string | null;
  wordKey: string | null;
  /** 기록 시점 뜻 스냅샷 */
  wordMeaning: string | null;
  sentenceNo: number | null;
  grammarCode: string | null;
  timeMs: number;
  hintUsed: boolean;
}

/** 한 스코프(전체 또는 학습지 1개)의 취약점 집계 — 지문 필터가 이 단위로 교체된다 */
export interface StudentStudyBreakdown {
  skills: StudentSkillMasteryMap;
  /** 오답률 내림차순 상위 — 오답 0건 문장 제외 */
  sentences: StudentWeakSentenceRow[];
  /** 오답률 내림차순 — 오답 0건 코드 제외(sentences/words 와 동일 규칙) */
  grammarCodes: StudentWeakGrammarRow[];
  /** 오답 횟수 내림차순 상위 — 오답 0건 단어 제외 */
  words: StudentWeakWordSummaryRow[];
}

export interface StudentStudyAnalytics extends StudentStudyBreakdown {
  /** 학습지별 집계 — key = assignmentId (지문 필터 선택 시 사용) */
  byAssignment: Record<string, StudentStudyBreakdown>;
  /** 최근 활동순 */
  assignments: StudentStudyAssignmentRow[];
  /** 최근 문항 로그 (최신순, 상한 FEED_EVENT_LIMIT) */
  recentEvents: StudentStudyEventRow[];
  /** recentEvents 가 상한에 걸렸는지 — 카드에 "최근 N건 기준" 표기용 */
  eventsTruncated: boolean;
  /** 전체 최신 활동 시각 — 기록 0이면 null */
  lastActivityAt: string | null;
}

// ── 내부 헬퍼 ───────────────────────────────────────────────────────────────

/** 조회 상한 — 학생 1명 로그 최근 5000건(getStudentWeakWords 와 동일 상한) */
const LOG_LIMIT = 5000;
/**
 * 피드로 내려보내는 이벤트 상한. 지문별 필터가 걸리므로 40건이면 과거 학습지가
 * 통째로 비어 보인다 — 15초 폴링 페이로드와의 절충값(spec §4.2.2).
 */
const FEED_EVENT_LIMIT = 200;

/**
 * spec §5 판정 — correct 또는 selfGrade(O=정답, D/X=오답).
 * read/flash 무판정 로그는 null (집계 제외). /g/vocab judgeCorrect 와 동일.
 */
function judgeCorrect(log: { correct: boolean | null; selfGrade: string | null }): boolean | null {
  if (log.correct === true) return true;
  if (log.correct === false) return false;
  if (log.selfGrade === "O") return true;
  if (log.selfGrade === "D" || log.selfGrade === "X") return false;
  return null;
}

interface WrongAgg {
  wrong: number;
  total: number;
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

function finiteNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** stageStates Json 방어 파스 — 손상 항목은 조용히 건너뛴다 (study-stats 미러 + 진행 필드) */
function parseStageStates(raw: unknown): Record<string, StudentStudyStageCell> {
  const out: Record<string, StudentStudyStageCell> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [stageId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = value as {
      status?: unknown;
      score?: unknown;
      answered?: unknown;
      total?: unknown;
      firstCorrect?: unknown;
      firstTotal?: unknown;
    };
    const cell: StudentStudyStageCell = {
      status: v.status === "in-progress" || v.status === "done" ? v.status : "todo",
    };
    const score = finiteNum(v.score);
    if (score !== undefined) cell.score = score;
    const answered = finiteNum(v.answered);
    if (answered !== undefined) cell.answered = answered;
    const total = finiteNum(v.total);
    if (total !== undefined) cell.total = total;
    const firstCorrect = finiteNum(v.firstCorrect);
    if (firstCorrect !== undefined) cell.firstCorrect = firstCorrect;
    const firstTotal = finiteNum(v.firstTotal);
    if (firstTotal !== undefined) cell.firstTotal = firstTotal;
    out[stageId] = cell;
  }
  return out;
}

/** 집계 입력 로그 원자 — prisma select 결과의 부분집합 */
interface AggLog {
  skill: string;
  sentenceNo: number | null;
  wordKey: string | null;
  grammarCode: string | null;
  attempt: number;
  correct: boolean | null;
  selfGrade: string | null;
}

/**
 * 한 스코프(전체 또는 학습지 1개)의 취약점 집계.
 * 첫 시도(attempt=1) + 판정 가능(judgeCorrect ≠ null) 로그만 모수에 넣는다.
 * meaningByWord 는 전 스코프 공용(최근 non-null 뜻 스냅샷).
 */
function aggregateLogs(
  logs: AggLog[],
  meaningByWord: Map<string, string>,
): StudentStudyBreakdown {
  const bySkill = new Map<string, WrongAgg>();
  const bySentence = new Map<number, WrongAgg>();
  const byGrammar = new Map<string, WrongAgg>();
  const byWord = new Map<string, WrongAgg>();

  for (const log of logs) {
    if (log.attempt !== 1) continue;
    const correct = judgeCorrect(log);
    if (correct === null) continue;
    const wrong = !correct;
    bump(bySkill, log.skill, wrong);
    if (typeof log.sentenceNo === "number") bump(bySentence, log.sentenceNo, wrong);
    if (log.grammarCode) bump(byGrammar, log.grammarCode, wrong);
    if (log.wordKey) bump(byWord, log.wordKey, wrong);
  }

  const skills: StudentSkillMasteryMap = {};
  for (const [skill, agg] of bySkill) {
    skills[skill] = { correct: agg.total - agg.wrong, total: agg.total };
  }

  const sentences: StudentWeakSentenceRow[] = [...bySentence.entries()]
    .filter(([, a]) => a.wrong > 0)
    .map(([sentenceNo, a]) => ({
      sentenceNo,
      wrongRate: wrongPct(a),
      wrongCount: a.wrong,
      attempts: a.total,
    }))
    .sort(
      (x, y) => y.wrongRate - x.wrongRate || y.attempts - x.attempts || x.sentenceNo - y.sentenceNo,
    )
    .slice(0, 10);

  // 오답 0건 코드 제외 — 이 배열의 소비처는 「보충 필요 문장·어법 포인트」 카드다.
  // 필터가 없으면 한 번도 틀리지 않은 코드가 정답률 100%(emerald) 로 카드 최상단을
  // 차지해 "보충 필요"라는 카드 주제와 정면으로 어긋난다. sentences(:268)·words(:292)
  // 는 이미 같은 규칙을 쓰고 있었고 여기만 빠져 있었다.
  const grammarCodes: StudentWeakGrammarRow[] = [...byGrammar.entries()]
    .filter(([, a]) => a.wrong > 0)
    .map(([code, a]) => ({
      code,
      wrongRate: wrongPct(a),
      wrongCount: a.wrong,
      attempts: a.total,
    }))
    .sort(
      (x, y) => y.wrongRate - x.wrongRate || y.attempts - x.attempts || x.code.localeCompare(y.code),
    );

  const words: StudentWeakWordSummaryRow[] = [...byWord.entries()]
    .filter(([, a]) => a.wrong > 0)
    .map(([word, a]) => ({
      word,
      meaning: meaningByWord.get(word) ?? null,
      wrongCount: a.wrong,
      totalCount: a.total,
    }))
    .sort((x, y) => y.wrongCount - x.wrongCount || x.word.localeCompare(y.word))
    .slice(0, 12);

  return { skills, sentences, grammarCodes, words };
}

// ── 본체 ────────────────────────────────────────────────────────────────────

export async function getStudentStudyAnalytics(input: {
  studentId: string;
}): Promise<StudyActionResult<StudentStudyAnalytics>> {
  try {
    const staff = await requireStaffAuth();

    // 학생 스코프 state 전량 — academyId 필수
    const states = await prisma.worksheetStudyState.findMany({
      where: { academyId: staff.academyId, studentId: input.studentId },
      select: {
        id: true,
        assignmentId: true,
        stageStates: true,
        // masteryPct(저장 스냅샷)는 select 하지 않는다 — 아래에서 stageStates 로
        // 매번 재계산한다(2607 §3.3). 남겨 두면 다음 사람이 아직 쓰는 값으로 오해한다.
        totalTimeMs: true,
        completedAt: true,
        updatedAt: true,
        planHash: true,
      },
    });

    if (states.length === 0) {
      return {
        success: true,
        data: {
          skills: {},
          sentences: [],
          grammarCodes: [],
          words: [],
          byAssignment: {},
          assignments: [],
          recentEvents: [],
          eventsTruncated: false,
          lastActivityAt: null,
        },
      };
    }

    // 과제 제목 조인 — academyId 스코프 (스코프 밖은 "(삭제된 과제)" 폴백)
    const assignmentIds = [...new Set(states.map((s) => s.assignmentId))];
    const assignmentRows = await prisma.studyAssignment.findMany({
      where: { id: { in: assignmentIds }, academyId: staff.academyId },
      select: { id: true, title: true, createdAt: true, refId: true },
    });
    const titleById = new Map(assignmentRows.map((a) => [a.id, a.title]));
    const refIdById = new Map(assignmentRows.map((a) => [a.id, a.refId]));
    const createdAtById = new Map(assignmentRows.map((a) => [a.id, a.createdAt]));
    const assignmentIdByState = new Map(states.map((s) => [s.id, s.assignmentId]));

    // 문항 로그 — 최신순 상한 조회 (state 집합으로 교차검증)
    const logs = await prisma.worksheetStudyItemLog.findMany({
      where: {
        academyId: staff.academyId,
        studentId: input.studentId,
        stateId: { in: states.map((s) => s.id) },
      },
      orderBy: { createdAt: "desc" },
      take: LOG_LIMIT,
      select: {
        stateId: true,
        stageId: true,
        itemKey: true,
        skill: true,
        sentenceNo: true,
        wordKey: true,
        grammarCode: true,
        attempt: true,
        correct: true,
        selfGrade: true,
        response: true,
        wordMeaning: true,
        timeMs: true,
        hintUsed: true,
        createdAt: true,
      },
    });

    // 단어 뜻 스냅샷 — logs 가 최신순이라 첫 발견 값이 가장 최근. 전 스코프 공용.
    const meaningByWord = new Map<string, string>();
    // 학습지별 로그 버킷 — 지문 필터 스코프 집계용 (spec §4.2.1)
    const logsByAssignment = new Map<string, typeof logs>();
    for (const log of logs) {
      if (
        log.wordKey &&
        log.wordMeaning &&
        log.wordMeaning.trim() &&
        !meaningByWord.has(log.wordKey)
      ) {
        meaningByWord.set(log.wordKey, log.wordMeaning);
      }
      const aid = assignmentIdByState.get(log.stateId);
      if (!aid) continue;
      const bucket = logsByAssignment.get(aid);
      if (bucket) bucket.push(log);
      else logsByAssignment.set(aid, [log]);
    }

    // 전체 스코프 집계 + 학습지별 집계
    const total = aggregateLogs(logs, meaningByWord);
    const byAssignment: Record<string, StudentStudyBreakdown> = {};
    for (const [aid, bucket] of logsByAssignment) {
      byAssignment[aid] = aggregateLogs(bucket, meaningByWord);
    }

    // 학습지별 첫 시도 채점/오답 수 — 필터 칩 배지
    const countsByAssignment = new Map<string, { graded: number; wrong: number }>();
    for (const [aid, bucket] of logsByAssignment) {
      let graded = 0;
      let wrong = 0;
      for (const log of bucket) {
        if (log.attempt !== 1) continue;
        const correct = judgeCorrect(log);
        if (correct === null) continue;
        graded += 1;
        if (!correct) wrong += 1;
      }
      countsByAssignment.set(aid, { graded, wrong });
    }

    // 과제별 진행 행 — 최근 활동순 (필터 칩 순서의 정본, spec §4.2.1)
    const assignments: StudentStudyAssignmentRow[] = states
      .map((st) => {
        const counts = countsByAssignment.get(st.assignmentId);
        const stages = parseStageStates(st.stageStates);
        // 저장 스냅샷(st.masteryPct)을 읽지 않는다 — 학생면(재계산)과 값이 갈리고,
        // 구 정의가 진행 중 스테이지를 분모에서 빼 부분 학습을 100%로 보고했다.
        const mastery = computeStudyMastery(stages);
        return {
          assignmentId: st.assignmentId,
          title: titleById.get(st.assignmentId) ?? "(삭제된 과제)",
          stages,
          masteryPct: mastery.firstTryPct,
          mastery,
          totalTimeMs: st.totalTimeMs,
          completedAt: isoOf(st.completedAt),
          lastActivityAt: st.updatedAt.toISOString(),
          assignedAt: isoOf(createdAtById.get(st.assignmentId) ?? null),
          gradedCount: counts?.graded ?? 0,
          wrongCount: counts?.wrong ?? 0,
          refId: refIdById.get(st.assignmentId) ?? null,
          planHash: st.planHash ?? null,
        };
      })
      .sort(
        (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
      );

    // 실시간 피드 — 최신 FEED_EVENT_LIMIT 건
    const recentEvents: StudentStudyEventRow[] = logs
      .slice(0, FEED_EVENT_LIMIT)
      .map((log) => {
        const aid = assignmentIdByState.get(log.stateId) ?? "";
        return {
          at: log.createdAt.toISOString(),
          assignmentId: aid,
          assignmentTitle: titleById.get(aid) ?? "(삭제된 과제)",
          stageId: log.stageId,
          itemKey: log.itemKey,
          skill: log.skill,
          attempt: log.attempt,
          correct: judgeCorrect(log),
          selfGrade: log.selfGrade,
          response: log.response,
          wordKey: log.wordKey,
          wordMeaning: log.wordMeaning,
          sentenceNo: log.sentenceNo,
          grammarCode: log.grammarCode,
          timeMs: log.timeMs ?? 0,
          hintUsed: log.hintUsed === true,
        };
      });

    // 전체 최신 활동 — state.updatedAt(플러시마다 갱신)과 최신 로그 중 큰 값
    let lastMs = 0;
    for (const st of states) {
      const t = st.updatedAt.getTime();
      if (t > lastMs) lastMs = t;
    }
    if (logs.length > 0) {
      const t = logs[0].createdAt.getTime();
      if (t > lastMs) lastMs = t;
    }

    return {
      success: true,
      data: {
        ...total,
        byAssignment,
        assignments,
        recentEvents,
        eventsTruncated: logs.length > FEED_EVENT_LIMIT,
        lastActivityAt: lastMs > 0 ? new Date(lastMs).toISOString() : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "학습 분석 조회 중 오류가 발생했습니다."),
    };
  }
}
