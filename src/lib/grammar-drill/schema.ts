// ============================================================================
// 어법 드릴 — 콘텐츠 zod 스키마 (저작 게이트의 결정론 계약)
//
// src/data/grammar-drill/*.json 은 이 스키마를 통과해야만 번들에 실린다.
// scripts/verify-grammar-drill-bundle.ts 가 소비. 저작 에이전트의 출력 형식
// 오류를 빌드 전에 전량 반려하는 1차 게이트다(정답성 검증은 블라인드 풀이
// 게이트가 담당 — 여기서는 구조·마크업·분포만).
// ============================================================================

import { z } from "zod";

const BLANK_RE = /\{\{blank\}\}/g;
const NUM_UNDERLINE_RE = /\[\[([1-9]):((?:(?!\]\]).)+)\]\]/g;
const SINGLE_UNDERLINE_RE = /\[\[u:((?:(?!\]\]).)+)\]\]/g;

export function countBlanks(text: string): number {
  return (text.match(BLANK_RE) ?? []).length;
}

export function numberedUnderlines(text: string): { n: number; token: string }[] {
  const out: { n: number; token: string }[] = [];
  for (const m of text.matchAll(NUM_UNDERLINE_RE)) {
    out.push({ n: Number(m[1]), token: m[2] });
  }
  return out;
}

export function singleUnderlines(text: string): string[] {
  return [...text.matchAll(SINGLE_UNDERLINE_RE)].map((m) => m[1]);
}

// PART 0 기초 유닛(b01~b07, 개념 최대 c5)까지 포용한다 — docs/study-os-spec.md §2.
const unitIdSchema = z.string().regex(/^[ub](0[1-9]|1[0-2])$/);
const conceptIdSchema = z.string().regex(/^[ub](0[1-9]|1[0-2])-c[1-5]$/);
const difficultySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

/** 합니다체 검사 — 해설·힌트가 해요체로 새는 것을 기계적으로 걸러낸다. */
const HAEYO_RE = /(해요|예요|이에요|돼요|되요|줘요|봐요|아요|어요|죠)[.!?\s”"')\]]*$/;
export function violatesHamnida(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return HAEYO_RE.test(trimmed);
}

const koreanProse = z
  .string()
  .min(4)
  .refine((s) => !violatesHamnida(s), {
    message: "합니다체 위반(해요체 어미 감지)",
  });

const itemBaseShape = {
  // ls = 레슨에서 추출된 문항(scripts/build-lesson-items.ts)
  id: z
    .string()
    .regex(/^([ub](0[1-9]|1[0-2])|mx[1-3])-(c[1-5]-)?(ch|ox|mu|ps|wf|wc|ls)-\d{3}$/),
  unitId: unitIdSchema,
  conceptId: conceptIdSchema,
  difficulty: difficultySchema,
  trapTags: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(6),
  hints: z.tuple([koreanProse, koreanProse]),
  explanation: koreanProse.and(z.string().min(20)),
};

export const choiceItemSchema = z
  .object({
    ...itemBaseShape,
    type: z.literal("CHOICE"),
    stem: z.string().min(10),
    options: z.array(z.string().min(1)).min(2).max(3),
    answer: z.number().int().min(0),
    translation: z.string().min(4),
  })
  .refine((v) => countBlanks(v.stem) === 1, {
    message: "stem에는 {{blank}}가 정확히 1개 있어야 합니다",
  })
  .refine((v) => v.answer < v.options.length, {
    message: "answer 인덱스가 options 범위를 벗어났습니다",
  })
  .refine((v) => new Set(v.options.map((o) => o.trim().toLowerCase())).size === v.options.length, {
    message: "options에 중복이 있습니다",
  });

export const oxItemSchema = z
  .object({
    ...itemBaseShape,
    type: z.literal("OX"),
    sentence: z.string().min(10),
    isCorrect: z.boolean(),
    correction: z.string().min(1).optional(),
    translation: z.string().min(4),
  })
  .refine((v) => singleUnderlines(v.sentence).length === 1, {
    message: "sentence에는 [[u:...]] 밑줄이 정확히 1개 있어야 합니다",
  })
  .refine((v) => v.isCorrect || Boolean(v.correction), {
    message: "isCorrect=false면 correction이 필요합니다",
  });

export const multiUnderlineItemSchema = z
  .object({
    ...itemBaseShape,
    type: z.literal("MULTI_UNDERLINE"),
    text: z.string().min(40),
    underlineCount: z.number().int().min(3).max(5),
    answer: z.number().int().min(1).max(5),
    correction: z.string().min(1),
    rationales: z.array(koreanProse).min(3).max(5),
  })
  .refine(
    (v) => {
      const marks = numberedUnderlines(v.text);
      const nums = marks.map((m) => m.n).sort((a, b) => a - b);
      return (
        marks.length === v.underlineCount &&
        nums.every((n, i) => n === i + 1)
      );
    },
    { message: "밑줄 마커가 [[1:]]~[[N:]] 연속이어야 합니다" },
  )
  .refine((v) => v.rationales.length === v.underlineCount, {
    message: "rationales 길이가 underlineCount와 같아야 합니다",
  })
  .refine((v) => v.answer <= v.underlineCount, {
    message: "answer가 밑줄 개수를 벗어났습니다",
  });

export const passageItemSchema = z
  .object({
    ...itemBaseShape,
    type: z.literal("PASSAGE"),
    directive: z.string().min(6),
    text: z.string().min(300),
    answer: z.number().int().min(1).max(5),
    correction: z.string().min(1),
    rationales: z.array(koreanProse).length(5),
    underlineUnits: z.array(unitIdSchema).length(5),
    gist: z.string().min(6),
  })
  .refine(
    (v) => {
      const marks = numberedUnderlines(v.text);
      const nums = marks.map((m) => m.n).sort((a, b) => a - b);
      return marks.length === 5 && nums.join(",") === "1,2,3,4,5";
    },
    { message: "지문에는 [[1:]]~[[5:]] 밑줄이 정확히 1개씩 있어야 합니다" },
  )
  .refine(
    (v) => {
      const words = v.text.replace(NUM_UNDERLINE_RE, "$2").split(/\s+/).filter(Boolean);
      return words.length >= 80 && words.length <= 190;
    },
    { message: "지문 길이는 80~190단어(수능 29번 체급)여야 합니다" },
  );

export const writeFormItemSchema = z
  .object({
    ...itemBaseShape,
    type: z.literal("WRITE_FORM"),
    stem: z.string().min(10),
    given: z.string().min(1),
    acceptedAnswers: z.array(z.string().min(1)).min(1).max(6),
    translation: z.string().min(4),
  })
  .refine((v) => countBlanks(v.stem) === 1, {
    message: "stem에는 {{blank}}가 정확히 1개 있어야 합니다",
  });

export const writeCorrectItemSchema = z
  .object({
    ...itemBaseShape,
    type: z.literal("WRITE_CORRECT"),
    sentence: z.string().min(10),
    wrong: z.string().min(1),
    acceptedAnswers: z.array(z.string().min(1)).min(1).max(6),
    translation: z.string().min(4),
  })
  .refine(
    (v) => {
      const u = singleUnderlines(v.sentence);
      return u.length === 1 && u[0] === v.wrong;
    },
    { message: "[[u:...]] 밑줄 토큰이 wrong 필드와 일치해야 합니다" },
  )
  .refine(
    (v) =>
      !v.acceptedAnswers.some(
        (a) => a.trim().toLowerCase() === v.wrong.trim().toLowerCase(),
      ),
    { message: "acceptedAnswers에 틀린 표면형(wrong)이 들어 있습니다" },
  );

export const grammarItemSchema = z.union([
  choiceItemSchema,
  oxItemSchema,
  multiUnderlineItemSchema,
  passageItemSchema,
  writeFormItemSchema,
  writeCorrectItemSchema,
]);

// ── 개념 카드 ────────────────────────────────────────────────────────────────

const conceptExampleSchema = z.object({
  en: z.string().min(6),
  ko: z.string().min(2),
  note: z.string().optional(),
});

export const conceptSchema = z.object({
  id: conceptIdSchema,
  unitId: unitIdSchema,
  order: z.number().int().min(1).max(4),
  title: z.string().min(2),
  oneLiner: koreanProse,
  algorithm: z.array(koreanProse).min(2).max(5),
  rules: z
    .array(
      z.object({
        rule: koreanProse,
        examples: z.array(conceptExampleSchema).min(1).max(2),
      }),
    )
    .min(2)
    .max(5),
  traps: z
    .array(
      z.object({
        title: z.string().min(2),
        body: koreanProse,
        example: conceptExampleSchema.optional(),
      }),
    )
    .min(1)
    .max(4),
  confusableWith: z.array(conceptIdSchema).max(4),
});

// ── 데이터 파일 래퍼 ─────────────────────────────────────────────────────────

export const conceptsFileSchema = z.object({
  unitId: unitIdSchema,
  concepts: z.array(conceptSchema).min(3).max(4),
});

export const itemsFileSchema = z.object({
  unitId: unitIdSchema,
  bank: z.enum(["choice", "support", "reading"]),
  items: z.array(grammarItemSchema).min(1),
});

export const mixedSetFileSchema = z.object({
  setId: z.enum(["set1", "set2", "final"]),
  title: z.string().min(2),
  /** 이 세트가 커버하는 유닛 범위 */
  unitScope: z.array(unitIdSchema).min(2),
  items: z.array(passageItemSchema).min(8).max(14),
});

export type ConceptsFile = z.infer<typeof conceptsFileSchema>;
export type ItemsFile = z.infer<typeof itemsFileSchema>;
export type MixedSetFile = z.infer<typeof mixedSetFileSchema>;
