// ============================================================================
// NARA ERP — Structured Question Type Schemas
// ============================================================================
// Each question type has:
// 1. A metadata definition (typeId, category, label, includesPassage, etc.)
// 2. A Zod schema the AI must conform to
// 3. A per-type AI prompt template
// ============================================================================

import { z } from "zod";

// ---------------------------------------------------------------------------
// 1. Question type metadata
// ---------------------------------------------------------------------------

export type QuestionCategory = "객관식" | "서술형" | "어휘";

export interface QuestionTypeMeta {
  typeId: string;
  category: QuestionCategory;
  label: string;
  /** true = the question card renders its own (possibly modified) passage.
   *  false = the passage is already visible on the page; no need to repeat it. */
  includesPassage: boolean;
  /** Short description of what makes this type special */
  description: string;
}

export const QUESTION_TYPE_META: Record<string, QuestionTypeMeta> = {
  // ── 수능/모의고사 객관식 ──────────────────────────────────
  BLANK_INFERENCE: {
    typeId: "BLANK_INFERENCE",
    category: "객관식",
    label: "빈칸 추론",
    includesPassage: true, // passage is modified (blank inserted)
    description: "지문의 핵심 표현을 빈칸으로 만들어 추론하게 하는 문제",
  },
  GRAMMAR_ERROR: {
    typeId: "GRAMMAR_ERROR",
    category: "객관식",
    label: "어법 판단",
    includesPassage: true, // passage has (A)~(E) underlined markers
    description: "밑줄 친 5개 부분 중 어법상 틀린 것을 찾는 문제",
  },
  VOCAB_CHOICE: {
    typeId: "VOCAB_CHOICE",
    category: "객관식",
    label: "어휘 적절성",
    includesPassage: true, // passage has (a)~(e) underlined vocab
    description: "밑줄 친 어휘 중 문맥상 적절하지 않은 것을 찾는 문제",
  },
  SENTENCE_ORDER: {
    typeId: "SENTENCE_ORDER",
    category: "객관식",
    label: "글의 순서",
    includesPassage: true, // shows given sentence + (A)(B)(C) paragraphs
    description: "주어진 글 다음에 이어질 글의 순서를 맞추는 문제",
  },
  SENTENCE_INSERT: {
    typeId: "SENTENCE_INSERT",
    category: "객관식",
    label: "문장 삽입",
    includesPassage: true, // passage has ①②③④⑤ markers
    description: "주어진 문장이 들어갈 가장 적절한 위치를 찾는 문제",
  },
  TOPIC_MAIN_IDEA: {
    typeId: "TOPIC_MAIN_IDEA",
    category: "객관식",
    label: "주제/요지",
    includesPassage: false, // original passage, already visible
    description: "글의 주제 또는 요지를 파악하는 문제",
  },
  TITLE: {
    typeId: "TITLE",
    category: "객관식",
    label: "제목 추론",
    includesPassage: false, // original passage
    description: "글의 제목을 추론하는 문제",
  },
  REFERENCE: {
    typeId: "REFERENCE",
    category: "객관식",
    label: "지칭 추론",
    includesPassage: true, // passage with underlined pronoun
    description: "밑줄 친 대명사가 가리키는 대상을 찾는 문제",
  },
  CONTENT_MATCH: {
    typeId: "CONTENT_MATCH",
    category: "객관식",
    label: "내용 일치",
    includesPassage: false, // original passage
    description: "글의 내용과 일치/불일치하는 것을 찾는 문제",
  },
  IRRELEVANT: {
    typeId: "IRRELEVANT",
    category: "객관식",
    label: "무관한 문장",
    includesPassage: true, // passage with ①~⑤ numbered sentences
    description: "전체 흐름과 관계없는 문장을 찾는 문제",
  },

  // ── 내신 서술형 ──────────────────────────────────────────
  CONDITIONAL_WRITING: {
    typeId: "CONDITIONAL_WRITING",
    category: "서술형",
    label: "조건부 영작",
    includesPassage: false,
    description: "조건에 맞게 영어 문장을 작성하는 문제",
  },
  SENTENCE_TRANSFORM: {
    typeId: "SENTENCE_TRANSFORM",
    category: "서술형",
    label: "문장 전환",
    includesPassage: false,
    description: "주어진 문장을 조건에 맞게 전환하는 문제",
  },
  FILL_BLANK_KEY: {
    typeId: "FILL_BLANK_KEY",
    category: "서술형",
    label: "핵심 표현 빈칸",
    includesPassage: true, // shows sentence/passage with blank
    description: "핵심 표현의 빈칸을 채우는 문제",
  },
  SUMMARY_COMPLETE: {
    typeId: "SUMMARY_COMPLETE",
    category: "서술형",
    label: "요약문 완성",
    includesPassage: false,
    description: "요약문의 빈칸을 완성하는 문제",
  },
  WORD_ORDER: {
    typeId: "WORD_ORDER",
    category: "서술형",
    label: "배열 영작",
    includesPassage: false,
    description: "주어진 단어를 올바른 순서로 배열하는 문제",
  },
  GRAMMAR_CORRECTION: {
    typeId: "GRAMMAR_CORRECTION",
    category: "서술형",
    label: "문법 오류 수정",
    includesPassage: false,
    description: "문법 오류를 찾아 바르게 고치는 문제",
  },

  // ── 어휘 ──────────────────────────────────────────────────
  CONTEXT_MEANING: {
    typeId: "CONTEXT_MEANING",
    category: "어휘",
    label: "문맥 속 의미",
    includesPassage: true, // passage with underlined word
    description: "밑줄 친 단어의 문맥상 의미를 찾는 문제",
  },
  SYNONYM: {
    typeId: "SYNONYM",
    category: "어휘",
    label: "동의어",
    includesPassage: false,
    description: "핵심 어휘의 동의어를 찾는 문제",
  },
  ANTONYM: {
    typeId: "ANTONYM",
    category: "어휘",
    label: "반의어",
    includesPassage: true, // passage with (A)~(E) underlined words
    description: "핵심 어휘의 반의어를 찾는 문제",
  },
};

// ---------------------------------------------------------------------------
// 2. Shared sub-schemas
// ---------------------------------------------------------------------------

const optionSchema = z.object({
  label: z.string(),
  text: z.string(),
});

const commonFields = {
  direction: z.string().describe("발문 (한국어)"),
  correctAnswer: z.string(),
  explanation: z.string().describe("정답 해설 (한국어, 상세)"),
  keyPoints: z.array(z.string()).describe("학습 포인트 3개 이상"),
  tags: z.array(z.string()).describe("관련 태그 (한국어)"),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]),
};

const mcWrongExplanations = {
  wrongOptionExplanations: z.record(z.string(), z.string()).describe("오답별 해설, key는 선지 label"),
};

// ---------------------------------------------------------------------------
// 3. Per-type Zod schemas
// ---------------------------------------------------------------------------

// ── 수능/모의고사 객관식 ────────────────────────────────────

export const blankInferenceSchema = z.object({
  ...commonFields,
  passageWithBlank: z.string().describe("빈칸(_____) 이 삽입된 지문 전체"),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type BlankInferenceQuestion = z.infer<typeof blankInferenceSchema>;

export const grammarErrorSchema = z.object({
  ...commonFields,
  passageWithMarkers: z.string().describe("(A)~(E) 밑줄 표시가 포함된 지문. 밑줄 부분은 __(A) expression__ 형태로 표시"),
  markedExpressions: z.array(z.object({
    label: z.string().describe("(A)~(E)"),
    expression: z.string().describe("해당 밑줄 표현"),
    isError: z.boolean().describe("이 표현이 오류인지"),
    correction: z.string().optional().describe("오류인 경우 올바른 표현"),
  })).length(5),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type GrammarErrorQuestion = z.infer<typeof grammarErrorSchema>;

export const vocabChoiceSchema = z.object({
  ...commonFields,
  passageWithMarkers: z.string().describe("(a)~(e) 밑줄 어휘가 포함된 지문. 밑줄 부분은 __(a) word__ 형태로 표시"),
  markedWords: z.array(z.object({
    label: z.string().describe("(a)~(e)"),
    word: z.string(),
    isInappropriate: z.boolean(),
    betterWord: z.string().optional().describe("부적절한 경우 적절한 단어"),
  })).length(5),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type VocabChoiceQuestion = z.infer<typeof vocabChoiceSchema>;

export const sentenceOrderSchema = z.object({
  ...commonFields,
  givenSentence: z.string().describe("주어진 첫 문장"),
  paragraphs: z.array(z.object({
    label: z.string().describe("(A), (B), (C)"),
    text: z.string(),
  })).length(3),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type SentenceOrderQuestion = z.infer<typeof sentenceOrderSchema>;

export const sentenceInsertSchema = z.object({
  ...commonFields,
  givenSentence: z.string().describe("삽입할 문장"),
  passageWithMarkers: z.string().describe("①~⑤ 위치 마커가 포함된 지문"),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type SentenceInsertQuestion = z.infer<typeof sentenceInsertSchema>;

export const topicMainIdeaSchema = z.object({
  ...commonFields,
  options: z.array(optionSchema).length(5).describe("한국어 선택지"),
  ...mcWrongExplanations,
});
export type TopicMainIdeaQuestion = z.infer<typeof topicMainIdeaSchema>;

export const titleSchema = z.object({
  ...commonFields,
  options: z.array(optionSchema).length(5).describe("영어 제목 선택지"),
  ...mcWrongExplanations,
});
export type TitleQuestion = z.infer<typeof titleSchema>;

export const referenceSchema = z.object({
  ...commonFields,
  passageWithUnderline: z.string().describe("밑줄 친 대명사가 포함된 지문. 밑줄 대명사는 __단어__ 형태로 표시"),
  underlinedPronoun: z.string().describe("밑줄 친 대명사"),
  options: z.array(optionSchema).length(5).describe("한국어 선택지"),
  ...mcWrongExplanations,
});
export type ReferenceQuestion = z.infer<typeof referenceSchema>;

export const contentMatchSchema = z.object({
  ...commonFields,
  matchType: z.enum(["일치", "불일치"]).describe("일치 또는 불일치 문제"),
  options: z.array(optionSchema).length(5).describe("한국어 진술문 선택지"),
  ...mcWrongExplanations,
});
export type ContentMatchQuestion = z.infer<typeof contentMatchSchema>;

export const irrelevantSchema = z.object({
  ...commonFields,
  passageWithNumbers: z.string().describe("①~⑤ 번호가 매겨진 문장들이 포함된 지문"),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type IrrelevantQuestion = z.infer<typeof irrelevantSchema>;

// ── 내신 서술형 ──────────────────────────────────────────────

export const conditionalWritingSchema = z.object({
  ...commonFields,
  referenceSentence: z.string().describe("지문에서 참조하는 문장 (밑줄 표시)"),
  conditions: z.array(z.string()).describe("작성 조건 목록 (한국어)"),
  modelAnswer: z.string().describe("모범 답안 (영어)"),
  scoringCriteria: z.array(z.string()).optional().describe("채점 기준"),
});
export type ConditionalWritingQuestion = z.infer<typeof conditionalWritingSchema>;

export const sentenceTransformSchema = z.object({
  ...commonFields,
  originalSentence: z.string().describe("전환 대상 원래 문장"),
  conditions: z.array(z.string()).describe("전환 조건 목록 (한국어)"),
  modelAnswer: z.string().describe("모범 답안 (영어)"),
  scoringCriteria: z.array(z.string()).optional().describe("채점 기준"),
});
export type SentenceTransformQuestion = z.infer<typeof sentenceTransformSchema>;

export const fillBlankKeySchema = z.object({
  ...commonFields,
  sentenceWithBlank: z.string().describe("빈칸이 포함된 문장 또는 지문"),
  answer: z.string().describe("빈칸에 들어갈 핵심 표현"),
});
export type FillBlankKeyQuestion = z.infer<typeof fillBlankKeySchema>;

export const summaryCompleteSchema = z.object({
  ...commonFields,
  summaryWithBlanks: z.string().describe("빈칸이 포함된 요약문"),
  blanks: z.array(z.object({
    label: z.string().describe("(A), (B) 등"),
    answer: z.string(),
  })),
});
export type SummaryCompleteQuestion = z.infer<typeof summaryCompleteSchema>;

export const wordOrderSchema = z.object({
  ...commonFields,
  scrambledWords: z.array(z.string()).describe("뒤섞인 단어/구 목록"),
  contextHint: z.string().optional().describe("문맥 힌트 (한국어)"),
  modelAnswer: z.string().describe("올바른 완성 문장"),
});
export type WordOrderQuestion = z.infer<typeof wordOrderSchema>;

export const grammarCorrectionSchema = z.object({
  ...commonFields,
  sentenceWithError: z.string().describe("오류가 포함된 문장"),
  errorPart: z.string().describe("오류 부분"),
  correctedPart: z.string().describe("올바르게 수정된 부분"),
  correctedSentence: z.string().describe("전체 수정된 문장"),
});
export type GrammarCorrectionQuestion = z.infer<typeof grammarCorrectionSchema>;

// ── 어휘 ────────────────────────────────────────────────────

export const contextMeaningSchema = z.object({
  ...commonFields,
  passageWithUnderline: z.string().describe("밑줄 친 단어가 포함된 지문. 밑줄 단어는 __단어__ 형태로 표시"),
  underlinedWord: z.string().describe("밑줄 친 단어"),
  options: z.array(optionSchema).length(5).describe("영어 동의어 선택지"),
  ...mcWrongExplanations,
});
export type ContextMeaningQuestion = z.infer<typeof contextMeaningSchema>;

export const synonymSchema = z.object({
  ...commonFields,
  targetWord: z.string().describe("대상 단어"),
  contextSentence: z.string().describe("문맥 문장"),
  options: z.array(optionSchema).length(5).describe("영어 동의어 선택지"),
  ...mcWrongExplanations,
});
export type SynonymQuestion = z.infer<typeof synonymSchema>;

export const antonymSchema = z.object({
  ...commonFields,
  passageWithMarkers: z.string().describe("(A)~(E) 밑줄 어휘가 포함된 지문"),
  markedWords: z.array(z.object({
    label: z.string().describe("(A)~(E)"),
    word: z.string(),
    antonym: z.string(),
  })).length(5),
  options: z.array(optionSchema).length(5).describe("단어 - 반의어 쌍 선택지"),
  ...mcWrongExplanations,
});
export type AntonymQuestion = z.infer<typeof antonymSchema>;

// ---------------------------------------------------------------------------
// 4. Schema registry — maps typeId to its Zod schema
// ---------------------------------------------------------------------------

export const QUESTION_SCHEMAS: Record<string, z.ZodType> = {
  BLANK_INFERENCE: blankInferenceSchema,
  GRAMMAR_ERROR: grammarErrorSchema,
  VOCAB_CHOICE: vocabChoiceSchema,
  SENTENCE_ORDER: sentenceOrderSchema,
  SENTENCE_INSERT: sentenceInsertSchema,
  TOPIC_MAIN_IDEA: topicMainIdeaSchema,
  TITLE: titleSchema,
  REFERENCE: referenceSchema,
  CONTENT_MATCH: contentMatchSchema,
  IRRELEVANT: irrelevantSchema,
  CONDITIONAL_WRITING: conditionalWritingSchema,
  SENTENCE_TRANSFORM: sentenceTransformSchema,
  FILL_BLANK_KEY: fillBlankKeySchema,
  SUMMARY_COMPLETE: summaryCompleteSchema,
  WORD_ORDER: wordOrderSchema,
  GRAMMAR_CORRECTION: grammarCorrectionSchema,
  CONTEXT_MEANING: contextMeaningSchema,
  SYNONYM: synonymSchema,
  ANTONYM: antonymSchema,
};

// Wrapper schema for generateObject — wraps the per-type schema in { questions: [...] }
export function getResponseSchema(typeId: string) {
  const schema = QUESTION_SCHEMAS[typeId];
  if (!schema) {
    throw new Error(`Unknown question type: ${typeId}`);
  }
  return z.object({ questions: z.array(schema) });
}

// ---------------------------------------------------------------------------
// 5. Per-type AI prompt instructions (enhanced for structured output)
// ---------------------------------------------------------------------------

export const STRUCTURED_TYPE_PROMPTS: Record<string, string> = {
  BLANK_INFERENCE: `빈칸 추론 문제를 만드세요.
- 지문에서 핵심 표현 하나를 빈칸(_____) 으로 만듭니다
- passageWithBlank: 원문을 수정하여 빈칸이 삽입된 전체 지문을 반환합니다
- 빈칸 자리에 원래 있던 표현을 정답으로, 비슷하지만 틀린 영어 표현 4개를 오답으로 구성
- options: label "1"~"5", text는 영어 표현
- direction 예시: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?"`,

  GRAMMAR_ERROR: `어법 판단 문제를 만드세요.
- 지문에서 5개 표현을 선택하고 (A)~(E) 로 마킹합니다
- 그 중 하나에 어법 오류를 삽입합니다
- passageWithMarkers: 밑줄 부분을 __(A) expression__ 형태로 표시한 전체 지문
- markedExpressions: 5개 마킹된 표현의 label, expression, isError, correction 정보
- options: label "(A)"~"(E)", text는 해당 표현
- direction 예시: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?"`,

  VOCAB_CHOICE: `어휘 적절성 문제를 만드세요.
- 지문에서 핵심 어휘 5개를 선택하고 (a)~(e) 로 마킹합니다
- 그 중 하나를 문맥상 부적절한 단어로 교체합니다
- passageWithMarkers: 밑줄 부분을 __(a) word__ 형태로 표시한 전체 지문
- markedWords: 5개 어휘의 label, word, isInappropriate, betterWord
- options: label "(a)"~"(e)", text는 해당 단어
- direction 예시: "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?"`,

  SENTENCE_ORDER: `글의 순서 문제를 만드세요.
- givenSentence: 주어진 첫 문장
- paragraphs: (A), (B), (C) 3개 단락 (label + text)
- options: 순서 조합 5개 (예: label "1", text "(A)-(C)-(B)")
- direction 예시: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?"`,

  SENTENCE_INSERT: `문장 삽입 문제를 만드세요.
- givenSentence: 삽입할 문장
- passageWithMarkers: ①②③④⑤ 위치 마커가 포함된 지문
- options: label "1"~"5", text는 "①"~"⑤"
- direction 예시: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?"`,

  TOPIC_MAIN_IDEA: `주제/요지 파악 문제를 만드세요.
- 원문 지문을 수정하지 않습니다 (지문은 별도로 표시됨)
- options: label "1"~"5", text는 한국어 주제/요지 진술문
- direction 예시: "다음 글의 요지로 가장 적절한 것은?"`,

  TITLE: `제목 추론 문제를 만드세요.
- 원문 지문을 수정하지 않습니다
- options: label "1"~"5", text는 영어 제목
- direction 예시: "다음 글의 제목으로 가장 적절한 것은?"`,

  REFERENCE: `지칭 추론 문제를 만드세요.
- passageWithUnderline: 밑줄 친 대명사가 __대명사__ 형태로 표시된 지문
- underlinedPronoun: 밑줄 친 대명사
- options: label "1"~"5", text는 한국어 지칭 대상
- direction 예시: "밑줄 친 'it'이 가리키는 것으로 가장 적절한 것은?"`,

  CONTENT_MATCH: `내용 일치/불일치 문제를 만드세요.
- matchType: "일치" 또는 "불일치"
- options: label "1"~"5", text는 한국어 진술문
- direction 예시: "다음 글의 내용과 일치하지 않는 것은?"`,

  IRRELEVANT: `무관한 문장 문제를 만드세요.
- passageWithNumbers: ①~⑤ 번호가 매겨진 문장이 포함된 지문
- 하나의 문장은 전체 흐름과 무관해야 합니다
- options: label "1"~"5", text는 "①"~"⑤"
- direction 예시: "다음 글에서 전체 흐름과 관계 없는 문장은?"`,

  CONDITIONAL_WRITING: `조건부 영작 서술형 문제를 만드세요.
- referenceSentence: 지문에서 참조하는 문장
- conditions: 조건 목록 (한국어, 예: "관계대명사를 사용할 것", "3개 이상의 단어를 활용할 것")
- modelAnswer: 모범 답안 (영어)
- correctAnswer: modelAnswer와 동일
- direction 예시: "다음 조건에 맞게 주어진 단어를 활용하여 영작하시오."`,

  SENTENCE_TRANSFORM: `문장 전환 서술형 문제를 만드세요.
- originalSentence: 전환 대상 원래 문장
- conditions: 전환 조건 (예: "수동태로 바꿀 것", "분사구문으로 전환할 것")
- modelAnswer: 모범 답안 (영어)
- correctAnswer: modelAnswer와 동일
- direction 예시: "다음 문장을 주어진 조건에 맞게 바꾸어 쓰시오."`,

  FILL_BLANK_KEY: `핵심 표현 빈칸 서술형 문제를 만드세요.
- sentenceWithBlank: 빈칸(_____) 이 포함된 문장 또는 지문 일부
- answer: 빈칸에 들어갈 핵심 표현
- correctAnswer: answer와 동일
- direction 예시: "다음 빈칸에 들어갈 알맞은 말을 본문에서 찾아 쓰시오."`,

  SUMMARY_COMPLETE: `요약문 완성 서술형 문제를 만드세요.
- summaryWithBlanks: 빈칸이 포함된 요약문 (빈칸은 (A), (B) 등으로 표시)
- blanks: 각 빈칸의 label과 answer
- correctAnswer: 빈칸 답을 "(A) answer, (B) answer" 형태로
- direction 예시: "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸에 들어갈 말을 쓰시오."`,

  WORD_ORDER: `배열 영작 서술형 문제를 만드세요.
- scrambledWords: 뒤섞인 단어/구 목록 (배열)
- contextHint: 문맥 힌트 (선택적, 한국어)
- modelAnswer: 올바르게 배열된 완성 문장
- correctAnswer: modelAnswer와 동일
- direction 예시: "주어진 단어를 올바른 순서로 배열하여 문장을 완성하시오."`,

  GRAMMAR_CORRECTION: `문법 오류 수정 서술형 문제를 만드세요.
- sentenceWithError: 오류가 포함된 문장
- errorPart: 오류 부분
- correctedPart: 수정된 부분
- correctedSentence: 전체 수정된 문장
- correctAnswer: correctedPart
- direction 예시: "다음 문장에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오."`,

  CONTEXT_MEANING: `문맥 속 어휘 의미 문제를 만드세요.
- passageWithUnderline: 밑줄 친 단어가 __단어__ 형태로 표시된 지문
- underlinedWord: 밑줄 친 단어
- options: label "1"~"5", text는 영어 동의어
- direction 예시: "밑줄 친 'conduit'과 문맥상 의미가 가장 유사한 것은?"`,

  SYNONYM: `동의어 문제를 만드세요.
- targetWord: 대상 단어
- contextSentence: 문맥 문장 (지문에서 발췌)
- options: label "1"~"5", text는 영어 동의어 선택지
- direction 예시: "다음 밑줄 친 단어의 의미와 가장 유사한 것은?"`,

  ANTONYM: `반의어 문제를 만드세요.
- passageWithMarkers: (A)~(E) 밑줄 어휘가 포함된 지문
- markedWords: 5개 어휘의 label, word, antonym
- options: label "(A)"~"(E)", text는 "word -- antonym" 형태
- direction 예시: "다음 글의 밑줄 친 단어와 반의어 관계가 올바르지 않은 것은?"`,
};

// ---------------------------------------------------------------------------
// 6. Union type for any structured question
// ---------------------------------------------------------------------------

export type StructuredQuestion =
  | ({ _typeId: "BLANK_INFERENCE" } & BlankInferenceQuestion)
  | ({ _typeId: "GRAMMAR_ERROR" } & GrammarErrorQuestion)
  | ({ _typeId: "VOCAB_CHOICE" } & VocabChoiceQuestion)
  | ({ _typeId: "SENTENCE_ORDER" } & SentenceOrderQuestion)
  | ({ _typeId: "SENTENCE_INSERT" } & SentenceInsertQuestion)
  | ({ _typeId: "TOPIC_MAIN_IDEA" } & TopicMainIdeaQuestion)
  | ({ _typeId: "TITLE" } & TitleQuestion)
  | ({ _typeId: "REFERENCE" } & ReferenceQuestion)
  | ({ _typeId: "CONTENT_MATCH" } & ContentMatchQuestion)
  | ({ _typeId: "IRRELEVANT" } & IrrelevantQuestion)
  | ({ _typeId: "CONDITIONAL_WRITING" } & ConditionalWritingQuestion)
  | ({ _typeId: "SENTENCE_TRANSFORM" } & SentenceTransformQuestion)
  | ({ _typeId: "FILL_BLANK_KEY" } & FillBlankKeyQuestion)
  | ({ _typeId: "SUMMARY_COMPLETE" } & SummaryCompleteQuestion)
  | ({ _typeId: "WORD_ORDER" } & WordOrderQuestion)
  | ({ _typeId: "GRAMMAR_CORRECTION" } & GrammarCorrectionQuestion)
  | ({ _typeId: "CONTEXT_MEANING" } & ContextMeaningQuestion)
  | ({ _typeId: "SYNONYM" } & SynonymQuestion)
  | ({ _typeId: "ANTONYM" } & AntonymQuestion);
