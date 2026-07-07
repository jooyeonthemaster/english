// ============================================================================
// analyze 라우트 순수 헬퍼 — 라우트 파일 슬림화용(분할). 부수효과 없음.
// ============================================================================

import type { Prisma } from "@prisma/client";
import { selectAnalysisTargetKeys } from "@/lib/exam-report/exam-analyze-direct";
import { examAnalysisCreditCost } from "@/lib/exam-report/types";
import type {
  ExamAnalysisResult,
  ExamMap,
  ExamMapAnswer,
  ExamMapEntry,
  QuestionAnalysis,
} from "@/lib/exam-report/types";

/** 분석 키: 표기 번호에서 공백 제거(analyze.ts 와 동일 규약). */
export function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

/** 도메인 타입 → Prisma Json 저장 경계(optional 필드 때문에 직접 대입 불가). */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

interface AnalyzeBody {
  numbers?: string[];
}

/** body {numbers?:string[]} 정규화 — 공백 제거·중복 제거, 없으면 undefined. */
export function readNumbers(raw: unknown): string[] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const numbers = (raw as AnalyzeBody).numbers;
  if (!Array.isArray(numbers)) return undefined;
  const cleaned = numbers
    .map((n) => (typeof n === "string" ? n.trim() : String(n ?? "").trim()))
    .filter((n) => n.length > 0);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : undefined;
}

/** sourceFiles Json([{path,page}]) → 유효 페이지 배열. 손상/빈값이면 []. */
export function parseSourceFilePages(
  value: unknown,
): { path: string; page: number }[] {
  if (!Array.isArray(value)) return [];
  const pages: { path: string; page: number }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const path = (item as Record<string, unknown>).path;
    const page = (item as Record<string, unknown>).page;
    if (typeof path !== "string" || path.length === 0) continue;
    pages.push({ path, page: typeof page === "number" ? page : pages.length });
  }
  return pages;
}

/** Json raw 를 얕은 복사 객체로 — 스키마 밖 키(runStartedAt 등) 보존용. */
export function rawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function numOr0(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** raw Json 객체에서 숫자 필드 읽기(없거나 손상 시 0). */
export function readNumberField(value: unknown, key: string): number {
  return numOr0(rawObject(value)[key]);
}

/** raw Json 객체에서 string[] 필드 읽기 — 배열이 아니면 null. */
export function readStringArrayField(value: unknown, key: string): string[] | null {
  const field = rawObject(value)[key];
  if (!Array.isArray(field)) return null;
  return field
    .map((v) => (typeof v === "string" ? v : String(v ?? "")))
    .filter((v) => v.length > 0);
}

/**
 * aiMeta 누적 병합(usage·failedNumbers 반영). raw JSON 기반으로 병합해
 * 스키마 밖 키(runStartedAt·synthFailures 등)를 보존한다. extra 로 그런
 * 키들을 함께 기록한다.
 */
export function mergeAiMeta(
  existingRaw: unknown,
  patch: {
    model: string;
    calls: number;
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
    failedNumbers: string[];
    extra?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const base = rawObject(existingRaw);
  return {
    ...base,
    model: patch.model,
    calls: numOr0(base.calls) + patch.calls,
    promptTokens: numOr0(base.promptTokens) + patch.promptTokens,
    completionTokens: numOr0(base.completionTokens) + patch.completionTokens,
    durationMs: patch.durationMs,
    failedNumbers: patch.failedNumbers,
    ...(patch.extra ?? {}),
  };
}

// ── 실행 계획(A1·A7) ────────────────────────────────────────────────────────

export interface RunPlan {
  /** A7 examMap 대조 필터 통과한 유효 대상(문항단위) — 전체 실행이면 undefined */
  targetNumbers?: string[];
  /** 전체 실행에서 강제 재분석 번호 — v3 는 stale 소스가 없어 항상 [] (계약 보존용) */
  forceNumbers: string[];
  /** 이번 실행 시도 대상 키 */
  attemptedKeys: string[];
  /** 시도 대상 중 무료(사전 FAILED) 키 — 과금 제외·환불 제외 기준 */
  freeKeys: string[];
  /** 청구 크레딧 */
  cost: number;
  /** 분석이 아예 없는 첫 실행(전체 max(15,N) 청구 기준) */
  isFirstRun: boolean;
  /** 전체 실행: 시도 대상 0 + 종합 존재 → 과금·실행 없이 200 */
  alreadyAnalyzed: boolean;
  /** 문항단위 실행: 구조와 교집합 0 → 400 INVALID_NUMBERS */
  invalidNumbers: boolean;
}

/**
 * 요청 → 시도 대상/과금 계획(A1·A7).
 * - 문항단위: targetNumbers ∩ examMap. 사전 FAILED 는 무료(재분석 무료 계약).
 * - 전체: prior OK 제외(=FAILED 만, 무료). 첫 실행만 max(15,N), 이후 시도 문항당 1.
 *   시도 0 + examLevel 존재 → alreadyAnalyzed. 전체 재실행 재과금은 클라가 전 문항을
 *   targetNumbers 로 지정(문항단위 경로)해 유발한다.
 */
export function computeRunPlan(opts: {
  questions: ExamMapEntry[];
  prior: ExamAnalysisResult | null;
  requestedNumbers?: string[];
  /**
   * 첫 실행 전액과금(max(15,N))이 이미 완료됨(aiMeta.paidFullRun) — 전체 실행이든
   * 문항단위(requestedNumbers) 실행이든 prior 에 항목이 아예 없는 문항(중단으로
   * 미시도)은 무료(freeKeys) 처리한다(이중과금 차단 — 이미 max(15,N)에 포함된
   * 문항이다). 기존 규칙(사전 FAILED 무료·prior OK 문항 강제 재분석 과금·
   * paidFullRun 미지정 첫 실행 max(15,N))은 불변.
   */
  paidFullRun?: boolean;
}): RunPlan {
  const structureKeys = new Set(opts.questions.map((q) => numberKey(q.number)));
  const priorPerQuestion = opts.prior?.perQuestion ?? [];
  const priorKeys = new Set(priorPerQuestion.map((q) => numberKey(q.number)));
  const priorFailedKeys = new Set(
    priorPerQuestion
      .filter((q) => q.analysisStatus === "FAILED")
      .map((q) => numberKey(q.number)),
  );

  if (opts.requestedNumbers) {
    const validTargets = opts.requestedNumbers.filter((n) =>
      structureKeys.has(numberKey(n)),
    );
    if (validTargets.length === 0) {
      return {
        forceNumbers: [],
        attemptedKeys: [],
        freeKeys: [],
        cost: 0,
        isFirstRun: false,
        alreadyAnalyzed: false,
        invalidNumbers: true,
      };
    }
    const attemptedKeys = Array.from(new Set(validTargets.map(numberKey)));
    const freeKeys = attemptedKeys.filter(
      (k) =>
        priorFailedKeys.has(k) ||
        // paidFullRun: 문항단위 지정이라도 prior 부재(중단 미시도) 문항은 이미 첫 실행
        // max(15,N) 청구에 포함된 과금분 — 재과금하면 이중과금(검수 MEDIUM: 28문항
        // 과금 후 중단 → {numbers:["7"]} 재분석에 1cr 추가 청구되던 결함).
        // prior OK 문항 강제 재분석 과금 규칙(기존 테스트 고정)은 그대로 유지된다.
        (opts.paidFullRun === true && !priorKeys.has(k)),
    );
    return {
      targetNumbers: validTargets,
      forceNumbers: [],
      attemptedKeys,
      freeKeys,
      cost: attemptedKeys.length - freeKeys.length,
      isFirstRun: false,
      alreadyAnalyzed: false,
      invalidNumbers: false,
    };
  }

  const forceNumbers: string[] = [];
  const selected = selectAnalysisTargetKeys({
    questionNumbers: opts.questions.map((q) => q.number),
    priorPerQuestion,
    forceNumbers,
  });
  const attemptedKeys = opts.questions
    .map((q) => numberKey(q.number))
    .filter((k) => selected.has(k));
  const freeKeys = attemptedKeys.filter(
    (k) =>
      priorFailedKeys.has(k) ||
      // paidFullRun: 이미 전액과금된 실행에서 중단으로 미시도된 문항(prior 부재)의
      // 재개는 무료 — 첫 실행 max(15,N) 청구분에 이미 포함된 문항이다.
      (opts.paidFullRun === true && !priorKeys.has(k)),
  );
  const isFirstRun = priorPerQuestion.length === 0;
  return {
    forceNumbers,
    attemptedKeys,
    freeKeys,
    // paidFullRun 이면 prior 소실(체크포인트 0) 재실행도 재과금하지 않는다.
    cost:
      isFirstRun && !opts.paidFullRun
        ? examAnalysisCreditCost(opts.questions.length)
        : attemptedKeys.length - freeKeys.length,
    isFirstRun,
    alreadyAnalyzed: attemptedKeys.length === 0 && opts.prior?.examLevel != null,
    invalidNumbers: false,
  };
}

// ── 실행 결과 집계(환불 기준) ────────────────────────────────────────────────

export interface RunSets {
  /** 이번 실행에서 시도한 문항 키 */
  attempted: string[];
  /** 이번 실행에서 OK 로 판정된 키 */
  succeeded: string[];
  /** 과금 대상이었으나 실패한 키(무료 freeKeys 제외) — 비례 환불 기준 */
  failedBillable: string[];
}

/** 최종 체크포인트로 이번 실행의 성공/과금실패 집합을 집계한다. */
export function computeRunSets(opts: {
  attemptedKeys: string[];
  freeKeys: ReadonlySet<string>;
  finalPerQuestion: QuestionAnalysis[];
}): RunSets {
  const finalStatusByKey = new Map(
    opts.finalPerQuestion.map((q) => [numberKey(q.number), q.analysisStatus]),
  );
  const succeeded = opts.attemptedKeys.filter(
    (key) => finalStatusByKey.get(key) === "OK",
  );
  const failedBillable = opts.attemptedKeys.filter(
    (key) => finalStatusByKey.get(key) === "FAILED" && !opts.freeKeys.has(key),
  );
  return { attempted: opts.attemptedKeys, succeeded, failedBillable };
}

// ── 체크포인트 병합(A5) ─────────────────────────────────────────────────────

/**
 * 이번 실행 체크포인트를 DB 본에 병합 — attempted 문항만 이번 실행 결과로
 * 덮고, 그 외 문항·examLevel 은 DB 본(병렬 편집 포함)을 유지한다.
 * examLevel 은 DB 에 없을 때만 이번 실행(S3) 결과를 채운다.
 */
export function mergeCheckpointIntoDb(opts: {
  dbAnalysis: ExamAnalysisResult | null;
  checkpoint: ExamAnalysisResult;
  attemptedKeys: ReadonlySet<string>;
}): ExamAnalysisResult {
  const merged = (opts.dbAnalysis?.perQuestion ?? []).map((q) => ({ ...q }));
  for (const analysis of opts.checkpoint.perQuestion) {
    const key = numberKey(analysis.number);
    if (!opts.attemptedKeys.has(key)) continue;
    const index = merged.findIndex((item) => numberKey(item.number) === key);
    if (index >= 0) merged[index] = { ...analysis };
    else merged.push({ ...analysis });
  }
  return {
    perQuestion: merged,
    examLevel: opts.dbAnalysis?.examLevel ?? opts.checkpoint.examLevel,
  };
}

/**
 * E1b 가 도출한 정답을 DB examMap(structure)에 병합한다(v3.1) — 순수 함수.
 * attempted 문항의 정답 필드(correctAnswer/answerConfidence)만 갱신하고, 비-attempted
 * 항목·다른 필드(배점·유형·발문)는 DB 본을 유지한다(강사 인라인 수정·병렬 편집 보존).
 * 병합 규칙(청사진 §3): attempted 문항은 사실상 항상 이번 실행 정답으로 덮되,
 * - 이번 실행이 정답을 못 냈으면(배치 실패·미도출) 기존 정답을 보존하고 확신도만 갱신,
 * - 강사가 이미 확정한 학생 점수는 status 기반이라 examMap 정답 변경과 무관(불가침).
 */
export function mergeAnswersIntoExamMap(opts: {
  dbExamMap: ExamMap | null;
  answers: ExamMapAnswer[];
  attemptedKeys: ReadonlySet<string>;
}): ExamMap | null {
  if (!opts.dbExamMap) return null;
  if (opts.answers.length === 0) return opts.dbExamMap;
  const answerByKey = new Map(opts.answers.map((a) => [numberKey(a.number), a]));
  let changed = false;
  const questions = opts.dbExamMap.questions.map((q) => {
    const key = numberKey(q.number);
    if (!opts.attemptedKeys.has(key)) return q;
    const ans = answerByKey.get(key);
    if (!ans) return q; // 이번 실행에서 정답 미도출(배치 실패) → 기존 정답 보존
    changed = true;
    return {
      ...q,
      // 새 정답이 없으면 기존 정답 보존, 확신도는 갱신(미도출 시 LOW → 확인 유도).
      correctAnswer: ans.correctAnswer ?? q.correctAnswer,
      answerConfidence: ans.answerConfidence,
    };
  });
  return changed ? { ...opts.dbExamMap, questions } : opts.dbExamMap;
}
