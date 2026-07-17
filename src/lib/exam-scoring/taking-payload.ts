// ============================================================================
// 통합 시험 채점 — 응시 세션 로더 + 공개 저장/제출 공용 로직 (W4)
//
// /t/[token] 무세션 공개면(태블릿/OMR 응시)의 서버 조립 정본. /a/[token] 골격을
// 미러한다: 토큰 형식검증 → accessToken 행 조회 → accessEnabled 게이트 →
// orderSnapshot 순서로 LIVE Question 로드 → 화이트리스트 페이로드 조립.
//
// 학생 공개면 철칙(설계문서 §6-1): TakingSession 은 클라이언트 컴포넌트 props 로
// 직렬화된다 — 정답성 데이터(correctAnswer/correctChoices/result/scoreSummary/
// manualStatus 등)는 구조적으로 실을 수 없게 화이트리스트 조립만 사용한다
// (스프레드/omit 금지). savedInputs 복원도 input(choice/choices/texts)만 추출.
//
// 채점 정답 소스는 LIVE Question(설계문서 §1) — 단 배점·순서는 할당 시점의
// orderSnapshot 이 정본(빌더 재저장/셔플로부터 응시 무결성 보호).
// ============================================================================

import { prisma } from "@/lib/prisma";
import { isValidShareToken } from "@/lib/exam-report/share-token";
import type { ScoreSummary } from "@/lib/exam-report/types";
import { buildAnswerSpec } from "./answer-spec";
import { gradeAnswer } from "./grade";
import { round2 } from "./normalize";
import type {
  GradeResult,
  GradeStatus,
  StudentInput,
  SubmissionResponse,
} from "./types";
// W1 계약(설계문서 §3.4) — 학생 공개면 페이로드의 정답 누출 차단 정본.
import {
  buildAnswerUiSpec,
  buildStudentSafeQuestion,
  type AnswerUiSpec,
  type StudentSafeQuestion,
} from "./student-safe";

// ── 공개 계약 타입 ────────────────────────────────────────────────────────────

/** exam_submissions.orderSnapshot 원소 — 할당 시점 고정(assignments 액션이 기록) */
export interface OrderSnapshotEntry {
  questionId: string;
  orderNum: number;
  points: number;
}

export type TakingMode = "TABLET" | "OMR";
export type TakingStatus = "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED" | "GRADED";

/** 응시 문항 1개 — 학생에게 보이는 전부(정답성 데이터 없음) */
export interface TakingQuestion {
  /** save/submit responses 레코드의 키 — 문항 식별자(정답성 데이터 아님) */
  questionId: string;
  orderNum: number;
  points: number;
  /** W1 화이트리스트 조립본 — 렌더에 필요한 필드만, 정답성 필드 구조적 제외 */
  safe: StudentSafeQuestion;
  /** 응답 위젯 명세(선지 수·라벨·필드 키) — AnswerSpec 에서 정답 제거본 */
  answerUi: AnswerUiSpec;
}

/**
 * /t/[token] 페이지 서버 조립 산출물. SUBMITTED/GRADED 세션은 완료 화면용
 * 축약형(questions=[] · savedInputs={})으로만 로드된다 — 점수·정오 미포함.
 */
export interface TakingSession {
  submissionId: string;
  mode: TakingMode;
  status: TakingStatus;
  examTitle: string;
  /** 제한시간(분) — null 이면 타이머 미표시 */
  duration: number | null;
  studentName: string;
  totalQuestions: number;
  questions: TakingQuestion[];
  /** questionId→학생 입력 복원(자동저장 이어하기) — result/정오 절대 미포함 */
  savedInputs: Record<string, StudentInput>;
  /** 실제 응시 시작 시각(ISO) — ASSIGNED 의 DB default(now()) 잔재는 null 처리 */
  startedAt: string | null;
  submittedAt: string | null;
  /** 낙관적 락 버전 — save 의 clientVersion 힌트용(정답성 데이터 아님) */
  version: number;
  /** orderSnapshot 에 있었지만 삭제(deletedAt)된 문항의 orderNum — 응시 대상 제외 안내용 */
  meta: { removedOrderNums: number[] };
}

// ── 방어적 파서(jsonb 경계 — answer-spec.ts 관례 미러) ────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  return typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** orderSnapshot 파스 — 파손 원소 제외, questionId 중복 제거(첫 원소 우선), orderNum 순 정렬 */
export function parseOrderSnapshot(value: unknown): OrderSnapshotEntry[] {
  const seen = new Set<string>();
  const entries: OrderSnapshotEntry[] = [];
  for (const raw of asArray(value)) {
    const rec = asRecord(raw);
    if (!rec) continue;
    const questionId = typeof rec.questionId === "string" ? rec.questionId : "";
    const orderNum = asFiniteNumber(rec.orderNum);
    if (!questionId || orderNum == null || seen.has(questionId)) continue;
    // 배점 파손은 0점 처리(만점 인플레 방지 방향) — 채점·표시는 계속 동작한다.
    const points = Math.max(0, asFiniteNumber(rec.points) ?? 0);
    seen.add(questionId);
    entries.push({ questionId, orderNum, points });
  }
  return entries.sort((a, b) => a.orderNum - b.orderNum);
}

// ── 학생 입력 정화(화이트리스트 조립) ─────────────────────────────────────────

const MAX_CHOICE_LEN = 24;
const MAX_CHOICES = 20;
const MAX_TEXT_FIELDS = 10;
const MAX_TEXT_KEY_LEN = 64;
const MAX_TEXT_LEN = 4000;

/**
 * 임의 JSON → StudentInput | null. 알려진 키(choice/choices/texts)만 새 객체로
 * 조립하고 크기를 캡한다(무인증 쓰기 경로의 저장 비대화 방어). 유효 값이 하나도
 * 없으면 null — "답 지움"과 "미입력"을 동일하게 UNKNOWN 으로 수렴시킨다.
 */
export function sanitizeStudentInput(value: unknown): StudentInput | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const out: StudentInput = {};

  const choice =
    typeof rec.choice === "string" ? rec.choice.trim().slice(0, MAX_CHOICE_LEN) : "";
  if (choice) out.choice = choice;

  if (Array.isArray(rec.choices)) {
    const choices = rec.choices
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.trim().slice(0, MAX_CHOICE_LEN))
      .filter((c) => c.length > 0)
      .slice(0, MAX_CHOICES);
    if (choices.length > 0) out.choices = choices;
  }

  const textsRec = asRecord(rec.texts);
  if (textsRec) {
    const texts: Record<string, string> = {};
    let count = 0;
    for (const [rawKey, rawValue] of Object.entries(textsRec)) {
      if (count >= MAX_TEXT_FIELDS) break;
      if (typeof rawValue !== "string") continue;
      const key = rawKey.trim().slice(0, MAX_TEXT_KEY_LEN);
      // 공백뿐인 답은 미입력 취급(원문은 보존하되 빈 필드는 버림)
      if (!key || rawValue.trim().length === 0) continue;
      texts[key] = rawValue.slice(0, MAX_TEXT_LEN);
      count += 1;
    }
    if (count > 0) out.texts = texts;
  }

  return out.choice || out.choices || out.texts ? out : null;
}

// ── responses(jsonb) 파스 — 서버 내부 전용(클라 직렬화 금지) ──────────────────

const GRADE_STATUSES: ReadonlySet<string> = new Set(["CORRECT", "WRONG", "PARTIAL", "NEEDS_REVIEW"]);
const MANUAL_STATUSES: ReadonlySet<string> = new Set(["CORRECT", "WRONG", "PARTIAL"]);

function parseGradeResult(value: unknown): GradeResult | undefined {
  const rec = asRecord(value);
  if (!rec) return undefined;
  const status = typeof rec.status === "string" && GRADE_STATUSES.has(rec.status)
    ? (rec.status as GradeStatus)
    : null;
  if (!status) return undefined;
  const fieldResults = asArray(rec.fieldResults)
    .map((raw) => {
      const f = asRecord(raw);
      if (!f || typeof f.key !== "string") return null;
      return { key: f.key, correct: f.correct === true, earned: asFiniteNumber(f.earned) ?? 0 };
    })
    .filter((f): f is NonNullable<typeof f> => f != null);
  return {
    status,
    earnedPoints: asFiniteNumber(rec.earnedPoints),
    ...(fieldResults.length > 0 ? { fieldResults } : {}),
  };
}

/**
 * exam_submissions.responses(jsonb) → SubmissionResponse[] 방어 파스.
 * ⚠️ result/manualStatus 등 채점 필드를 보존하므로 이 산출물은 서버 내부(병합·
 * 채점) 전용 — 학생 공개면으로는 절대 그대로 내보내지 않는다(savedInputs 는
 * loadTakingSession 이 input 만 재추출).
 */
export function parseSubmissionResponses(value: unknown): SubmissionResponse[] {
  const out: SubmissionResponse[] = [];
  for (const raw of asArray(value)) {
    const rec = asRecord(raw);
    if (!rec) continue;
    const questionId = typeof rec.questionId === "string" ? rec.questionId : "";
    const orderNum = asFiniteNumber(rec.orderNum);
    if (!questionId || orderNum == null) continue;
    const result = parseGradeResult(rec.result);
    const manualStatus = typeof rec.manualStatus === "string" && MANUAL_STATUSES.has(rec.manualStatus)
      ? (rec.manualStatus as SubmissionResponse["manualStatus"])
      : undefined;
    const manualEarnedPoints = asFiniteNumber(rec.manualEarnedPoints);
    out.push({
      questionId,
      orderNum,
      input: sanitizeStudentInput(rec.input),
      ...(result ? { result } : {}),
      ...(manualStatus ? { manualStatus } : {}),
      ...(manualEarnedPoints != null ? { manualEarnedPoints } : {}),
      ...(typeof rec.reviewedBy === "string" && rec.reviewedBy
        ? { reviewedBy: rec.reviewedBy }
        : {}),
    });
  }
  return out;
}

// ── 제출행 조회 + 라우트 공통 게이트 ─────────────────────────────────────────

/**
 * accessToken 으로 응시행을 조회한다. accessEnabled/상태 게이트는 호출자 몫 —
 * 로더는 비활성=null(만료 화면), 라우트는 403/409 로 구분 응대해야 하기 때문.
 */
export async function findTakingSubmission(token: string) {
  return prisma.examSubmission.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      status: true,
      accessEnabled: true,
      mode: true,
      responses: true,
      orderSnapshot: true,
      version: true,
      startedAt: true,
      submittedAt: true,
      exam: { select: { id: true, title: true, duration: true, subject: true, academyId: true } },
      student: { select: { name: true } },
    },
  });
}

export type TakingSubmissionRow = NonNullable<
  Awaited<ReturnType<typeof findTakingSubmission>>
>;

export interface TakingGateError {
  httpStatus: number;
  code: "NOT_FOUND" | "DISABLED" | "LOCKED";
  error: string;
}

/**
 * save/submit 공통 쓰기 게이트. 통과하면 null.
 * - KOREAN 시험지: 배포 자체가 차단이지만(액션+UI 이중) 이중 방어로 존재 은닉(404).
 * - accessEnabled false → 403(강사가 링크 회수), SUBMITTED/GRADED → 409 LOCKED.
 */
export function takingWriteGate(row: TakingSubmissionRow): TakingGateError | null {
  if (row.exam.subject === "KOREAN") {
    // prettier-ignore
    return { httpStatus: 404, code: "NOT_FOUND", error: "응시 링크가 만료되었거나 존재하지 않습니다." };
  }
  if (!row.accessEnabled) {
    // prettier-ignore
    return { httpStatus: 403, code: "DISABLED", error: "응시 링크가 비활성화되었습니다. 선생님께 문의해 주세요." };
  }
  if (row.status === "SUBMITTED" || row.status === "GRADED") {
    // prettier-ignore
    return { httpStatus: 409, code: "LOCKED", error: "이미 제출이 완료된 시험입니다." };
  }
  return null;
}

function normalizeTakingMode(mode: string | null): TakingMode {
  return mode === "OMR" ? "OMR" : "TABLET";
}

function normalizeTakingStatus(status: string): TakingStatus {
  return status === "ASSIGNED" ||
    status === "SUBMITTED" ||
    status === "GRADED" ||
    status === "IN_PROGRESS"
    ? status
    : "IN_PROGRESS";
}

// ── 응시 세션 로더 ────────────────────────────────────────────────────────────

/**
 * /t/[token] 페이지 조립 정본. null = 링크 미존재/비활성/파손(만료 화면).
 * SUBMITTED/GRADED 는 축약형(완료 화면) — 문항·입력·점수를 일절 싣지 않는다.
 */
export async function loadTakingSession(token: string): Promise<TakingSession | null> {
  if (!isValidShareToken(token)) return null;
  const row = await findTakingSubmission(token);
  if (!row) return null;
  // 비활성 링크·KOREAN(배포 차단 이중 방어)은 존재를 구분하지 않고 만료 화면으로.
  if (!row.accessEnabled) return null;
  if (row.exam.subject === "KOREAN") return null;

  const status = normalizeTakingStatus(row.status);
  const mode = normalizeTakingMode(row.mode);
  const snapshot = parseOrderSnapshot(row.orderSnapshot);

  // 화이트리스트 공통 필드 — DB 행 스프레드 금지(§6-1).
  const base = {
    submissionId: row.id,
    mode,
    status,
    examTitle: row.exam.title,
    duration: row.exam.duration ?? null,
    studentName: row.student.name,
    // startedAt 컬럼은 default(now()) — ASSIGNED(미응시)의 값은 행 생성 잔재라 숨긴다.
    startedAt: status === "ASSIGNED" ? null : row.startedAt.toISOString(),
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    version: row.version,
  };

  // 제출/채점 완료 — 완료 화면용 축약형. 문항·답안·정오·점수 미포함(§6-1).
  if (status === "SUBMITTED" || status === "GRADED") {
    return {
      ...base,
      totalQuestions: snapshot.length,
      questions: [],
      savedInputs: {},
      meta: { removedOrderNums: [] },
    };
  }

  // orderSnapshot 없는 행 = 할당 파손(정상 경로에선 불가) — 링크 미존재로 응대.
  if (snapshot.length === 0) return null;

  // LIVE 문항 로드 — 채점 정답 소스와 동일 축. 삭제(deletedAt)·타학원 소속은 제외.
  // passage 동봉: 지문 기반 문항의 시험지 충실 렌더(student-safe passageContent)용.
  const records = await prisma.question.findMany({
    where: {
      id: { in: snapshot.map((e) => e.questionId) },
      academyId: row.exam.academyId,
      deletedAt: null,
    },
    include: { passage: { select: { content: true } } },
  });
  const byId = new Map(records.map((q) => [q.id, q]));

  const questions: TakingQuestion[] = [];
  const removedOrderNums: number[] = [];
  for (const entry of snapshot) {
    const question = byId.get(entry.questionId);
    if (!question) {
      // 할당 후 삭제된 문항 — 응시 대상에서 제외하고 meta 로만 알린다.
      removedOrderNums.push(entry.orderNum);
      continue;
    }
    // AnswerSpec(정답 포함)은 서버에서만 소비 — 클라로는 buildAnswerUiSpec 결과만.
    const spec = buildAnswerSpec({
      id: question.id,
      type: question.type,
      subType: question.subType,
      options: question.options,
      correctAnswer: question.correctAnswer,
      structuredData: question.structuredData,
      sourcePassageContent: question.passage?.content,
      points: entry.points,
    });
    questions.push({
      questionId: entry.questionId,
      orderNum: entry.orderNum,
      points: entry.points,
      safe: buildStudentSafeQuestion(question),
      answerUi: buildAnswerUiSpec(spec),
    });
  }
  // 전 문항이 삭제됐으면 응시 자체가 성립하지 않는다 — 만료 화면.
  if (questions.length === 0) return null;

  // 자동저장 복원 — 학생 입력(input)만 추출. result/정오·manualStatus 절대 미포함.
  const savedInputs: Record<string, StudentInput> = {};
  for (const response of parseSubmissionResponses(row.responses)) {
    if (!byId.has(response.questionId)) continue;
    if (!response.input) continue;
    savedInputs[response.questionId] = response.input;
  }

  return {
    ...base,
    totalQuestions: questions.length,
    questions,
    savedInputs,
    meta: { removedOrderNums },
  };
}

// ── 부분 병합(save/submit 공용, 순수) ────────────────────────────────────────

export interface MergeResponsesResult {
  responses: SubmissionResponse[];
  /** orderSnapshot 에 실존해 반영된 문항 수 */
  applied: number;
  /** 스냅샷 밖 questionId 로 폐기된 문항 수(클라 우회·오염 입력) */
  discarded: number;
}

/**
 * 기존 responses 에 학생 입력을 문항 단위로 병합한다(순수).
 * - orderSnapshot 에 없는 questionId 는 폐기(응시 범위 밖 쓰기 차단).
 * - 입력이 바뀐 문항의 기존 result 는 무효 — 통째로 교체해 폐기한다(제출 시 재채점).
 * - 건드리지 않은 문항의 기존 항목(결과 포함)은 그대로 보존.
 */
export function mergeSubmissionResponses(args: {
  snapshot: OrderSnapshotEntry[];
  existing: unknown;
  incoming: Record<string, StudentInput | null>;
}): MergeResponsesResult {
  const snapshotById = new Map(args.snapshot.map((e) => [e.questionId, e]));
  const merged = new Map<string, SubmissionResponse>();
  // 기존 항목도 스냅샷 화이트리스트로 걸러 저장 비대화·유령 문항 누적을 막는다.
  for (const existing of parseSubmissionResponses(args.existing)) {
    if (snapshotById.has(existing.questionId)) merged.set(existing.questionId, existing);
  }

  let applied = 0;
  let discarded = 0;
  for (const [questionId, input] of Object.entries(args.incoming)) {
    const snap = snapshotById.get(questionId);
    if (!snap) {
      discarded += 1;
      continue;
    }
    applied += 1;
    // orderNum 은 스냅샷이 정본. input null = 답 지움(UNKNOWN 수렴).
    merged.set(questionId, { questionId, orderNum: snap.orderNum, input });
  }

  const responses = [...merged.values()].sort((a, b) => a.orderNum - b.orderNum);
  return { responses, applied, discarded };
}

// ── 서버 채점 조립(submit 전용, 순수) ────────────────────────────────────────

/** 채점에 필요한 LIVE Question 최소 투영(submit 라우트가 select) */
export interface ScorableQuestionRecord {
  id: string;
  type: string;
  subType: string | null;
  options: string | null;
  correctAnswer: string;
  structuredData: unknown;
  passage?: { content: string } | null;
}

export interface SubmissionGradingResult {
  /** 최종 저장본 — 삭제 문항 제외, 미입력은 input null(result 없음 = UNKNOWN) */
  responses: SubmissionResponse[];
  /** 미입력(비 MANUAL_ONLY) 문항 orderNum — INCOMPLETE 400 응답용 */
  missingOrderNums: number[];
  /** 스냅샷에 있으나 LIVE 아님(삭제) — 채점·배점 제외, 서버 로그용 */
  droppedQuestionIds: string[];
  /** exam-report ScoreSummary 동형 — totalScore 는 확정분 합(NEEDS_REVIEW 는
   *  unknownCount 로 표기하되 합계를 null 로 만들지 않는다) */
  scoreSummary: ScoreSummary;
  /** 전 문항 확정(CORRECT/WRONG/PARTIAL) — true 면 GRADED 승격 가능 */
  allConfirmed: boolean;
}

/**
 * 병합 완료된 responses 를 LIVE Question 기준으로 전 문항 채점한다(순수).
 * 미입력=UNKNOWN(정답 승격 금지), 판정 불확실=NEEDS_REVIEW — grade.ts 불변식 승계.
 */
export function gradeMergedSubmission(args: {
  snapshot: OrderSnapshotEntry[];
  merged: SubmissionResponse[];
  questions: Map<string, ScorableQuestionRecord>;
}): SubmissionGradingResult {
  const inputById = new Map(args.merged.map((r) => [r.questionId, r.input]));

  const responses: SubmissionResponse[] = [];
  const missingOrderNums: number[] = [];
  const droppedQuestionIds: string[] = [];
  let correctCount = 0;
  let wrongCount = 0;
  let partialCount = 0;
  let noInputCount = 0;
  let needsReviewCount = 0;
  let totalScore = 0;
  let maxScore = 0;

  for (const entry of args.snapshot) {
    const question = args.questions.get(entry.questionId);
    if (!question) {
      // 삭제 문항 — 학생이 응시 화면에서 본 적 없는 문항. 배점·카운트에서 제외해
      // scoreSummary 와 리포트 브리지 재계산(responses 기반)의 정합을 지킨다.
      droppedQuestionIds.push(entry.questionId);
      continue;
    }
    maxScore += entry.points;
    const spec = buildAnswerSpec({
      id: question.id,
      type: question.type,
      subType: question.subType,
      options: question.options,
      correctAnswer: question.correctAnswer,
      structuredData: question.structuredData,
      sourcePassageContent: question.passage?.content,
      points: entry.points,
    });
    const input = inputById.get(entry.questionId) ?? null;

    if (input == null) {
      // 미입력 = UNKNOWN — result 없이 저장(정답 승격 금지, §6-2).
      noInputCount += 1;
      // MANUAL_ONLY(자유영작 등)는 빈 제출이 정상 경로일 수 있어 INCOMPLETE 강제 제외.
      if (spec.inputKind !== "MANUAL_ONLY") missingOrderNums.push(entry.orderNum);
      responses.push({ questionId: entry.questionId, orderNum: entry.orderNum, input: null });
      continue;
    }

    const result = gradeAnswer(spec, input);
    if (result.status === "CORRECT") {
      correctCount += 1;
      totalScore += result.earnedPoints ?? 0;
    } else if (result.status === "PARTIAL") {
      partialCount += 1;
      totalScore += result.earnedPoints ?? 0;
    } else if (result.status === "WRONG") {
      wrongCount += 1;
    } else {
      needsReviewCount += 1;
    }
    responses.push({ questionId: entry.questionId, orderNum: entry.orderNum, input, result });
  }

  const scoreSummary: ScoreSummary = {
    totalScore: round2(totalScore),
    maxScore: round2(maxScore),
    correctCount,
    wrongCount,
    partialCount,
    // exam-report 축 매핑: 미입력(UNKNOWN)+NEEDS_REVIEW 가 모두 "미확정" 카운트.
    unknownCount: noInputCount + needsReviewCount,
  };

  return {
    responses,
    missingOrderNums,
    droppedQuestionIds,
    scoreSummary,
    allConfirmed: noInputCount === 0 && needsReviewCount === 0,
  };
}
