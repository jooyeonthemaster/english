// ============================================================================
// 통합 시험 채점 — exam-report 어댑터(순수 합성)
//
// 자체 생성 시험지(Exam→ExamQuestion→Question)를 exam-report 리포트 파이프라인이
// 그대로 소비할 수 있는 형태(ExamMap structure + ExamAnalysisResult analysis +
// StudentResponse[])로 "정직하게" 합성한다. vision E1 을 우회하는 어댑터다.
//
// 계약(설계문서 §3.5):
//  - 이 모듈은 순수다(DB·네트워크·시간 의존 금지). DB 접근은 report-bridge.ts.
//  - 정직 합성: Question/QuestionExplanation 에 실재하는 데이터만 옮긴다.
//    없는 값은 비운다(추정·날조 금지). 해설이 아예 없는 문항은 analysisStatus
//    FAILED(=미분석)로 정직 표기 — AI 보강(W6)이 문항 단위로 업그레이드한다.
//  - 학생 공개면 보안: brief(발문 1줄)에 정답 힌트를 싣지 않는다. brief 소스는
//    발문(direction/questionText 1행)·유형 설명뿐 — 정답 계열 필드 접근 금지.
//  - parseExamMap/parseExamAnalysisResult(DB 라운드트립)를 반드시 통과해야 한다.
//    특히 examMapEntrySchema 의 normalizeMcAnswer 는 MC correctAnswer 를
//    normalizeChoiceToken(1~5 전용)으로 재정규화하므로, 복수정답·6지 이상 토큰은
//    ASCII 숫자로 저장하면 파스 시 "1, 3"→"1" 로 오염된다. 그래서 복수/확장
//    토큰은 원형숫자(②, ④ / ⑪) 표기로 저장한다(정규화 실패 → 원문 보존 경로).
// ============================================================================

import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";
import type {
  ExamAnalysisResult,
  ExamMap,
  ExamMapEntry,
  QuestionAnalysis,
  QuestionTrapDesign,
  StudentResponse,
} from "@/lib/exam-report/types";
import { buildAnswerSpec } from "./answer-spec";
import {
  normalizeChoiceList,
  normalizeChoiceTokenExtended,
  round2,
} from "./normalize";
import type { AnswerSpec, StudentInput, SubmissionResponse } from "./types";

// ── 입력 계약 ────────────────────────────────────────────────────────────────

/** Question 레코드의 합성 관련 최소 투영(report-bridge 가 DB 에서 채워 전달). */
export interface InternalQuestionProjection {
  id: string;
  type: string;
  subType: string | null;
  questionText?: string | null;
  options?: unknown;
  correctAnswer?: string | null;
  structuredData?: unknown;
  sourcePassageContent?: string | null;
  /** "BASIC" | "INTERMEDIATE" | "KILLER" */
  difficulty?: string | null;
  /** JSON 문자열 배열("[\"관계대명사\",...]") 또는 배열 원본 */
  tags?: unknown;
  explanation?: InternalExplanationProjection | null;
}

/** QuestionExplanation 최소 투영. */
export interface InternalExplanationProjection {
  content?: string | null;
  /** JSON 문자열 배열 */
  keyPoints?: string | null;
  /** JSON: { "1": "왜 틀렸는지...", ... } 또는 [{label, explanation}] */
  wrongOptionExplanations?: string | null;
}

/** ExamQuestion 링크 1개 — orderNum 이 리포트 문항 number 의 정본. */
export interface InternalExamItem {
  questionId: string;
  orderNum: number;
  points: number;
  question: InternalQuestionProjection;
}

/** exam_submissions.orderSnapshot 원소 — 할당 시점 고정 스냅샷. */
export interface OrderSnapshotEntry {
  questionId: string;
  orderNum: number;
  points: number;
}

// ── 공용 유틸(방어적 파서) ───────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** JSON 문자열 배열/배열 혼입 → 트림된 string[] (tags·keyPoints 공용). */
function parseStringArray(value: unknown): string[] {
  let arr: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return [];
    try {
      arr = JSON.parse(trimmed);
    } catch {
      // JSON 이 아닌 단일 문자열 태그는 그 자체로 1개 태그로 인정.
      return [trimmed];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0);
}

/** Rich HTML → 평문(태그 제거·기본 엔티티 복원·공백 정돈). 줄바꿈은 보존. */
function stripHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** 다행 텍스트 → 공백 1칸 1줄. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** max 자 초과 시 말줄임(…) 클램프. */
function clampText(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";

/** 정규화 숫자 토큰("1".."15") → 원형숫자 표기(라운드트립 안정·표시 친화). */
function circledToken(token: string): string {
  const n = Number(token);
  return Number.isInteger(n) && n >= 1 && n <= CIRCLED_DIGITS.length
    ? CIRCLED_DIGITS[n - 1]
    : token;
}

// ── 유형 라벨 ────────────────────────────────────────────────────────────────

function typeMetaOf(q: InternalQuestionProjection) {
  return q.subType ? QUESTION_TYPE_UI[q.subType] : undefined;
}

/** 표시용 한글 유형 라벨("빈칸 추론"). 미등록 유형은 subType/type 원문. */
function displayTypeLabel(q: InternalQuestionProjection): string {
  return typeMetaOf(q)?.label ?? (q.subType || q.type || "");
}

/** 저장용 라벨 — exam-report normalizeTypeLabel(내부 공백 제거) 관례와 일치시켜
 *  structure↔analysis↔E1c 그룹핑이 같은 토큰을 보게 한다("빈칸 추론"→"빈칸추론"). */
function storedTypeLabel(q: InternalQuestionProjection): string {
  return displayTypeLabel(q).replace(/\s+/g, "");
}

// ── buildInternalStructure ──────────────────────────────────────────────────

/** AnswerSpec.inputKind → ExamMap kind. */
function kindOf(spec: AnswerSpec): ExamMapEntry["kind"] {
  switch (spec.inputKind) {
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
      return "MC";
    case "TEXT_SINGLE":
    case "TEXT_MULTI":
      return "SHORT";
    default:
      return "ESSAY"; // MANUAL_ONLY
  }
}

/** 발문 1줄(80자) — 정답 힌트 금지 소스만 사용: direction → questionText 1행 →
 *  유형 studentTask. 정답 계열 필드(structuredData.answer/blanks/…)는 접근하지 않는다. */
function buildBrief(q: InternalQuestionProjection): string {
  const data = asRecord(q.structuredData);
  const direction =
    data && typeof data.direction === "string" ? data.direction.trim() : "";
  const firstLine = stripHtml(q.questionText ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const candidate = direction || firstLine || typeMetaOf(q)?.studentTask || "";
  return clampText(oneLine(stripHtml(candidate)), 80);
}

/** 채점 명세 → examMap correctAnswer(강사 정오표 표시용 — 학생면 미노출).
 *  - MC 단일(1~5): 숫자 토큰(기존 exam-report 규약과 동일).
 *  - MC 복수/6지 이상: 원형숫자 표기 — parseExamMap normalizeMcAnswer 의
 *    첫-숫자 추출("1, 3"→"1", "11"→"1") 오염을 회피한다(모듈 헤더 참조).
 *  - TEXT: "라벨 모범답" 요약(단일 필드는 답만). MANUAL: 생략. */
function structureCorrectAnswer(spec: AnswerSpec): string | undefined {
  if (spec.inputKind === "SINGLE_CHOICE" || spec.inputKind === "MULTI_CHOICE") {
    const tokens = spec.correctChoices ?? [];
    if (tokens.length === 0) return undefined;
    if (tokens.length === 1) {
      return Number(tokens[0]) <= 5 ? tokens[0] : circledToken(tokens[0]);
    }
    return tokens.map(circledToken).join(", ");
  }
  if (spec.inputKind === "TEXT_SINGLE" || spec.inputKind === "TEXT_MULTI") {
    const fields = spec.fields ?? [];
    if (fields.length === 0) return undefined;
    const summary =
      fields.length === 1
        ? fields[0].answers[0]
        : fields.map((f) => `${f.label} ${f.answers[0]}`).join(" / ");
    return summary ? clampText(oneLine(summary), 120) : undefined;
  }
  return undefined; // MANUAL_ONLY — 모범답을 지도에 싣지 않는다(강사 검토 UI 몫)
}

export interface InternalStructureInput {
  exam: { title: string; totalPoints: number | null };
  items: InternalExamItem[];
}

/**
 * Exam 문항 링크 → ExamMap(채점 최소 지도). number=String(orderNum), order=orderNum.
 * answerConfidence 는 정답이 실린 항목만 'HIGH'(자체 시험지 = 정답 데이터 정본 보유).
 * MANUAL(ESSAY)·정답 데이터 없음 강등 항목은 정답/확신도 둘 다 비워 "정답 부재"를
 * 소비처가 LOW 확신과 혼동하지 않게 한다(exam-report types 계약).
 */
export function buildInternalStructure(input: InternalStructureInput): ExamMap {
  const seen = new Set<number>();
  const items = [...(input.items ?? [])]
    .filter((it) => {
      if (!it || typeof it.questionId !== "string" || !Number.isFinite(it.orderNum)) return false;
      if (seen.has(it.orderNum)) return false; // orderNum 중복 방어(첫 항목 유지)
      seen.add(it.orderNum);
      return true;
    })
    .sort((a, b) => a.orderNum - b.orderNum);

  const questions: ExamMapEntry[] = items.map((it) => {
    const spec = buildAnswerSpec({
      id: it.question.id,
      type: it.question.type,
      subType: it.question.subType,
      options: it.question.options,
      correctAnswer: it.question.correctAnswer,
      structuredData: it.question.structuredData,
      sourcePassageContent: it.question.sourcePassageContent,
      points: it.points,
    });
    const correctAnswer = structureCorrectAnswer(spec);
    return {
      number: String(it.orderNum),
      order: it.orderNum,
      kind: kindOf(spec),
      points: Number.isFinite(it.points) ? it.points : null,
      typeLabel: storedTypeLabel(it.question),
      brief: buildBrief(it.question),
      ...(correctAnswer != null
        ? { correctAnswer, answerConfidence: "HIGH" as const }
        : {}),
    };
  });

  // 배점 합이 실측 정본(Exam.totalPoints 는 디폴트 100 이 실합과 어긋나는 경우가 많다).
  const pointsSum = round2(questions.reduce((sum, q) => sum + (q.points ?? 0), 0));
  return {
    questions,
    totalPoints: questions.length > 0 ? pointsSum : input.exam.totalPoints ?? null,
    pageCount: 0, // INTERNAL 합성 — 시험지 사진 미경유
  };
}

// ── buildInternalAnalysis ───────────────────────────────────────────────────

/** Question.difficulty(BASIC/INTERMEDIATE/KILLER) → 5단계 환산(결정론 매핑). */
const DIFFICULTY_TO_SCALE: Record<string, 1 | 2 | 3 | 4 | 5> = {
  BASIC: 2,
  INTERMEDIATE: 3,
  KILLER: 5,
};

/** 오답해설 소스({"1": "..."} 레코드 | [{label, explanation}] 배열 | JSON 문자열)
 *  → {choice, why}[]. 토큰은 확장 정규화 후 1~5 만 채택 — trapDesignSchema 의
 *  normalizeChoiceToken(1~5 전용, 실패 시 "1" 강제) 라운드트립 오염을 회피한다. */
function parseWrongOptionWhys(value: unknown): { choice: string; why: string }[] {
  let data: unknown = value;
  if (typeof value === "string") {
    try {
      data = JSON.parse(value);
    } catch {
      return [];
    }
  }
  const out: { choice: string; why: string }[] = [];
  const push = (choiceRaw: unknown, whyRaw: unknown) => {
    const choice = normalizeChoiceTokenExtended(choiceRaw);
    const why = oneLine(stripHtml(whyRaw == null ? "" : String(whyRaw)));
    if (choice && Number(choice) <= 5 && why.length > 0) out.push({ choice, why });
  };
  if (Array.isArray(data)) {
    for (const raw of data) {
      const rec = asRecord(raw);
      if (!rec) continue;
      push(
        rec.choice ?? rec.label ?? rec.option ?? rec.number,
        rec.why ?? rec.explanation ?? rec.reason ?? rec.text,
      );
    }
  } else {
    const rec = asRecord(data);
    if (rec) for (const [key, val] of Object.entries(rec)) push(key, val);
  }
  return out;
}

/** 오답해설 2소스(QuestionExplanation 우선, structuredData 보충) → trapDesign.
 *  attractiveness 는 소스에 없는 값이라 중간값 2 고정(스키마 필수 필드 — 날조가
 *  아니라 "정보 없음"의 중립 표기. W6 AI 보강이 실측으로 갱신한다). */
function buildTrapDesign(q: InternalQuestionProjection): QuestionTrapDesign[] | undefined {
  const data = asRecord(q.structuredData);
  const primary = parseWrongOptionWhys(q.explanation?.wrongOptionExplanations);
  const secondary = parseWrongOptionWhys(data?.wrongOptionExplanations);
  const byChoice = new Map<string, string>();
  for (const { choice, why } of [...primary, ...secondary]) {
    if (!byChoice.has(choice)) byChoice.set(choice, why);
  }
  if (byChoice.size === 0) return undefined;
  return [...byChoice.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([choice, why]) => ({ choice, why: clampText(why, 300), attractiveness: 2 }));
}

export interface InternalAnalysisInput {
  items: InternalExamItem[];
}

/**
 * 문항별 QuestionAnalysis 정직 합성 — 소스는 QuestionExplanation(content/keyPoints/
 * wrongOptionExplanations)·Question.tags·difficulty 뿐이다.
 *  - 해설 실체(content 또는 keyPoints)가 있으면 analysisStatus OK. intent/examPoint 는
 *    유형 메타(question-type-ui description/studentTask — 유형 차원의 사실 서술,
 *    합니다체)로 채워 report-assemble "미분석" 폴백을 피한다.
 *  - 해설이 전혀 없으면 FAILED(미분석) — 필드를 비워 정직 표기(플레이스홀더 금지).
 *    typeLabel/difficulty/keyConcepts 는 FAILED 여도 채워 W6 보강·UI 표기의 재료로 남긴다.
 *  - perQuestion 은 number(=orderNum) 오름차순 정렬 — AI 보강이 number 키로
 *    문항 단위 덮어쓰기를 하는 병합 계약의 기준 순서다.
 */
export function buildInternalAnalysis(input: InternalAnalysisInput): ExamAnalysisResult {
  const seen = new Set<number>();
  const items = [...(input.items ?? [])]
    .filter((it) => {
      if (!it || !Number.isFinite(it.orderNum) || seen.has(it.orderNum)) return false;
      seen.add(it.orderNum);
      return true;
    })
    .sort((a, b) => a.orderNum - b.orderNum);

  const perQuestion: QuestionAnalysis[] = items.map((it) => {
    const q = it.question;
    const meta = typeMetaOf(q);
    const label = displayTypeLabel(q);
    const typeLabel = storedTypeLabel(q);

    const content = clampText(stripHtml(q.explanation?.content ?? ""), 2000);
    const keyPoints = parseStringArray(q.explanation?.keyPoints);
    const keyPointsLine = keyPoints.join(" · ");
    // 해설 본문이 없으면 핵심 포인트를 해설로 승격(둘 다 실데이터 — 날조 아님).
    const explanation = content || keyPointsLine;
    const solvingStrategy = content ? keyPointsLine : "";

    const intent =
      meta?.description ?? (label ? `${label} 유형의 이해도를 평가하는 문항입니다.` : "");
    const examPoint =
      meta?.studentTask ?? (label ? `${label} 유형 문항을 해결하는 능력을 확인합니다.` : "");

    const difficultyKey = (q.difficulty ?? "").toUpperCase();
    const difficulty = DIFFICULTY_TO_SCALE[difficultyKey] ?? 3;
    const difficultyRationale = DIFFICULTY_TO_SCALE[difficultyKey]
      ? "출제 시 설정한 난이도 등급(기본·표준·킬러)을 5단계 척도로 환산한 값입니다."
      : "";

    const keyConcepts = parseStringArray(q.tags).slice(0, 4);
    const trapDesign = buildTrapDesign(q);

    // OK 게이트: 저장본 파스(questionAnalysisOkSchema)가 explanation/intent/examPoint
    // min(1)·typeLabel min(1) 을 강제한다 — 하나라도 비면 FAILED 로 정직 강등
    // (OK 로 저장했다가 파스에서 통째로 드롭되는 것이 최악의 결과다).
    const ok =
      explanation.length > 0 &&
      intent.length > 0 &&
      examPoint.length > 0 &&
      typeLabel.length > 0;

    return {
      number: String(it.orderNum),
      analysisStatus: ok ? ("OK" as const) : ("FAILED" as const),
      typeLabel,
      difficulty,
      difficultyRationale,
      explanation: ok ? explanation : "",
      intent: ok ? intent : "",
      examPoint: ok ? examPoint : "",
      keyConcepts,
      solvingStrategy: ok ? solvingStrategy : "",
      ...(trapDesign ? { trapDesign } : {}),
    };
  });

  // examLevel(시험 총평)은 합성 근거가 없다 — 정직하게 null(types 계약: 미완 시 null).
  return { perQuestion, examLevel: null };
}

// ── toStudentResponses ──────────────────────────────────────────────────────

/** 서답형 필드 키 → 표시 라벨. "(A)" 류는 그대로, seg-N 은 "(밑줄 N)", 그 외 괄호. */
function formatFieldLabel(key: string): string {
  if (key.startsWith("(")) return key;
  const seg = key.match(/^seg-(\d+)$/);
  if (seg) return `(밑줄 ${seg[1]})`;
  return `(${key})`;
}

/** 서답형 학생 답 원문 길이 캡 — answer-entry STUDENT_ANSWER_MAX_LEN 과 동일 규칙. */
const STUDENT_ANSWER_MAX_LEN = 500;

function buildChosenChoice(input: StudentInput): string | undefined {
  if (Array.isArray(input.choices) && input.choices.length > 0) {
    const tokens = normalizeChoiceList(input.choices);
    return tokens.length > 0 ? tokens.join(", ") : undefined;
  }
  return normalizeChoiceTokenExtended(input.choice);
}

function buildStudentAnswerText(input: StudentInput): string | undefined {
  const texts = input.texts;
  if (texts == null || typeof texts !== "object") return undefined;
  const entries = Object.entries(texts)
    .map(([key, value]) => [key, oneLine(String(value ?? ""))] as const)
    .filter(([, value]) => value.length > 0);
  if (entries.length === 0) return undefined;
  const joined =
    entries.length === 1
      ? entries[0][1] // 단일 필드는 라벨 없이 답만(대부분 key "answer")
      : entries.map(([key, value]) => `${formatFieldLabel(key)} ${value}`).join(" / ");
  return joined.slice(0, STUDENT_ANSWER_MAX_LEN);
}

const FINAL_STATUSES = new Set(["CORRECT", "WRONG", "PARTIAL"] as const);
type FinalStatus = "CORRECT" | "WRONG" | "PARTIAL";

function isFinalStatus(value: unknown): value is FinalStatus {
  return typeof value === "string" && FINAL_STATUSES.has(value as FinalStatus);
}

/**
 * SubmissionResponse[](채점 저장본) × orderSnapshot → exam-report StudentResponse[].
 * 매핑 계약(설계문서 §3.5):
 *  - number = String(orderNum). 스냅샷에 없는 questionId 응답은 폐기(발명 금지).
 *  - manualStatus(강사 수동확정)가 있으면 최우선 — status 그대로 + reviewed:true,
 *    PARTIAL 은 manualEarnedPoints 를 [0, points] 클램프해 earnedPoints 로.
 *  - 미입력(input null) → UNKNOWN + reviewed:false(정답 승격 절대 금지).
 *  - 자동채점 CORRECT/WRONG/PARTIAL → 동일 status + reviewed:true(확정분).
 *  - NEEDS_REVIEW(및 미채점 입력) → UNKNOWN + reviewed:false — 사람이 확정할 때까지
 *    computeScoreSummary 합산에서 제외된다.
 *  - chosenChoice: 정규화 숫자 토큰(복수는 ", " join). studentAnswer: texts 를
 *    "(라벨) 값" join(단일 필드는 값만) — 정오표에서 모범답과 대조하는 재료.
 *  - source 는 전부 'MANUAL'(AUTO 는 E2 사진 판독 전용 축 — 여기는 결정론 채점).
 */
export function toStudentResponses(
  responses: SubmissionResponse[],
  orderSnapshot: OrderSnapshotEntry[],
): StudentResponse[] {
  const byQuestionId = new Map<string, SubmissionResponse>();
  for (const r of responses ?? []) {
    if (r && typeof r === "object" && typeof r.questionId === "string") {
      byQuestionId.set(r.questionId, r);
    }
  }

  const seen = new Set<number>();
  const ordered = [...(orderSnapshot ?? [])]
    .filter((s) => {
      if (!s || typeof s.questionId !== "string" || !Number.isFinite(s.orderNum)) return false;
      if (seen.has(s.orderNum)) return false;
      seen.add(s.orderNum);
      return true;
    })
    .sort((a, b) => a.orderNum - b.orderNum);

  return ordered.map((snap) => {
    const number = String(snap.orderNum);
    const points = Number.isFinite(snap.points) ? Math.max(0, snap.points) : 0;
    const resp = byQuestionId.get(snap.questionId);
    const input =
      resp && resp.input != null && typeof resp.input === "object"
        ? (resp.input as StudentInput)
        : null;

    const chosenChoice = input ? buildChosenChoice(input) : undefined;
    const studentAnswer = input ? buildStudentAnswerText(input) : undefined;
    const base: StudentResponse = {
      number,
      status: "UNKNOWN",
      source: "MANUAL",
      reviewed: false,
      ...(chosenChoice != null ? { chosenChoice } : {}),
      ...(studentAnswer != null ? { studentAnswer } : {}),
    };

    // 1) 강사 수동확정이 최우선(NEEDS_REVIEW 해소·미입력 판정 포함).
    if (resp && isFinalStatus(resp.manualStatus)) {
      const row: StudentResponse = { ...base, status: resp.manualStatus, reviewed: true };
      if (resp.manualStatus === "PARTIAL") {
        row.earnedPoints = round2(
          Math.max(0, Math.min(points, resp.manualEarnedPoints ?? 0)),
        );
      }
      return row;
    }

    // 2) 미입력 = UNKNOWN(정답 승격 금지).
    if (!input) return base;

    // 3) 자동채점 확정분 — CORRECT/WRONG/PARTIAL 은 결정론 확정이라 reviewed:true.
    const result = resp?.result;
    if (result && isFinalStatus(result.status)) {
      const row: StudentResponse = { ...base, status: result.status, reviewed: true };
      if (result.status === "PARTIAL") {
        row.earnedPoints = round2(
          Math.max(0, Math.min(points, result.earnedPoints ?? 0)),
        );
      }
      return row;
    }

    // 4) NEEDS_REVIEW·미채점 입력 → UNKNOWN + reviewed:false(studentAnswer 보존).
    return base;
  });
}
