// ============================================================================
// 학생 시험 리포트 v3 — zod 스키마 (LLM 응답 파싱 + DB Json 파스)
//
// 관례: LLM 드리프트는 preprocess 로 흡수(optionalTrimmedString/flexibleChoice/
// flexibleDifficulty 등), DB 저장본 파스는 관대(safeParse + 폴백).
// v2 의 구조화(S1) 전용 스키마(examPaperStructureSchema 등)는 폐기됐고,
// 대신 ExamMap(E1a) zod + 답안 판독(E2) zod 를 신설한다.
// ============================================================================

import { z } from "zod";
import type {
  ExamAiMeta,
  ExamAnalysisResult,
  ExamLevelAnalysis,
  ExamMap,
  ExamReviewState,
  QuestionAnalysis,
  ReadState,
  ScoreSummary,
  StudentResponse,
} from "./types";

// ── 드리프트 흡수 유틸 ─────────────────────────────────────────────────────

/** 문자열/숫자/배열 혼입을 string[] 로 정규화 */
const optionalStringArray = z.preprocess((value) => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter((v) => v.length > 0);
  if (typeof value === "string") return value.length > 0 ? [value] : [];
  return [String(value)];
}, z.array(z.string()));

/** "3", 3, "3점" → 3 / null·빈값 → null */
const flexibleNullableNumber = z.preprocess((value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const m = value.match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  return null;
}, z.number().nullable());

/** 원형숫자/공백 혼입 선지 표기를 "1".."5" 로 정규화 */
const CIRCLED_TO_DIGIT: Record<string, string> = {
  "①": "1",
  "②": "2",
  "③": "3",
  "④": "4",
  "⑤": "5",
};
export function normalizeChoiceToken(value: unknown): string | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  if (raw.length === 0) return undefined;
  if (CIRCLED_TO_DIGIT[raw]) return CIRCLED_TO_DIGIT[raw];
  const m = raw.match(/[1-5]/);
  return m ? m[0] : undefined;
}
const flexibleChoice = z.preprocess(
  (value) => normalizeChoiceToken(value),
  z.string().optional(),
);

/** LLM 이 optional 필드를 null/빈문자로 출력하는 드리프트 흡수 → undefined */
const optionalTrimmedString = z.preprocess((value) => {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
}, z.string().optional());

/**
 * 선지 텍스트 선두의 원형숫자(①~⑤)+공백 제거.
 * v3 examMap 은 선지 전문을 담지 않지만, 리포트 문서 계열·기존 저장본 호환을 위해
 * 이 순수 유틸은 보존한다. strip 결과가 빈 문자열이면 원본을 유지한다.
 */
const LEADING_CHOICE_ORDINAL = /^[①-⑤]\s*/;
export function stripLeadingChoiceOrdinal(value: string): string {
  const stripped = value.replace(LEADING_CHOICE_ORDINAL, "");
  return stripped.length > 0 ? stripped : value;
}

/**
 * 유형명 정규화 — 내부 공백 전면 제거(한글 유형명 관례 "제목 추론"→"제목추론").
 * E1b 문항분석·E1c 유형분포가 동일 라벨을 보게 해 그룹핑 desync 를 막는다.
 */
function normalizeTypeLabel(value: unknown): unknown {
  if (value == null) return value;
  return String(value).replace(/\s+/g, "");
}

const flexibleDifficulty = z.preprocess((value) => {
  const n = typeof value === "number" ? value : Number(String(value).match(/\d/)?.[0] ?? 3);
  return Math.min(5, Math.max(1, Math.round(Number.isFinite(n) ? n : 3)));
}, z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]));

const flexibleWeight = z.preprocess((value) => {
  const n = typeof value === "number" ? value : Number(String(value).match(/\d/)?.[0] ?? 2);
  return Math.min(3, Math.max(1, Math.round(Number.isFinite(n) ? n : 2)));
}, z.union([z.literal(1), z.literal(2), z.literal(3)]));

/** 문항 종류 정규화(서술/단답/선택) */
const questionKindSchema = z.preprocess((value) => {
  const raw = String(value ?? "").toUpperCase();
  if (raw.includes("ESSAY") || raw.includes("서술")) return "ESSAY";
  if (raw.includes("SHORT") || raw.includes("단답")) return "SHORT";
  return "MC";
}, z.enum(["MC", "SHORT", "ESSAY"]));

/** 신뢰도 등급 정규화(HIGH/MEDIUM/LOW) — 한글·영문·혼입 흡수 */
const confidenceSchema = z.preprocess((value) => {
  const raw = String(value ?? "").toUpperCase();
  if (raw.includes("HIGH") || raw.includes("높") || raw.includes("확실")) return "HIGH";
  if (raw.includes("LOW") || raw.includes("낮") || raw.includes("불확")) return "LOW";
  return "MEDIUM";
}, z.enum(["HIGH", "MEDIUM", "LOW"]));

/**
 * 신뢰도 optional 변형 — 값이 없으면 MEDIUM 으로 강등하지 않고 undefined 로 둔다.
 * E1a examMap(정답 미도출)·E1b 배치(정답 확신도 누락) 항목에서 "없음"을 보존해,
 * 소비처가 정답 부재(E1 진행 중)를 LOW 확신과 혼동하지 않게 한다.
 */
const optionalConfidence = z.preprocess((value) => {
  if (value == null || String(value).trim() === "") return undefined;
  const raw = String(value).toUpperCase();
  if (raw.includes("HIGH") || raw.includes("높") || raw.includes("확실")) return "HIGH";
  if (raw.includes("LOW") || raw.includes("낮") || raw.includes("불확")) return "LOW";
  return "MEDIUM";
}, z.enum(["HIGH", "MEDIUM", "LOW"]).optional());

const orderSchema = z.preprocess(
  (v) => (typeof v === "number" ? Math.round(v) : Number(String(v).match(/\d+/)?.[0] ?? 0)),
  z.number().int().min(0),
);

// ── E1a: ExamMap ────────────────────────────────────────────────────────────

// v3.1: 정답 도출을 E1a → E1b 로 이관. E1a(구조 지도)는 정답을 풀지 않으므로 정답
// 필드가 없는 구조 전용 스키마를, DB 저장본/E1b 병합 후 examMap 은 정답 필드까지 담는
// 전체 스키마를 쓴다. 두 스키마의 공통 구조 필드 정의를 공유해 드리프트를 막는다.
const examMapStructureFields = {
  number: z.preprocess((v) => String(v ?? "").trim(), z.string().min(1)),
  order: orderSchema,
  kind: questionKindSchema,
  points: flexibleNullableNumber,
  typeLabel: z.string().catch(""),
  brief: z.string().catch(""),
} as const;

/** E1a 응답 항목 — 정답 없이 구조(번호/유형/배점/발문)만. 문제를 풀지 않는다. */
export const examMapEntryStructureSchema = z.object(examMapStructureFields);

// MC 정답을 kind 를 아는 객체 레벨에서 "1".."5" 로 정규화(서술형 모범답안은 훼손 금지).
// 정규화 실패(비선지 텍스트)는 원문 유지 — 채점 파생/뷰 비교가 동일 토큰을 보게 한다.
function normalizeMcAnswer<T extends { kind: string; correctAnswer?: string }>(q: T): T {
  if (q.kind !== "MC" || q.correctAnswer == null) return q;
  const normalized = normalizeChoiceToken(q.correctAnswer);
  return normalized ? { ...q, correctAnswer: normalized } : q;
}

/** DB/병합 후 examMap 항목 — 구조 + E1b 도출 정답(둘 다 optional). */
export const examMapEntrySchema = z
  .object({
    ...examMapStructureFields,
    correctAnswer: optionalTrimmedString,
    answerConfidence: optionalConfidence,
  })
  .transform(normalizeMcAnswer);

/** E1a LLM 응답(전 페이지 1콜) — 구조만. pageCount 는 코드가 이미지 수로 부여. */
export const examMapExtractionSchema = z.object({
  questions: z.array(examMapEntryStructureSchema),
  totalPoints: flexibleNullableNumber.catch(null),
});

/** DB 저장본(pageCount + 병합된 정답 포함) — 관대 파스. */
export const examMapSchema = z.object({
  questions: z.array(examMapEntrySchema),
  totalPoints: flexibleNullableNumber.catch(null),
  pageCount: z.preprocess(
    (v) => (typeof v === "number" ? Math.round(v) : Number(String(v).match(/\d+/)?.[0] ?? 0)),
    z.number().int().min(0),
  ).catch(0),
});

// ── E1b: QuestionAnalysis ─────────────────────────────────────────────────

const trapDesignSchema = z.object({
  choice: z.preprocess((v) => normalizeChoiceToken(v) ?? "1", z.string()),
  why: z.string().catch(""),
  attractiveness: flexibleWeight,
});

/** E1b LLM 응답용 — analysisStatus 는 코드가 부여하므로 미포함 */
export const questionAnalysisLlmSchema = z.object({
  number: z.preprocess((v) => String(v ?? "").trim(), z.string().min(1)),
  typeLabel: z.preprocess(normalizeTypeLabel, z.string().min(1)),
  difficulty: flexibleDifficulty,
  difficultyRationale: z.string().catch(""),
  explanation: z.string().min(1),
  intent: z.string().min(1),
  examPoint: z.string().min(1),
  keyConcepts: optionalStringArray,
  solvingStrategy: z.string().catch(""),
  trapDesign: z.preprocess(
    (v) => (v == null ? undefined : v),
    z.array(trapDesignSchema).optional(),
  ),
});

/**
 * E1b 배치 항목 — 문항 분석 + 그 문항의 정답 도출(correctAnswer/answerConfidence).
 * 정답 필드는 QuestionAnalysis(분석)에 남기지 않고 exam-analyze-direct 가 분리해
 * examMap(structure)으로 병합한다(v3.1: 정답 도출을 E1a → E1b 로 이관).
 */
export const questionAnalysisBatchItemSchema = questionAnalysisLlmSchema.extend({
  correctAnswer: optionalTrimmedString,
  answerConfidence: optionalConfidence,
});

export const questionAnalysisBatchSchema = z.object({
  analyses: z.array(questionAnalysisBatchItemSchema),
});

/**
 * 저장본(analysisStatus 포함) — 정답 필드는 examMap 소유라 분석엔 담지 않는다.
 *
 * D1-a: analysisStatus 판별 유니온.
 *  - OK 항목: 분석 필드 strict(explanation/intent/examPoint 등 min(1)) — LLM 스키마 그대로.
 *  - FAILED 항목: 배치 실패 플레이스홀더라 분석 필드가 빈 문자열/누락이다. 이를 관대
 *    파스(catch("")) 로 허용해, 저장 → 재조회 라운드트립에서 FAILED 한 항목이 배열
 *    전체 파스를 무너뜨려(누적 OK 소실) 분석이 영구 미수렴하는 poison-parse 를 막는다.
 */
const questionAnalysisOkSchema = questionAnalysisLlmSchema.extend({
  analysisStatus: z.literal("OK"),
});

const questionAnalysisFailedSchema = z.object({
  number: z.preprocess((v) => String(v ?? "").trim(), z.string().min(1)),
  analysisStatus: z.literal("FAILED"),
  typeLabel: z.string().catch(""),
  difficulty: flexibleDifficulty,
  difficultyRationale: z.string().catch(""),
  explanation: z.string().catch(""),
  intent: z.string().catch(""),
  examPoint: z.string().catch(""),
  keyConcepts: optionalStringArray,
  solvingStrategy: z.string().catch(""),
  trapDesign: z.preprocess(
    (v) => (v == null ? undefined : v),
    z.array(trapDesignSchema).optional(),
  ),
});

export const questionAnalysisSchema = z.preprocess((value) => {
  // analysisStatus 를 판별자로 정규화 — 누락/드리프트는 OK 로(기존 catch("OK") 계승).
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const raw = String((value as Record<string, unknown>).analysisStatus ?? "").toUpperCase();
    return { ...(value as Record<string, unknown>), analysisStatus: raw === "FAILED" ? "FAILED" : "OK" };
  }
  return value;
}, z.discriminatedUnion("analysisStatus", [questionAnalysisOkSchema, questionAnalysisFailedSchema]));

// ── E1c: ExamLevelAnalysis ──────────────────────────────────────────────────

export const examLevelAnalysisSchema = z.object({
  overview: z.string().min(1),
  difficultyProfile: z.object({
    easy: optionalStringArray,
    medium: optionalStringArray,
    hard: optionalStringArray,
    killer: optionalStringArray,
  }),
  typeDistribution: z
    .array(
      z.object({
        typeLabel: z.preprocess(normalizeTypeLabel, z.string()),
        numbers: optionalStringArray,
        points: z.preprocess(
          (v) => (typeof v === "number" ? v : Number(String(v).match(/-?\d+(?:\.\d+)?/)?.[0] ?? 0)),
          z.number(),
        ),
      }),
    )
    .catch([]),
  trapOverview: z.string().catch(""),
  scopeInference: z.string().catch(""),
});

export const examAnalysisResultSchema = z.object({
  perQuestion: z.array(questionAnalysisSchema),
  examLevel: examLevelAnalysisSchema.nullable().catch(null),
});

// ── E2: 답안 판독 ────────────────────────────────────────────────────────────

/** E2 LLM 응답 셀(학생 판독) — source/reviewed/aiRead 조립은 student-read.ts */
const readCellSchema = z.object({
  number: z.preprocess((v) => String(v ?? "").trim(), z.string().min(1)),
  status: z.enum(["CORRECT", "WRONG", "PARTIAL", "UNKNOWN"]).catch("UNKNOWN"),
  chosenChoice: flexibleChoice,
  writtenAnswer: optionalTrimmedString,
  gradedMark: optionalTrimmedString,
  earnedPoints: flexibleNullableNumber.optional(),
  confidence: confidenceSchema.catch("MEDIUM"),
  evidence: optionalTrimmedString,
});

export const readUncertaintySchema = z.object({
  number: z.preprocess((v) => String(v ?? "").trim(), z.string().min(1)),
  question: z.string().catch(""),
  kind: questionKindSchema,
});

/** E2 답안 판독 LLM 응답(학생당 1콜). */
export const studentReadLlmSchema = z.object({
  responses: z.array(readCellSchema),
  uncertainties: z.array(readUncertaintySchema).catch([]),
});

// ── 학생 응답(저장본) ────────────────────────────────────────────────────────

const aiReadSchema = z.object({
  chosenChoice: flexibleChoice,
  writtenAnswer: optionalTrimmedString,
  gradedMark: optionalTrimmedString,
  confidence: confidenceSchema.catch("MEDIUM"),
  evidence: optionalTrimmedString,
});

export const studentResponseSchema = z.object({
  number: z.string().min(1),
  status: z.enum(["CORRECT", "WRONG", "PARTIAL", "UNKNOWN"]).catch("UNKNOWN"),
  chosenChoice: flexibleChoice,
  earnedPoints: z.preprocess((v) => (v == null ? undefined : v), z.number().optional()),
  note: optionalTrimmedString,
  studentAnswer: optionalTrimmedString,
  source: z.enum(["MANUAL", "AUTO"]).catch("MANUAL"),
  reviewed: z.boolean().catch(true),
  aiRead: z.preprocess((v) => (v == null ? undefined : v), aiReadSchema.optional()),
});

export const studentResponsesSchema = z.array(studentResponseSchema);

export const scoreSummarySchema = z.object({
  totalScore: z.number().nullable(),
  maxScore: z.number().nullable(),
  correctCount: z.number(),
  wrongCount: z.number(),
  partialCount: z.number(),
  unknownCount: z.number(),
  classAverage: z.number().nullable().optional(),
  gradeBand: z.string().nullable().optional(),
});

export const examReviewStateSchema = z
  .object({
    mapConfirmed: z.boolean().optional(),
    confirmedNumbers: z.array(z.string()).optional(),
  })
  .catch({});

export const examAiMetaSchema = z
  .object({
    model: z.string().optional(),
    calls: z.number().optional(),
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    durationMs: z.number().optional(),
    runStartedAt: z.number().optional(),
    failedNumbers: z.array(z.string()).optional(),
    refundedCredits: z.number().optional(),
    progress: z
      .preprocess(
        (v) => (v == null ? undefined : v),
        z
          .object({
            completed: z.number(),
            total: z.number(),
            msPerQuestion: z.number().optional(),
            updatedAt: z.number().optional(),
          })
          .optional(),
      )
      .catch(undefined),
    paidFullRun: z.boolean().optional(),
    autoResumeRounds: z.number().optional(),
  })
  .catch({});

const readAiMetaSchema = z.object({
  model: z.string().optional(),
  calls: z.number().optional(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  durationMs: z.number().optional(),
});

export const readStateSchema = z
  .object({
    status: z.enum(["NONE", "READING", "READ", "FAILED"]).catch("NONE"),
    readRuns: z.preprocess((v) => (typeof v === "number" ? v : 0), z.number()).catch(0),
    readAt: z.string().nullable().optional(),
    model: z.string().optional(),
    uncertainties: z.array(readUncertaintySchema).catch([]),
    aiMeta: readAiMetaSchema.optional(),
    error: z.string().optional(),
  })
  .catch({ status: "NONE", readRuns: 0, uncertainties: [] });

// ── DB Json 파스 헬퍼 (관대 — 손상 시 null/기본값) ─────────────────────────

export function parseExamMap(value: unknown): ExamMap | null {
  const parsed = examMapSchema.safeParse(value);
  return parsed.success ? (parsed.data as ExamMap) : null;
}

/**
 * D1-a: 항목 단위 관용 파싱. perQuestion 을 항목별로 safeParse 해 불량 항목만 드롭하고
 * 나머지(특히 누적된 OK)는 보존한다 — 배열 전체 safeParse 는 한 항목 불량으로 null 을
 * 반환해 체크포인트 병합 베이스가 빈 배열로 리셋되고, 누적 OK 가 소실돼 분석이 영구
 * 미수렴(진동)한다. value 자체가 객체/perQuestion 배열이 아니면(=prior 없음) null.
 */
export function parseExamAnalysisResult(value: unknown): ExamAnalysisResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.perQuestion)) return null;
  const perQuestion: QuestionAnalysis[] = [];
  for (const item of obj.perQuestion) {
    const parsed = questionAnalysisSchema.safeParse(item);
    if (parsed.success) perQuestion.push(parsed.data as QuestionAnalysis);
    // 불량 항목만 드롭 — 전체 null 리셋 금지(누적 OK 보존).
  }
  return { perQuestion, examLevel: parseExamLevelAnalysis(obj.examLevel) };
}

export function parseExamLevelAnalysis(value: unknown): ExamLevelAnalysis | null {
  const parsed = examLevelAnalysisSchema.safeParse(value);
  return parsed.success ? (parsed.data as ExamLevelAnalysis) : null;
}

export function parseQuestionAnalyses(value: unknown): QuestionAnalysis[] {
  const parsed = z.array(questionAnalysisSchema).safeParse(value);
  return parsed.success ? (parsed.data as QuestionAnalysis[]) : [];
}

export function parseStudentResponses(value: unknown): StudentResponse[] {
  const parsed = studentResponsesSchema.safeParse(value);
  return parsed.success ? (parsed.data as StudentResponse[]) : [];
}

export function parseScoreSummary(value: unknown): ScoreSummary | null {
  const parsed = scoreSummarySchema.safeParse(value);
  return parsed.success ? (parsed.data as ScoreSummary) : null;
}

export function parseExamReviewState(value: unknown): ExamReviewState {
  const parsed = examReviewStateSchema.safeParse(value);
  return parsed.success ? (parsed.data as ExamReviewState) : {};
}

export function parseExamAiMeta(value: unknown): ExamAiMeta {
  const parsed = examAiMetaSchema.safeParse(value);
  return parsed.success ? (parsed.data as ExamAiMeta) : {};
}

export function parseReadState(value: unknown): ReadState {
  const parsed = readStateSchema.safeParse(value);
  return parsed.success
    ? (parsed.data as ReadState)
    : { status: "NONE", readRuns: 0, uncertainties: [] };
}

// ── 스토리지 경로 검증 (경로 트래버설·임의 키 차단) ─────────────────────────

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 시험지 페이지 스토리지 키가 이 분석 전용 프리픽스의 '정확한' 형식과 일치하는지 검증.
 * storage.ts examReportPageKey 레이아웃과 동일:
 *   {academyId}/exam-reports/{analysisId}/pages/NNNN.(jpg|jpeg|png)
 * startsWith 프리픽스 검사는 '{prefix}../../..' 로 상위 경로를 뚫을 수 있으므로,
 * academyId/analysisId 를 이스케이프한 앵커드 정규식으로 강제한다.
 * source-urls(서명 발급)·analyze(경로 수용) 라우트가 이 단일 정규식을 공유한다.
 */
export function isExamReportPagePath(
  path: string,
  academyId: string,
  analysisId: string,
): boolean {
  const pattern = new RegExp(
    `^${escapeRegExp(academyId)}/exam-reports/${escapeRegExp(analysisId)}/pages/\\d{4}\\.(?:jpg|jpeg|png)$`,
  );
  return pattern.test(path);
}
