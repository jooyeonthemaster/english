// ============================================================================
// Tutor Activity Type — Single Source of Truth (SSOT)
// ----------------------------------------------------------------------------
// 모든 type ↔ form ↔ AI채점 여부의 단일 정의처. 기존에 player / engine / emulator /
// generator에 흩어져 drift하던 인라인 Set을 전부 이 파일에서 import 하도록 통합한다.
// type을 추가할 때 ACTIVITY_FORM에 등록만 하면 채점·계약·렌더가 자동 동작한다.
// (재설계 스펙: docs/tutor-mobile-activity-redesign-spec.md §3.1)
// ============================================================================

export const TUTOR_ACTIVITY_TYPES = [
  // vocab
  "vocab_choice",
  "contextual_meaning",
  "vocab_collocation",
  "vocab_confusable",
  "vocab_synonym",
  "vocab_form",
  "vocab_match",
  "vocab_spell",
  // interpret
  "chunk_reading",
  "sentence_translate",
  "structure_role",
  "gist_select",
  "title_select",
  "paraphrase_mc",
  "blank_infer",
  // order
  "sentence_order",
  "insertion_point",
  "irrelevant_sentence",
  "connector_select",
  // memorize
  "sentence_rebuild",
  "chunk_rebuild",
  "progressive_cloze",
  "first_letter_recall",
  // transfer
  "structure_transform",
  "conditional_writing",
  // grammar
  "grammar_judge",
  "grammar_error_span",
  "grammar_correct",
  // mastery
  "mastery_test",
] as const;

export type TutorActivityType = (typeof TUTOR_ACTIVITY_TYPES)[number];

export const TUTOR_ACTIVITY_TYPE_SET: ReadonlySet<string> = new Set(TUTOR_ACTIVITY_TYPES);

export function isTutorActivityType(value: string): value is TutorActivityType {
  return TUTOR_ACTIVITY_TYPE_SET.has(value);
}

// ── form: 렌더러·채점기가 분기하는 입력 형태 ────────────────────────────────
export const ACTIVITY_FORM = {
  CHOICE: [
    "vocab_choice",
    "contextual_meaning",
    "vocab_collocation",
    "vocab_confusable",
    "vocab_synonym",
    "structure_role",
    "gist_select",
    "title_select",
    "paraphrase_mc",
    "blank_infer",
    "connector_select",
    "grammar_judge",
    "insertion_point",
    "irrelevant_sentence",
    "mastery_test",
  ],
  CHIP: ["chunk_reading", "sentence_order", "sentence_rebuild", "chunk_rebuild"],
  MATCH: ["vocab_match"],
  SPAN: ["grammar_error_span"],
  TEXT: [
    "sentence_translate",
    "vocab_spell",
    "vocab_form",
    "progressive_cloze",
    "first_letter_recall",
    "grammar_correct",
    "structure_transform",
    "conditional_writing",
  ],
} as const satisfies Record<string, readonly TutorActivityType[]>;

export type ActivityForm = keyof typeof ACTIVITY_FORM;

// 빌드타임 exhaustive 검증: 어떤 type이 form에 누락되면 컴파일 실패.
type FormMemberUnion = (typeof ACTIVITY_FORM)[ActivityForm][number];
type _MissingFromForm = Exclude<TutorActivityType, FormMemberUnion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _exhaustiveFormCheck: _MissingFromForm extends never ? true : never = true;

const FORM_OF = new Map<TutorActivityType, ActivityForm>();
(Object.entries(ACTIVITY_FORM) as [ActivityForm, readonly TutorActivityType[]][]).forEach(
  ([form, types]) => types.forEach((type) => FORM_OF.set(type, form)),
);

export function formOf(type: string): ActivityForm | null {
  return FORM_OF.get(type as TutorActivityType) ?? null;
}

// ── 채점 라우팅 ─────────────────────────────────────────────────────────────
// AI(Gemini) 채점이 필요한 자유서술 유형. 그 외는 rule(결정적) 채점.
export const AI_GRADED_TYPES: ReadonlySet<TutorActivityType> = new Set<TutorActivityType>([
  "sentence_translate",
  "structure_transform",
  "grammar_correct", // hybrid: rule 1차 후 AI 보정
  "conditional_writing",
]);

export function requiresAiGrade(type: string): boolean {
  return AI_GRADED_TYPES.has(type as TutorActivityType);
}

export const RUBRIC_VERSION = 1;
export const PAYLOAD_SCHEMA_VERSION = 2;

// ── legacy(v1) type → v2 type 어댑터 ───────────────────────────────────────
// 死 4종 및 이름이 바뀐 유형을 무중단 전환하기 위한 매핑. 기배포 활동을 읽을 때
// adaptLegacyPayload가 이 표로 type을 치환한 뒤 payload를 v2 union으로 정규화한다.
export const LEGACY_TYPE_ADAPTERS: Record<string, TutorActivityType> = {
  grammar_binary: "grammar_judge",
  transfer_mini_passage: "conditional_writing",
  back_translation: "sentence_translate", // 한→영 死 → AI 직독직해로 흡수
  dictogloss: "sentence_rebuild", // 받아쓰기 死 → 통문장 재배열로 흡수
};

export function canonicalActivityType(type: string): TutorActivityType | null {
  if (isTutorActivityType(type)) return type;
  return LEGACY_TYPE_ADAPTERS[type] ?? null;
}
