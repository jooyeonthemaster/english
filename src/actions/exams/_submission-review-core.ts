// ============================================================================
// 시험지 배포·OMR — 강사 검토·수동확정 코어(플레인 모듈, 유닛 W5)
//
// submission-review.ts("use server")가 쓰는 파서·판정·요약·로더·재채점 코어.
// "use server" 모듈은 async 함수만 export 할 수 있어 동기 순수 함수·타입은 이
// 플레인 모듈에 둔다(_helpers.ts · _exam-subject-where.ts 와 동일 관례).
//
// 축 일치 계약(W6 submit 라우트 taking-payload.gradeMergedSubmission 과 동일):
//  - 미입력(input null) = UNKNOWN — 정답 승격 금지. result 를 만들지 않는다.
//  - 채점 완료(allConfirmed) = 전 문항 CORRECT/WRONG/PARTIAL(미입력·NEEDS_REVIEW 0).
//  - 삭제(LIVE 소실) 문항은 채점·배점·카운트에서 완전 제외(리포트 브리지와 동일 축).
//  - PARTIAL 은 [0, points] 클램프(만점 인플레·음수 방어), 점수 round2.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAnswerSpec } from "@/lib/exam-scoring/answer-spec";
import { gradeAnswer } from "@/lib/exam-scoring/grade";
import { round2 } from "@/lib/exam-scoring/normalize";
import { syncSubmissionToReport } from "@/lib/exam-scoring/report-bridge";
import type {
  AnswerSpec,
  FieldGradeResult,
  GradeResult,
  StudentInput,
  SubmissionResponse,
} from "@/lib/exam-scoring/types";
import type { ScoreSummary } from "@/lib/exam-report/types";
import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";
import { isMissingColumnError } from "./_exam-subject-where";

// ── 상수 ─────────────────────────────────────────────────────────────────────

export const MAX_CAS_RETRY = 3;
export const KO_BLOCK_MESSAGE = "국어 시험지는 아직 응시 배포·채점을 지원하지 않습니다.";
export const NOT_FOUND_MESSAGE = "제출을 찾을 수 없습니다.";
export const NO_QUESTIONS_MESSAGE = "채점할 문항이 없습니다. (할당 스냅샷·문항 링크 결손)";
export const CAS_CONFLICT_MESSAGE =
  "다른 저장과 동시에 충돌했습니다. 잠시 후 다시 시도해주세요.";

// jsonb 폭주·비정상 페이로드 방어 캡(강사 대리 입력도 학생 입력과 동일 위생 처리)
const MAX_CHOICE_LEN = 40;
const MAX_CHOICES = 20;
const MAX_TEXT_FIELDS = 20;
const MAX_TEXT_KEY_LEN = 80;
const MAX_TEXT_LEN = 4000;

const GRADE_STATUSES = new Set(["CORRECT", "WRONG", "PARTIAL", "NEEDS_REVIEW"]);
export const MANUAL_STATUSES = new Set(["CORRECT", "WRONG", "PARTIAL"]);
/** 수동확정·재채점이 의미를 갖는 상태(답안이 실린 뒤) */
export const REVIEWABLE_STATUSES = new Set(["SUBMITTED", "GRADED"]);

/** 수동확정 우선 최종 판정 축 — UNKNOWN = 미입력/미채점 */
export type EffectiveStatus =
  | "CORRECT"
  | "WRONG"
  | "PARTIAL"
  | "NEEDS_REVIEW"
  | "UNKNOWN";

// ── 방어적 파서 ──────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Text 컬럼에 JSON 문자열로 실린 값 흡수(options·keyPoints 등). 파싱 실패는 null 로 강등. */
function parseJsonish(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** 도메인 객체 → Prisma Json 입력(exam-report/_helpers.toJson 관례 미러) */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** orderSnapshot 원소 — 할당 시점 고정 [{questionId, orderNum, points}] */
export interface SnapshotEntry {
  questionId: string;
  orderNum: number;
  points: number;
}

export function parseOrderSnapshot(value: unknown): SnapshotEntry[] {
  if (!Array.isArray(value)) return [];
  const rows: SnapshotEntry[] = [];
  for (const raw of value) {
    const rec = asRecord(raw);
    if (!rec || typeof rec.questionId !== "string" || rec.questionId.length === 0) continue;
    rows.push({
      questionId: rec.questionId,
      orderNum:
        typeof rec.orderNum === "number" && Number.isFinite(rec.orderNum)
          ? rec.orderNum
          : rows.length + 1,
      // 배점 결손은 ExamQuestion 기본값 1 로 보정(0 미만·비수치 오염 방어)
      points:
        typeof rec.points === "number" && Number.isFinite(rec.points) && rec.points >= 0
          ? rec.points
          : 1,
    });
  }
  return rows.sort((a, b) => a.orderNum - b.orderNum);
}

/** 클라이언트발 StudentInput 화이트리스트 재조립(스프레드 금지·길이 캡). 전부 비면 null=미입력. */
export function sanitizeStudentInput(raw: unknown): StudentInput | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const out: StudentInput = {};
  if (typeof rec.choice === "string") {
    const choice = rec.choice.trim().slice(0, MAX_CHOICE_LEN);
    if (choice) out.choice = choice;
  }
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
    for (const [key, val] of Object.entries(textsRec)) {
      if (count >= MAX_TEXT_FIELDS) break;
      if (typeof val !== "string") continue;
      const fieldKey = key.trim().slice(0, MAX_TEXT_KEY_LEN);
      const text = val.slice(0, MAX_TEXT_LEN);
      if (!fieldKey || text.trim().length === 0) continue;
      texts[fieldKey] = text;
      count += 1;
    }
    if (count > 0) out.texts = texts;
  }
  return out.choice || out.choices || out.texts ? out : null;
}

/** 저장된 GradeResult 를 화이트리스트 검증 복원(비정형 jsonb 오염 방어) */
function parseStoredResult(value: unknown): GradeResult | undefined {
  const rec = asRecord(value);
  if (!rec || typeof rec.status !== "string" || !GRADE_STATUSES.has(rec.status)) {
    return undefined;
  }
  const status = rec.status as GradeResult["status"];
  const result: GradeResult = {
    status,
    earnedPoints:
      status !== "NEEDS_REVIEW" &&
      typeof rec.earnedPoints === "number" &&
      Number.isFinite(rec.earnedPoints)
        ? rec.earnedPoints
        : status === "NEEDS_REVIEW"
          ? null
          : 0,
  };
  if (Array.isArray(rec.fieldResults)) {
    const fields: FieldGradeResult[] = [];
    for (const f of rec.fieldResults) {
      const fr = asRecord(f);
      if (!fr || typeof fr.key !== "string" || fr.key.length === 0) continue;
      fields.push({
        key: fr.key,
        correct: fr.correct === true,
        earned:
          typeof fr.earned === "number" && Number.isFinite(fr.earned) ? fr.earned : 0,
      });
    }
    if (fields.length > 0) result.fieldResults = fields;
  }
  return result;
}

/** exam_submissions.responses jsonb → SubmissionResponse[](필드 화이트리스트 복원) */
export function parseResponses(value: unknown): SubmissionResponse[] {
  if (!Array.isArray(value)) return [];
  const rows: SubmissionResponse[] = [];
  for (const raw of value) {
    const rec = asRecord(raw);
    if (!rec || typeof rec.questionId !== "string" || rec.questionId.length === 0) continue;
    const row: SubmissionResponse = {
      questionId: rec.questionId,
      orderNum:
        typeof rec.orderNum === "number" && Number.isFinite(rec.orderNum) ? rec.orderNum : 0,
      input: sanitizeStudentInput(rec.input),
    };
    const result = parseStoredResult(rec.result);
    if (result) row.result = result;
    if (typeof rec.manualStatus === "string" && MANUAL_STATUSES.has(rec.manualStatus)) {
      row.manualStatus = rec.manualStatus as SubmissionResponse["manualStatus"];
      if (
        typeof rec.manualEarnedPoints === "number" &&
        Number.isFinite(rec.manualEarnedPoints)
      ) {
        row.manualEarnedPoints = rec.manualEarnedPoints;
      }
      if (typeof rec.reviewedBy === "string" && rec.reviewedBy) {
        row.reviewedBy = rec.reviewedBy;
      }
    }
    rows.push(row);
  }
  return rows;
}

// ── 판정·요약(순수) ──────────────────────────────────────────────────────────

/** 수동확정 우선 최종 판정. PARTIAL 은 [0, points] 클램프(만점 인플레·음수 방어). */
export function effectiveVerdict(
  row: SubmissionResponse,
  points: number,
): { status: EffectiveStatus; earned: number | null } {
  if (row.manualStatus === "CORRECT") return { status: "CORRECT", earned: points };
  if (row.manualStatus === "WRONG") return { status: "WRONG", earned: 0 };
  if (row.manualStatus === "PARTIAL") {
    return {
      status: "PARTIAL",
      earned: round2(Math.max(0, Math.min(points, row.manualEarnedPoints ?? 0))),
    };
  }
  if (row.input == null) return { status: "UNKNOWN", earned: null }; // 미입력
  const result = row.result;
  if (!result) return { status: "UNKNOWN", earned: null }; // 입력은 있으나 미채점
  switch (result.status) {
    case "CORRECT":
      return { status: "CORRECT", earned: points };
    case "WRONG":
      return { status: "WRONG", earned: 0 };
    case "PARTIAL":
      return {
        status: "PARTIAL",
        earned: round2(Math.max(0, Math.min(points, result.earnedPoints ?? 0))),
      };
    default:
      return { status: "NEEDS_REVIEW", earned: null };
  }
}

export interface SummaryOutcome {
  summary: ScoreSummary;
  needsReviewCount: number;
  /** 순수 미입력/미채점 수(UNKNOWN 버킷에서 NEEDS_REVIEW 를 뺀 값) */
  unansweredCount: number;
  /** 전 문항 확정(CORRECT/WRONG/PARTIAL) — GRADED 승격 조건(W6 allConfirmed 동일 축) */
  allConfirmed: boolean;
}

/** ScoreSummary(exam-report 동형) 계산 — UNKNOWN·NEEDS_REVIEW 합산 제외(§6-2).
 *  NEEDS_REVIEW 는 동형 계약에 별도 버킷이 없어 unknownCount 로 합산하되 별도 카운트 병행. */
export function summarize(
  rows: SubmissionResponse[],
  pointsByQuestion: Map<string, number>,
): SummaryOutcome {
  let correctCount = 0;
  let wrongCount = 0;
  let partialCount = 0;
  let unknownCount = 0;
  let needsReviewCount = 0;
  let scoreAcc = 0;
  let maxAcc = 0;
  for (const row of rows) {
    const points = pointsByQuestion.get(row.questionId) ?? 0;
    maxAcc += points;
    const verdict = effectiveVerdict(row, points);
    switch (verdict.status) {
      case "CORRECT":
        correctCount += 1;
        scoreAcc += points;
        break;
      case "WRONG":
        wrongCount += 1;
        break;
      case "PARTIAL":
        partialCount += 1;
        scoreAcc += verdict.earned ?? 0;
        break;
      case "NEEDS_REVIEW":
        needsReviewCount += 1;
        unknownCount += 1;
        break;
      default:
        unknownCount += 1;
    }
  }
  const unansweredCount = unknownCount - needsReviewCount;
  return {
    summary: {
      totalScore: round2(scoreAcc),
      maxScore: round2(maxAcc),
      correctCount,
      wrongCount,
      partialCount,
      unknownCount,
      classAverage: null,
      gradeBand: null,
    },
    needsReviewCount,
    unansweredCount,
    allConfirmed: rows.length > 0 && needsReviewCount === 0 && unansweredCount === 0,
  };
}

/** 레거시 Int 컬럼(score/maxScore/percent) 파생 — 확정 채점(GRADED)일 때만 기록.
 *  미확정 부분합이 확정 점수처럼 보이지 않게 null 로 비운다(W6 submit 관례 미러). */
export function scoreColumns(
  summary: ScoreSummary,
  confirmed: boolean,
): { score: number | null; maxScore: number | null; percent: number | null } {
  if (!confirmed || summary.totalScore == null || summary.maxScore == null) {
    return { score: null, maxScore: null, percent: null };
  }
  return {
    score: Math.round(summary.totalScore),
    maxScore: Math.round(summary.maxScore),
    percent:
      summary.maxScore > 0 ? round2((summary.totalScore / summary.maxScore) * 100) : null,
  };
}

/** 스냅샷(살아있는 문항만) 기준 응답 행 정렬·보충 — 스냅샷 밖 응답 폐기, 결손 문항은 UNKNOWN 행 생성. */
export function alignRowsToSnapshot(
  snapshot: SnapshotEntry[],
  prior: SubmissionResponse[],
): SubmissionResponse[] {
  const priorByQuestion = new Map(prior.map((r) => [r.questionId, r]));
  return snapshot.map((snap) => {
    const before = priorByQuestion.get(snap.questionId);
    return before
      ? { ...before, orderNum: snap.orderNum }
      : { questionId: snap.questionId, orderNum: snap.orderNum, input: null };
  });
}

/** 발문 1줄 요약 — 개행·다중공백 축약 후 80자 클램프(설계 §3.5 brief 규칙) */
export function clampBrief(text: string | null | undefined): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > 80 ? `${t.slice(0, 79)}…` : t;
}

/** 유형 한글 라벨 — QUESTION_TYPE_UI 미등록(커스텀 등)은 subType 원문 노출 */
export function typeLabelOf(subType: string | null | undefined): string {
  if (!subType) return "기타";
  return QUESTION_TYPE_UI[subType]?.label ?? subType;
}

// ── 원본 문항 노출용 정규화(설계 §7.4 — 시험 상세 모달·변형 문제 생성) ────────
//
// 검토 그리드는 지금껏 발문 80자 요약(brief)만 썼지만, 새 상세 모달은 선지 원문·
// 지문·해설까지 그린다. 데이터 원천이 스키마상 자유 형식(Text 컬럼의 JSON 문자열,
// 두 가지 wrongOptionExplanations 형태)이라 여기서 한 번에 방어적으로 정규화한다.
// 파싱 실패는 절대 throw 하지 않고 빈 배열/null 로 강등한다(채점 표면을 죽이지 않는다).

/** 선지 1개 — 모달 렌더·변형 생성 시드가 공유하는 최소 형태 */
export interface ReviewOption {
  label: string;
  text: string;
}

/**
 * Question.options JSON → [{label, text}].
 * 형태 2종을 모두 받는다: `[{label:"①", text:"..."}]` · `["...", "..."]`(라벨 없음).
 * 라벨은 `labels`(= AnswerSpec.optionLabels)를 **우선** 쓴다 — correctChoiceLabels 가
 * 그 축으로 만들어지므로, 여기서 다른 축을 쓰면 UI 가 정답 선지를 못 짚는다.
 */
export function normalizeOptions(raw: unknown, labels?: string[]): ReviewOption[] {
  const parsed = parseJsonish(raw);
  if (!Array.isArray(parsed)) return [];
  const out: ReviewOption[] = [];
  parsed.slice(0, MAX_CHOICES).forEach((item, index) => {
    const fallbackLabel = labels?.[index] ?? String(index + 1);
    if (typeof item === "string") {
      const text = item.trim();
      if (text) out.push({ label: fallbackLabel, text });
      return;
    }
    const rec = asRecord(item);
    if (!rec) return;
    const text =
      typeof rec.text === "string"
        ? rec.text.trim()
        : typeof rec.content === "string"
          ? rec.content.trim()
          : "";
    const ownLabel = typeof rec.label === "string" ? rec.label.trim() : "";
    const label = labels?.[index] ?? (ownLabel || String(index + 1));
    // 라벨만 있고 본문이 빈 선지도 자리는 지켜야 번호↔선지 대응이 어긋나지 않는다
    if (!text && !ownLabel) return;
    out.push({ label, text });
  });
  return out;
}

/** 선지 원천 — options 컬럼이 정본, 마커형(SENTENCE_INSERT 등)은 structuredData 폴백(answer-spec 동일 축) */
export function optionsOf(question: LiveQuestionRow, labels?: string[]): ReviewOption[] {
  const fromColumn = normalizeOptions(question.options, labels);
  if (fromColumn.length > 0) return fromColumn;
  const data = asRecord(parseJsonish(question.structuredData));
  return data ? normalizeOptions(data.options, labels) : [];
}

/** QuestionExplanation 원본 행(Text 컬럼 그대로) */
export interface ExplanationSource {
  content: string;
  keyPoints: string | null;
  wrongOptionExplanations: string | null;
}

/** 정규화된 해설 — 모달 해설 패널·변형 프롬프트의 출제 포인트 원천 */
export interface ReviewExplanation {
  content: string;
  keyPoints: string[];
  wrongOptions: ReviewOption[];
}

const MAX_KEY_POINTS = 20;

/** keyPoints — JSON 문자열 배열. 배열이 아니면(구형 자유 서술) 한 줄로 취급. */
function parseKeyPoints(raw: string | null): string[] {
  const parsed = parseJsonish(raw);
  if (Array.isArray(parsed)) {
    return parsed
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter((p) => p.length > 0)
      .slice(0, MAX_KEY_POINTS);
  }
  if (typeof parsed === "string") {
    const one = parsed.trim();
    return one ? [one] : [];
  }
  // 배열도 문자열도 아닌 JSON(객체 등)은 형태 불명 — 원문 덤프를 노출하지 않고 비운다
  if (parsed != null && typeof parsed === "object") return [];
  const plain = (raw ?? "").trim(); // JSON 이 아닌 구형 자유 서술
  return plain ? [plain] : [];
}

/**
 * wrongOptionExplanations — 두 형태가 모두 실존한다.
 *  (a) `{"1":"왜 틀렸는지…", "2":"…"}`  숫자 키 → optionLabels[n-1] 로 라벨 복원
 *  (b) `[{label:"②", explanation:"…"}]` 라벨 동봉
 * 어느 쪽이든 [{label, text}] 로 통일한다. (a)는 숫자 오름차순으로 정렬해 표시 순서를 고정.
 */
function parseWrongOptions(raw: string | null, labels?: string[]): ReviewOption[] {
  const parsed = parseJsonish(raw);
  if (Array.isArray(parsed)) {
    const out: ReviewOption[] = [];
    parsed.slice(0, MAX_CHOICES).forEach((item, index) => {
      const rec = asRecord(item);
      if (!rec) return;
      const text =
        typeof rec.explanation === "string"
          ? rec.explanation.trim()
          : typeof rec.text === "string"
            ? rec.text.trim()
            : "";
      if (!text) return;
      const ownLabel = typeof rec.label === "string" ? rec.label.trim() : "";
      out.push({ label: ownLabel || labels?.[index] || String(index + 1), text });
    });
    return out;
  }
  const rec = asRecord(parsed);
  if (!rec) return [];
  return Object.entries(rec)
    .map(([key, value]) => {
      const text = typeof value === "string" ? value.trim() : "";
      if (!text) return null;
      const num = Number(key);
      // 숫자 키만 라벨 복원 가능 — 라벨이 결손이면 키 원문("1")을 그대로 노출
      const label =
        Number.isInteger(num) && num > 0 ? (labels?.[num - 1] ?? key) : key;
      return { label, text, sort: Number.isInteger(num) && num > 0 ? num : 999 };
    })
    .filter((o): o is ReviewOption & { sort: number } => o != null)
    .sort((a, b) => a.sort - b.sort)
    .slice(0, MAX_CHOICES)
    .map(({ label, text }) => ({ label, text }));
}

/** 해설 원본 → 표시 계약. 셋 다 비면 null(모달이 해설 섹션 자체를 감춘다). */
export function buildExplanation(
  source: ExplanationSource | undefined,
  optionLabels?: string[],
): ReviewExplanation | null {
  if (!source) return null;
  const content = (source.content ?? "").trim();
  const keyPoints = parseKeyPoints(source.keyPoints);
  const wrongOptions = parseWrongOptions(source.wrongOptionExplanations, optionLabels);
  if (!content && keyPoints.length === 0 && wrongOptions.length === 0) return null;
  return { content, keyPoints, wrongOptions };
}

// ── DB 로더 — 테넌트 격리(submission→exam.academyId 교차검증) ────────────────

export async function loadScopedSubmission(academyId: string, submissionId: string) {
  const sub = await prisma.examSubmission.findFirst({
    where: { id: submissionId },
    include: {
      exam: { select: { id: true, academyId: true, title: true } },
      student: { select: { id: true, name: true } },
    },
  });
  // 존재하지 않음/타 학원 소유 모두 동일 메시지로 응답(존재 여부 누출 금지)
  if (!sub || sub.exam.academyId !== academyId) return null;
  return sub;
}

/** exam.subject 안전 조회 — 컬럼 미ALTER DB(P2022)면 null(영어 간주). crud.getExams 폴백 관례 미러. */
export async function loadExamSubject(examId: string): Promise<string | null> {
  try {
    const row = await prisma.exam.findFirst({
      where: { id: examId },
      select: { subject: true },
    });
    return row?.subject ?? null;
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    return null;
  }
}

/** orderSnapshot(할당 시점 고정)이 정본. 결손(레거시 행)이면 현 ExamQuestion 링크로 폴백. */
export async function resolveSnapshot(sub: {
  examId: string;
  orderSnapshot: unknown;
}): Promise<SnapshotEntry[]> {
  const snapshot = parseOrderSnapshot(sub.orderSnapshot);
  if (snapshot.length > 0) return snapshot;
  const links = await prisma.examQuestion.findMany({
    where: { examId: sub.examId },
    orderBy: { orderNum: "asc" },
    select: { questionId: true, orderNum: true, points: true },
  });
  return links.map((l) => ({
    questionId: l.questionId,
    orderNum: l.orderNum,
    points: l.points,
  }));
}

export interface LiveQuestionRow {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  structuredData: unknown;
  /** 원본 지문 id — 변형 문제 생성 딥링크(§8)의 passageIds 원천 */
  passageId: string | null;
  difficulty: string | null;
  /** 지문 원문 — 채점(specFor)은 content 만 쓰고, id/title 은 모달 표시·딥링크용 */
  passage: { id: string; title: string; content: string } | null;
  deletedAt: Date | null;
}

/** 문항 로드 — academyId 필터로 문항 데이터도 테넌트 격리(휴지통 포함, live 판정은 호출부). */
export async function loadQuestions(
  academyId: string,
  ids: string[],
): Promise<Map<string, LiveQuestionRow>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.question.findMany({
    where: { id: { in: ids }, academyId },
    select: {
      id: true,
      type: true,
      subType: true,
      questionText: true,
      options: true,
      correctAnswer: true,
      structuredData: true,
      passageId: true,
      difficulty: true,
      passage: { select: { id: true, title: true, content: true } },
      deletedAt: true,
    },
  });
  return new Map(rows.map((r) => [r.id, r as LiveQuestionRow]));
}

/**
 * 해설 배치 로드(문항당 0~1행 — questionId @unique). 한 응시 문항 수는 수십 개라
 * findMany 1회로 충분하다(문항별 조회 = N+1 금지).
 * QuestionExplanation 에는 academyId 가 없지만, ids 는 loadQuestions(academyId) 를
 * 통과한 문항 id 집합이므로 테넌트 격리가 이미 성립한다.
 */
export async function loadExplanations(
  ids: string[],
): Promise<Map<string, ExplanationSource>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await prisma.questionExplanation.findMany({
      where: { questionId: { in: ids } },
      select: {
        questionId: true,
        content: true,
        keyPoints: true,
        wrongOptionExplanations: true,
      },
    });
    return new Map(
      rows.map((r) => [
        r.questionId,
        {
          content: r.content,
          keyPoints: r.keyPoints,
          wrongOptionExplanations: r.wrongOptionExplanations,
        },
      ]),
    );
  } catch (error) {
    // 해설은 부가 정보다 — 조회가 실패해도 채점 검토 화면 전체를 죽이지 않는다.
    console.error("[submission-review] 해설 배치 조회 실패:", error);
    return new Map();
  }
}

/** LIVE(휴지통 아님) 문항만 남긴 스냅샷 — 삭제 문항은 채점·배점·표시에서 제외(W6 축). */
export function liveSnapshotEntries(
  snapshot: SnapshotEntry[],
  liveById: Map<string, LiveQuestionRow>,
): { live: SnapshotEntry[]; droppedQuestionCount: number } {
  const live = snapshot.filter((s) => {
    const q = liveById.get(s.questionId);
    return q != null && q.deletedAt == null;
  });
  return { live, droppedQuestionCount: snapshot.length - live.length };
}

/** 배점은 orderSnapshot 이 정본(빌더 재저장으로 LIVE points 가 바뀌어도 응시 조건 유지). */
export function specFor(question: LiveQuestionRow, points: number): AnswerSpec {
  return buildAnswerSpec({
    id: question.id,
    type: question.type,
    subType: question.subType,
    options: question.options ?? undefined,
    correctAnswer: question.correctAnswer,
    structuredData: question.structuredData ?? undefined,
    sourcePassageContent: question.passage?.content,
    points,
  });
}

// ── 재채점 코어 — saveTeacherEntry / regradeSubmission 공유 단일 채점 경로 ────

export interface RegradeOutcome extends SummaryOutcome {
  rows: SubmissionResponse[];
  droppedQuestionCount: number;
}

/**
 * LIVE 스냅샷 전 문항 기준 응답 재구성·재채점(순수 — DB 접근 없음).
 *  - overrides 문항: 입력을 갈아끼우고 구 manualStatus 폐기(새 입력과 무관해진 stale 판정).
 *  - 그 외 문항: 기존 입력·manualStatus 보존, LIVE 문항으로 result 만 재계산.
 *  - input null = UNKNOWN — result 를 만들지 않는다(§6-2 미입력 정답 승격 금지).
 *  - 삭제 문항 행은 여기 도달 전에 이미 제외돼 있어야 한다(liveSnapshotEntries).
 */
export function regradeRows(
  liveSnapshot: SnapshotEntry[],
  prior: SubmissionResponse[],
  liveById: Map<string, LiveQuestionRow>,
  droppedQuestionCount: number,
  overrides?: Map<string, StudentInput | null>,
): RegradeOutcome {
  const priorByQuestion = new Map(prior.map((r) => [r.questionId, r]));
  const rows: SubmissionResponse[] = [];

  for (const snap of liveSnapshot) {
    const before = priorByQuestion.get(snap.questionId);
    const overridden = overrides?.has(snap.questionId) ?? false;
    const input = overridden
      ? (overrides?.get(snap.questionId) ?? null)
      : (before?.input ?? null);

    const row: SubmissionResponse = {
      questionId: snap.questionId,
      orderNum: snap.orderNum,
      input,
    };
    if (!overridden && before?.manualStatus) {
      row.manualStatus = before.manualStatus;
      if (before.manualEarnedPoints != null) {
        row.manualEarnedPoints = before.manualEarnedPoints;
      }
      if (before.reviewedBy) row.reviewedBy = before.reviewedBy;
    }

    const live = liveById.get(snap.questionId);
    if (live && input != null) {
      row.result = gradeAnswer(specFor(live, snap.points), input);
    }
    rows.push(row);
  }

  const pointsByQuestion = new Map(liveSnapshot.map((s) => [s.questionId, s.points]));
  const outcome = summarize(rows, pointsByQuestion);
  return { rows, droppedQuestionCount, ...outcome };
}

/** 저장 성공 후 exam-report 브리지 재동기화(W2 report-bridge). 실패해도 저장은 유효 — 경고로 전달. */
export async function syncBridge(submissionId: string): Promise<string | undefined> {
  try {
    await syncSubmissionToReport(submissionId);
    return undefined;
  } catch (error) {
    console.error("[submission-review] 리포트 브리지 동기화 실패:", error);
    return "저장은 완료됐지만 리포트 연동 갱신에 실패했습니다. '재채점'으로 다시 동기화할 수 있습니다.";
  }
}

export function revalidateExamSurfaces(examId: string): void {
  revalidatePath("/director/exams");
  revalidatePath(`/director/exams/${examId}`);
  revalidatePath("/director/workbench/exams");
}
