// ============================================================================
// Tutor Activity Payload — form별 discriminated union (zod v4)
// ----------------------------------------------------------------------------
// payload↔플레이어 "계약"의 단일 정의. 생성기는 이 스키마를 통과한 payload만 저장하고,
// 렌더러/채점기는 form/variant로 분기한다. 렌더 안 되는 드롭 필드가 남지 않도록
// 모든 표시 필드를 명시한다. (스펙: docs/tutor-mobile-activity-redesign-spec.md §3.2)
// ============================================================================

import { z } from "zod";

// ── 공유 토크나이저 (생성기·SPAN 정합·rule 채점이 동일 사용 → R4 드리프트 방지) ──
export function normalizeForCompare(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSpan(value: string): string[] {
  return String(value ?? "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

// ── 공통 ────────────────────────────────────────────────────────────────────
export const PassagePolicySchema = z.enum(["visible", "assist", "hidden_hintable", "hidden_memorize"]);
export type PassagePolicy = z.infer<typeof PassagePolicySchema>;

export const HintStageSchema = z.object({
  stage: z.number().int().min(1),
  kind: z.enum(["first_letter", "length", "korean_gloss", "context_window", "structure", "narrow_options"]),
  label: z.string(),
  cost: z.number().min(0).max(1),
  // 단서만 담는다. 정답 문자열을 절대 넣지 않는다(서버에서 검증).
  reveal: z.unknown().optional(),
});
export type HintStage = z.infer<typeof HintStageSchema>;

const BaseShape = {
  prompt: z.string().min(1),
  instruction: z.string().optional(),
  hint: z.string().optional(),
  passagePolicy: PassagePolicySchema.default("visible"),
  hintPenalty: z.number().min(0).max(1).default(0.2),
  hints: z.array(HintStageSchema).optional(),
  refKey: z.string().optional(),
  recallStage: z.number().int().min(1).max(4).optional(),
  source: z
    .object({
      sentenceIndex: z.number().int().min(0).optional(),
      sentenceIndices: z.array(z.number().int().min(0)).optional(),
    })
    .optional(),
  explanation: z.string().optional(),
};

// ── CHOICE ───────────────────────────────────────────────────────────────────
const OptionSchema = z.union([
  z.string().min(1),
  z.object({
    label: z.string().min(1),
    before: z.string().optional(),
    after: z.string().optional(),
  }),
]);

export const ChoicePayloadSchema = z.object({
  form: z.literal("CHOICE"),
  variant: z.enum(["plain", "stem", "insertion", "marked_passage", "order_paragraphs"]).default("plain"),
  stem: z.string().optional(),
  targetSentence: z.string().optional(),
  markedPassage: z.string().optional(),
  markers: z.array(z.object({ no: z.number().int(), text: z.string() })).optional(),
  paragraphs: z.array(z.object({ label: z.string(), text: z.string() })).optional(),
  options: z.array(OptionSchema).min(2).max(5),
  correctIndex: z.number().int().min(0),
  wrongOptionExplanations: z.array(z.string()).optional(),
  ...BaseShape,
});

// ── CHIP (시퀀스 채점) ─────────────────────────────────────────────────────────
export const ChipPayloadSchema = z.object({
  form: z.literal("CHIP"),
  variant: z.enum(["rebuild", "order", "chunk_reading"]),
  chips: z.array(z.object({ id: z.number().int().min(0), text: z.string().min(1) })).min(2).max(30),
  correctOrder: z.array(z.number().int().min(0)),
  answerText: z.string().optional(),
  ...BaseShape,
});

// ── MATCH ──────────────────────────────────────────────────────────────────────
export const MatchPayloadSchema = z.object({
  form: z.literal("MATCH"),
  pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) })).min(2).max(8),
  ...BaseShape,
});

// ── SPAN (TAP_SPAN) ────────────────────────────────────────────────────────────
export const SpanPayloadSchema = z.object({
  form: z.literal("SPAN"),
  variant: z.enum(["grammar_error"]).default("grammar_error"),
  spanTokens: z.array(z.string().min(1)).min(2),
  correctSpan: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  // 정합 검증 기준(원본 오류 구간). 학생에게는 toStudentPayload에서 제거된다.
  textFragment: z.string().min(1),
  ...BaseShape,
});

// ── TEXT ───────────────────────────────────────────────────────────────────────
export const TextPayloadSchema = z.object({
  form: z.literal("TEXT"),
  variant: z.enum(["translate", "cloze", "first_letter", "spell", "derive", "correct", "transform", "conditional"]),
  inputMode: z.enum(["short", "long"]).default("short"),
  firstLetter: z.string().optional(),
  length: z.number().int().min(1).optional(),
  firstLetterChips: z.array(z.string()).optional(),
  transformType: z.string().optional(),
  conditions: z.array(z.string()).optional(),
  scaffold: z.string().optional(),
  gradeMode: z.enum(["rule_exact", "ai", "hybrid"]),
  acceptedAnswers: z.array(z.string()).optional(),
  modelAnswer: z.string().optional(),
  rubric: z.array(z.string()).optional(),
  // grammar_correct 복붙 판별 기준(오류 포함 원문).
  sentenceWithError: z.string().optional(),
  ...BaseShape,
});

// ── 교차검증을 union 레벨 superRefine으로 (zod v4: 멤버는 순수 ZodObject 유지) ──
export const TutorActivityPayloadSchema = z
  .discriminatedUnion("form", [
    ChoicePayloadSchema,
    ChipPayloadSchema,
    MatchPayloadSchema,
    SpanPayloadSchema,
    TextPayloadSchema,
  ])
  .superRefine((payload, ctx) => {
    if (payload.form === "CHOICE") {
      if (payload.correctIndex >= payload.options.length) {
        ctx.addIssue({ code: "custom", message: "correctIndex out of range", path: ["correctIndex"] });
      }
      if (payload.variant === "marked_passage" && !payload.markers?.length) {
        ctx.addIssue({ code: "custom", message: "marked_passage requires markers[]", path: ["markers"] });
      }
      if (payload.variant === "order_paragraphs" && (payload.paragraphs?.length ?? 0) < 2) {
        ctx.addIssue({ code: "custom", message: "order_paragraphs requires paragraphs[]", path: ["paragraphs"] });
      }
    } else if (payload.form === "CHIP") {
      const ids = payload.chips.map((chip) => chip.id);
      const idSet = new Set(ids);
      if (idSet.size !== payload.chips.length) {
        ctx.addIssue({ code: "custom", message: "chip ids must be unique", path: ["chips"] });
      }
      if (payload.correctOrder.length !== payload.chips.length) {
        ctx.addIssue({ code: "custom", message: "correctOrder must cover all chips", path: ["correctOrder"] });
      }
      if (payload.correctOrder.some((id) => !idSet.has(id)) || new Set(payload.correctOrder).size !== payload.correctOrder.length) {
        ctx.addIssue({ code: "custom", message: "correctOrder must be a permutation of chip ids", path: ["correctOrder"] });
      }
    } else if (payload.form === "SPAN") {
      const [start, end] = payload.correctSpan;
      if (start > end || end >= payload.spanTokens.length) {
        ctx.addIssue({ code: "custom", message: "correctSpan out of range", path: ["correctSpan"] });
        return;
      }
      // 선택 구간 토큰을 합쳐 정규화하면 textFragment 정규화와 일치해야 한다.
      const joined = normalizeForCompare(payload.spanTokens.slice(start, end + 1).join(" "));
      const fragment = normalizeForCompare(payload.textFragment);
      if (joined !== fragment) {
        ctx.addIssue({
          code: "custom",
          message: `span/textFragment mismatch: "${joined}" != "${fragment}"`,
          path: ["correctSpan"],
        });
      }
    }
  });

export type TutorActivityPayload = z.infer<typeof TutorActivityPayloadSchema>;
export type ChoicePayload = z.infer<typeof ChoicePayloadSchema>;
export type ChipPayload = z.infer<typeof ChipPayloadSchema>;
export type MatchPayload = z.infer<typeof MatchPayloadSchema>;
export type SpanPayload = z.infer<typeof SpanPayloadSchema>;
export type TextPayload = z.infer<typeof TextPayloadSchema>;

export function parseTutorActivityPayload(payload: unknown) {
  return TutorActivityPayloadSchema.safeParse(payload);
}
