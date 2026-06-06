import { z } from "zod";

import {
  difficultySchema,
  generationSubTypeSchema,
  slotTypeSettingsSchema,
} from "../schemas";

// ============================================================================
// 문항별 내용 분석 스키마 (동형 재설계 — (B) 문항 단위 "내용" 분석)
// ============================================================================
// 기존 ExamPatternProfile 은 시험지 "구조"만 봤다(슬롯=번호·유형·배점). 여기서는
// 문항 하나의 실제 "내용"을 최대한 추출한다: 출제 포인트, 어떤 어법/어휘를 어떻게
// 변형했는지, 정답 논리, 보기 개수/중복정답, 그리고 동형 재현에 필요한 스펙.
// 지문은 optional — 지문 없는 문항(예: 단어쌍 5개 보기)도 다룬다.
// 공유 enum(generationSubType/difficulty/slotTypeSettings)은 재사용해 생성 엔진과
// 1:1로 매핑되게 한다.
//
// ── 견고화(generateObject "did not match schema" 방지) ──
// Google 구조화 출력은 enum 은 대체로 강제하나 숫자 min/max·문자열 max·배열 아이템
// 제약은 강제하지 않는다. 따라서 LLM 이 범위를 벗어난 값을 돌려주면 zod 전체 파싱이
// 실패해 분석 잡이 통째로 FAILED 된다. 모든 제약 leaf 에 `.catch(fallback)` 을 둬,
// 벗어난 값은 안전한 기본값으로 떨어뜨려(부분 분석이라도) 성공시킨다. enum 도 동일.
// 공유 스키마(difficulty/generationSubType/slotTypeSettings)는 수정하지 않고 사용처에서 래핑.

export const optionAnalysisSchema = z.object({
  label: z.string().max(40).catch("").default(""), // ①~⑤ / (A)~(E) / 1~5 등 원문 라벨
  text: z.string().max(4000).catch("").default(""),
  isCorrect: z.boolean().catch(false).default(false),
  // 정답이면 근거, 오답이면 왜 틀렸는지.
  rationale: z.string().max(3000).catch("").default(""),
});
export type OptionAnalysis = z.infer<typeof optionAnalysisSchema>;

const normalizedBoundingBoxSchema = z
  .object({
    // Normalized page coordinates in 0..1 fractions.
    x: z.number().min(0).max(1).catch(0).default(0),
    y: z.number().min(0).max(1).catch(0).default(0),
    width: z.number().min(0).max(1).catch(0).default(0),
    height: z.number().min(0).max(1).catch(0).default(0),
    pageIndex: z.number().int().min(0).max(20).catch(0).default(0),
    confidence: z.enum(["high", "medium", "low"]).catch("medium").default("medium"),
  })
  .nullable()
  .catch(null)
  .optional();

const questionInventoryStatusSchema = z
  .enum([
    "complete",
    "incomplete_previous",
    "incomplete_next",
    "fragment_previous",
    "fragment_next",
    "uncertain",
  ])
  .catch("uncertain")
  .default("uncertain");

export const questionInventoryItemSchema = z.object({
  label: z.string().max(120).catch("").default(""),
  questionNumber: z.number().int().min(1).max(500).nullable().catch(null).optional(),
  groupLabel: z.string().max(120).catch("").default(""),
  direction: z.string().max(1600).catch("").default(""),
  status: questionInventoryStatusSchema,
  rationale: z.string().max(1600).catch("").default(""),
  boundingBox: normalizedBoundingBoxSchema,
});
export type QuestionInventoryItem = z.infer<typeof questionInventoryItemSchema>;

const changedSpanSchema = z.object({
  from: z.string().max(800).catch("").default(""), // 원래 표현
  to: z.string().max(800).catch("").default(""), // 변형된 표현(오답/함정으로 바뀐 것)
  rule: z.string().max(600).catch("").default(""), // 적용된 규칙 (예: 주어-동사 수일치)
});

// 자유 텍스트 배열 — 아이템 제약을 느슨히(빈 문자열 허용·길이 초과는 잘라 catch),
// 배열 자체도 catch([]) 로 구조 오류 시 비운다.
const freeTextList = (maxItemLen: number, maxItems: number) =>
  z
    .array(z.string().max(maxItemLen).catch(""))
    .max(maxItems)
    .catch([])
    .default([]);

const sourceCompletenessSchema = z
  .object({
    isComplete: z.boolean().catch(true).default(true),
    requiresPreviousPage: z.boolean().catch(false).default(false),
    requiresNextPage: z.boolean().catch(false).default(false),
    missingParts: freeTextList(300, 20),
    rationale: z.string().max(1200).catch("").default(""),
  })
  .catch({
    isComplete: true,
    requiresPreviousPage: false,
    requiresNextPage: false,
    missingParts: [],
    rationale: "",
  })
  .default({
    isComplete: true,
    requiresPreviousPage: false,
    requiresNextPage: false,
    missingParts: [],
    rationale: "",
  });

export const questionAnalysisSchema = z.object({
  // ── 원본 문항 재구성 ──
  source: z
    .object({
      questionNumber: z.number().int().min(1).max(500).nullable().catch(null).optional(),
      direction: z.string().max(2000).catch("").default(""), // 발문
      passageBased: z.boolean().catch(true).default(true),
      // 지문 없는 문항(단어쌍 등)이면 null. stimulus = 문항이 의존하는 본문/자료.
      passage: z.string().max(12000).nullable().catch(null).optional(),
      options: z.array(optionAnalysisSchema).max(20).catch([]).default([]),
      optionCount: z.number().int().min(0).max(20).catch(0).default(0),
      boundingBox: normalizedBoundingBoxSchema,
      // 복수 정답 지원 — 라벨 목록으로.
      correctAnswerLabels: z.array(z.string().max(40).catch("")).max(20).catch([]).default([]),
      multipleAnswers: z.boolean().catch(false).default(false),
      originalExplanation: z.string().max(5000).catch("").default(""),
      completeness: sourceCompletenessSchema,
    }),

  // ── 분류 / 유형 ──
  classification: z
    .object({
      answerShape: z
        .enum(["MULTIPLE_CHOICE", "SHORT_ANSWER", "OTHER"])
        .catch("MULTIPLE_CHOICE")
        .default("MULTIPLE_CHOICE"),
      // 자료 형태 — 텍스트 동형 생성 가능 여부 판단용.
      // PASSAGE=읽기 지문 기반, NONE=지문 없음(어휘/보기만; 예 "단어 쌍 중 관계 다른 것"),
      // LISTENING=듣기(음성), VISUAL=도표·그래프·그림·이미지 기반, OTHER=기타.
      // LISTENING/VISUAL 은 텍스트로 동형 생성이 사실상 불가 → 생성에서 제외된다.
      stimulusKind: z
        .enum(["PASSAGE", "NONE", "LISTENING", "VISUAL", "OTHER"])
        .catch("PASSAGE")
        .default("PASSAGE"),
      // 빌트인 22유형 매칭 (없거나 풀 밖이면 null + isNovelType → generic 생성으로 라우팅).
      matchedType: generationSubTypeSchema.nullable().catch(null).optional(),
      matchConfidence: z.enum(["high", "medium", "low"]).catch("medium").default("medium"),
      // 풀에 없는 유형이면 true — 커스텀 유형 후보(보류 기능). 지금은 기록만.
      isNovelType: z.boolean().catch(false).default(false),
      noveltyNote: z.string().max(2000).catch("").default(""),
      difficulty: difficultySchema.catch("INTERMEDIATE").default("INTERMEDIATE"),
      difficultyRationale: z.string().max(2000).catch("").default(""),
      points: z.number().int().min(1).max(200).nullable().catch(null).optional(),
      // 생성 엔진 typeSettings 와 직결(어법 마커 수 등). 범위 위반 시 통째로 {} 폴백.
      typeSettings: slotTypeSettingsSchema.catch({}),
    }),

  // ── 출제 포인트(무엇을 묻는가) ──
  testingPoint: z
    .object({
      summary: z.string().max(2000).catch("").default(""),
      skills: freeTextList(160, 30),
    }),

  // ── 변형 분석(어법/어휘 등: 무엇을 어떻게 바꿔 출제했나) ──
  transformation: z
    .object({
      applied: z.boolean().catch(false).default(false),
      description: z.string().max(3000).catch("").default(""),
      rules: freeTextList(400, 30),
      changedSpans: z.array(changedSpanSchema).max(30).catch([]).default([]),
    }),

  // ── 동형 재현 스펙(생성 시 그대로 따라야 할 형식) ──
  reproductionSpec: z
    .object({
      stemFormat: z.string().max(2000).catch("").default(""),
      optionFormat: z.string().max(2000).catch("").default(""),
      answerFormat: z.string().max(1500).catch("").default(""),
      structureNotes: z.string().max(3000).catch("").default(""),
    }),

  // ── 변형 축(출제 의도 보존하며 바꿀 수 있는 부분) ──
  variationAxes: freeTextList(500, 30),

  // ── 기타 관찰/불확실 ──
  extractionNotes: freeTextList(800, 30),
});
export type QuestionAnalysis = z.infer<typeof questionAnalysisSchema>;

// ── (C) 지문-문항 그룹: 지문 1개에 문항 N개(공유 stimulus) ──
export const passageGroupAnalysisSchema = z.object({
  // 그룹이 공유하는 지문/자료. 지문없는 묶음이면 null.
  sharedStimulus: z.string().max(12000).nullable().catch(null).optional(),
  stimulusSummary: z.string().max(2000).catch("").default(""),
  questions: z.array(questionAnalysisSchema).min(1).max(30),
});
export type PassageGroupAnalysis = z.infer<typeof passageGroupAnalysisSchema>;

// 단일 문항 분석(MVP)의 최상위 응답: 문항 1개 또는 한 지문에 묶인 N개.
export const singleItemAnalysisSchema = z.object({
  inventory: z.array(questionInventoryItemSchema).max(60).catch([]).default([]),
  // 입력이 한 지문에 여러 문항이면 groups 로, 단일 문항이면 questions 1개로.
  groups: z.array(passageGroupAnalysisSchema).min(1).max(30),
});
export type SingleItemAnalysis = z.infer<typeof singleItemAnalysisSchema>;

const questionAnalysisWithoutBoundingBoxSchema = questionAnalysisSchema.extend({
  source: questionAnalysisSchema.shape.source.omit({ boundingBox: true }),
});

const questionInventoryItemWithoutBoundingBoxSchema = questionInventoryItemSchema.omit({
  boundingBox: true,
});

const passageGroupAnalysisWithoutBoundingBoxSchema = passageGroupAnalysisSchema.extend({
  questions: z.array(questionAnalysisWithoutBoundingBoxSchema).min(1).max(30),
});

export const singleItemAnalysisWithoutBoundingBoxSchema = z.object({
  inventory: z.array(questionInventoryItemWithoutBoundingBoxSchema).max(60).catch([]).default([]),
  groups: z.array(passageGroupAnalysisWithoutBoundingBoxSchema).min(1).max(30),
});
