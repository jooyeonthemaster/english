// ============================================================================
// AI 응답 전용 스키마 — 객관식 (MC)
// 지문 전체 복사 필드를 제거하고, surroundingText 등으로 대체.
// 서버가 원본 지문을 기반으로 최종 지문을 재구성함.
// ============================================================================

import { z } from "zod";
import {
  aiWrongOptionExplanationsSchema,
  buildAiWrongOptionExplanationsSchema,
} from "./question-wrong-option-explanations";

// AI variants for schemas that do not need passage reconstruction.
import {
  contentMatchSchema,
  buildSummaryCompleteMcSchema,
  mainIdeaSchema,
  sentenceOrderSchema,
  summaryCompleteMcSchema,
  titleSchema,
  topicSchema,
  topicMainIdeaSchema,
} from "./question-schemas-mc";

export type {
  ContentMatchQuestion as AiContentMatchQuestion,
  SentenceOrderQuestion as AiSentenceOrderQuestion,
  TitleQuestion as AiTitleQuestion,
  SummaryCompleteMcQuestion as AiSummaryCompleteMcQuestion,
  TopicMainIdeaQuestion as AiTopicMainIdeaQuestion,
} from "./question-schemas-mc";

// ---------------------------------------------------------------------------
// Shared definitions
// ---------------------------------------------------------------------------

const optionSchema = z.object({
  label: z.string().describe("선지 라벨 (기본 ①~⑤, 무관한 문장은 요청한 개수까지 가능)"),
  text: z.string().describe("선지 내용"),
});

const sentenceInsertOptionSchema = z.object({
  label: z.enum(["1", "2", "3", "4", "5"]).describe("삽입 위치 label"),
  text: z.enum(["①", "②", "③", "④", "⑤"]).describe("삽입 위치 마커. label과 같은 순서로 ①~⑤만 사용"),
});

const commonFields = {
  direction: z.string().describe("발문 (한국어)"),
  correctAnswer: z.string().describe("정답 라벨"),
  explanation: z.string().describe("정답 해설 (한국어, 상세)"),
  keyPoints: z.array(z.string()).describe("학습 포인트 3개 이상"),
  tags: z.array(z.string()).describe("관련 태그 (한국어)"),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]).describe("난이도"),
};

const mcWrongExplanations = {
  wrongOptionExplanations: aiWrongOptionExplanationsSchema,
};

const GRAMMAR_POINT_CODES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"] as const;
const GRAMMAR_LABELS = ["(A)", "(B)", "(C)", "(D)", "(E)", "(F)", "(G)", "(H)", "(I)", "(J)"] as const;

const grammarMarkedExpressionSchema = z.object({
  label: z.string().describe("(A)~(J) 라벨"),
  expression: z
    .string()
    .describe(
      "원문에서 밑줄 칠 '최소 문법 단위' — 그 자리의 어법 판단을 결정하는 핵심 토큰만. 수능 어법 밑줄은 보통 1~3단어(최대 4단어). 동사/준동사/분사/관계사/대명사/형용사·부사 등 판단 대상 토큰과 그것을 어법적으로 묶는 최소 수식어까지만 포함한다. ⚠️ 절 전체(주어+정동사+목적어), 문장 전체, 등위로 이어진 두 동사구를 통째로 밑줄 치지 마라 — 예: 'these digital platforms create a trusting environment'(X, 절 전체) → 'create'(O, 동사 1개). 이 문자열의 길이가 곧 화면 밑줄 길이다.",
    ),
  isError: z.boolean().describe("이 표현이 오류인지 여부"),
  correction: z.string().optional().describe("오류인 경우 올바른 표현 (expression과 동일한 최소 단위)"),
  errorExpression: z
    .string()
    .describe(
      "지문에 표시할 어법 오류 표현. isError=true일 때는 expression의 어간을 유지하고 형태만 틀리게 변형한 같은 길이의 최소 단위(품사 변경·단어 추가 금지), isError=false일 때는 expression과 동일. expression과 같은 최소 span 규칙을 따른다 — 절/문장 통째 금지.",
    ),
  surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
  pointCode: z
    .enum(GRAMMAR_POINT_CODES)
    .describe(
      "이 위치의 어법 출제 포인트 코드. 가능한 한 서로 다른 코드를 사용. (a)정·준동사 (b)관계사 (c)분사능수동 (d)수일치 (e)능수동태 (f)형부자리 (g)대명사 (h)목적격보어 (i)병렬 (j)가정법 (k)to-v/v-ing (l)전치사vs.접속사 (m)비교구문",
    ),
});

const grammarWrongOptionExplanationSchema = z.object({
  label: z.string().describe("정답이 아닌 선지 label 중 하나 ('(A)'~'(J)' 형식)"),
  expression: z
    .string()
    .describe(
      "이 label의 markedExpression.expression 값과 완전히 동일해야 함. 다른 단어를 쓰면 안 됨.",
    ),
  pointCode: z
    .enum(GRAMMAR_POINT_CODES)
    .describe("이 label의 markedExpression.pointCode 값과 동일해야 함."),
  explanation: z
    .string()
    .describe(
      "이 위치의 expression이 어법상 왜 맞는지 한국어 1~2문장 해설. 반드시 markedExpression.expression을 인용하여 설명할 것.",
    ),
});

export const aiSentenceOrderSchema = sentenceOrderSchema.extend(mcWrongExplanations);
export const aiTopicMainIdeaSchema = topicMainIdeaSchema.extend(mcWrongExplanations);
export const aiTopicSchema = topicSchema.extend(mcWrongExplanations);
export const aiMainIdeaSchema = mainIdeaSchema.extend(mcWrongExplanations);
export const aiTitleSchema = titleSchema.extend(mcWrongExplanations);
export const aiContentMatchSchema = contentMatchSchema.extend(mcWrongExplanations);
export const aiSummaryCompleteMcSchema = summaryCompleteMcSchema.extend(mcWrongExplanations);

export function buildAiContentMatchSchema(optionCount: number, answerCount = 1) {
  const optionN = Math.min(12, Math.max(5, Math.round(optionCount)));
  const answerN = Math.min(optionN, Math.max(1, Math.round(answerCount)));
  const labels = Array.from({ length: optionN }, (_, index) => String(index + 1));
  const labelSchema = z.enum(labels as [string, ...string[]]);

  return z.object({
    ...commonFields,
    correctAnswer: z
      .string()
      .describe(
        answerN > 1
          ? `Correct labels joined by comma + space. Exactly ${answerN} labels from ${labels.join(", ")}.`
          : `Single correct label from ${labels.join(", ")}.`,
      ),
    correctAnswers:
      answerN > 1
        ? z
            .array(labelSchema)
            .length(answerN)
            .describe(`Exactly ${answerN} correct labels`)
        : z.array(labelSchema).length(1).optional(),
    matchType: z.enum(["일치", "불일치"]).describe("일치 또는 불일치 문제"),
    options: z
      .array(optionSchema.extend({ label: labelSchema }))
      .length(optionN)
      .describe(`${optionN} English statement options`),
    wrongOptionExplanations: buildAiWrongOptionExplanationsSchema(optionN - answerN),
  });
}

// ---------------------------------------------------------------------------
// 1. 빈칸 추론 (BLANK_INFERENCE)
// ---------------------------------------------------------------------------

export const aiBlankInferenceSchema = z.object({
  ...commonFields,
  originalExpression: z.string().describe("원문에서 빈칸으로 교체할 정확한 표현 (원문 그대로, 한 글자도 변경 금지)"),
  surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
  blankAnswerMode: z
    .enum(["SOURCE_EXACT", "PARAPHRASE", "DOUBLE_NEGATIVE"])
    .optional()
    .describe("빈칸 정답 구성 방식 (PARAPHRASE는 빈칸 변형 설정이 있을 때)"),
  answerLogic: z.string().optional().describe("부정-부정 빈칸 등 특수 정답 논리 설명"),
  options: z.array(optionSchema).length(5).describe("5개 선지"),
  ...mcWrongExplanations,
});
export type AiBlankInferenceQuestion = z.infer<typeof aiBlankInferenceSchema>;

// Multi-blank combination variant ((A)/(B)/(C) blanks + five blank-value
// combination options). The single-blank schema above stays untouched.
const MULTI_BLANK_LABELS = ["(A)", "(B)", "(C)"] as const;

export function buildAiMultiBlankInferenceSchema(blankCount: number) {
  const count = Math.min(3, Math.max(2, Math.round(blankCount)));
  const labels = MULTI_BLANK_LABELS.slice(0, count);
  const labelsText = labels.join(", ");
  const labelSchema = z.enum(labels as unknown as [string, ...string[]]);
  return z.object({
    ...commonFields,
    blanks: z
      .array(
        z.object({
          label: labelSchema.describe(`빈칸 라벨. ${labelsText} 순서대로 지문 등장 순.`),
          originalExpression: z
            .string()
            .describe("원문에서 이 빈칸으로 교체할 정확한 표현 (원문 그대로, 한 글자도 변경 금지)"),
          surroundingText: z
            .string()
            .describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용, 원문 그대로 복사)"),
        }),
      )
      .length(count)
      .describe(`빈칸 정의. 정확히 ${count}개, 서로 다른 문장에서 선택.`),
    options: z
      .array(
        z.object({
          label: z.string().describe('선지 라벨 "1"~"5"'),
          text: z
            .string()
            .describe('blankValues를 " …… "로 연결한 표시 텍스트'),
          blankValues: z
            .array(z.string())
            .length(count)
            .describe(`각 빈칸(${labelsText})에 들어갈 값. 정확히 ${count}개, 라벨 순서대로.`),
        }),
      )
      .length(5)
      .describe("조합 선지 5개. 정답 선지의 blankValues는 원문 표현과 정확히 일치."),
    ...mcWrongExplanations,
  });
}

// ---------------------------------------------------------------------------
// 2. 어법 판단 (GRAMMAR_ERROR)
// ---------------------------------------------------------------------------

// GRAMMAR_ERROR 한정: 다른 유형에 영향 없도록 commonFields/mcWrongExplanations를 인라인 오버라이드
// - correctAnswer: enum 강제 (괄호 포맷 보장)
// - markedExpressions[i].pointCode: 어법 출제 포인트 코드 (a~m), 5개 unique 강제 가이드
// - wrongOptionExplanations: array 형태로 변경 (label·expression·pointCode 일치 강제), 후처리에서 Record로 변환
export const aiGrammarErrorSchema = z.object({
  ...commonFields,
  correctAnswer: z
    .string()
    .describe("정답 label. 복수 정답이면 '(A), (C)'처럼 comma + space로 연결"),
  correctAnswers: z
    .array(z.string())
    .min(1)
    .max(10)
    .optional()
    .describe("복수 정답 지원용 정답 label 배열. correctAnswer와 같은 label들을 담음."),
  markedExpressions: z.array(grammarMarkedExpressionSchema).min(5).max(10).describe("밑줄 표시할 5~10개 표현"),
  options: z.array(optionSchema).min(5).max(10).describe("5~10개 선지"),
  wrongOptionExplanations: z
    .array(grammarWrongOptionExplanationSchema)
    .min(0)
    .max(9)
    .describe(
      "정답을 제외한 오답 위치 각각에 대한 해설 (label·expression·pointCode가 markedExpressions와 일치). 후처리에서 Record<label, explanation> 형태로 변환됨.",
    ),
});
export type AiGrammarErrorQuestion = z.infer<typeof aiGrammarErrorSchema>;

export function buildAiGrammarErrorSchema(markerCount: number, answerCount = 1) {
  const count = Math.min(10, Math.max(5, Math.round(markerCount)));
  const answers = Math.min(count, Math.max(1, Math.round(answerCount)));
  const wrongCount = count - answers;
  const labels = GRAMMAR_LABELS.slice(0, count).join(" ");
  return z.object({
    ...commonFields,
    correctAnswer: z
      .string()
      .describe(`정답 label들을 comma + space로 연결. 사용 가능한 label: ${labels}. 정확히 ${answers}개 label이어야 함.`),
    correctAnswers: z
      .array(z.string())
      .length(answers)
      .describe(`정답 label 배열. 정확히 ${answers}개이며, 모든 isError=true label과 정확히 일치해야 함.`),
    markedExpressions: z
      .array(grammarMarkedExpressionSchema)
      .length(count)
      .describe(`밑줄 표시할 표현. 정확히 ${count}개를 생성해야 함.`),
    options: z
      .array(optionSchema)
      .length(count)
      .describe(`선지. 정확히 ${count}개를 생성해야 함.`),
    wrongOptionExplanations: z
      .array(grammarWrongOptionExplanationSchema)
      .length(wrongCount)
      .describe(`정답이 아닌 모든 label에 대한 해설. 항목 수는 정확히 ${wrongCount}개여야 함.`),
  });
}

// ---------------------------------------------------------------------------
// 2-1. 네모 어법 (GRAMMAR_CHOICE_COMBO)
// 지문 안 (A)/(B)/(C) 세 네모에 [후보1 / 후보2] 2지선일을 제시하고,
// 5지선다에서 세 네모 모두 올바른 표현인 조합 하나를 고르는 유형.
// 선지는 다중빈칸(buildAiMultiBlankInferenceSchema)의 조합 선지 구조를 따름.
// ---------------------------------------------------------------------------

const GRAMMAR_COMBO_SLOT_LABELS = ["(A)", "(B)", "(C)"] as const;

const grammarComboSlotSchema = z.object({
  label: z
    .enum(GRAMMAR_COMBO_SLOT_LABELS)
    .describe("네모 라벨. (A), (B), (C) 순서대로 지문 등장 순."),
  correctExpression: z
    .string()
    .describe("원문에서의 올바른 표현 (원문 그대로, 한 글자도 변경 금지)"),
  wrongExpression: z
    .string()
    .describe("이 네모에 함께 제시할 틀린 표현. correctExpression을 pointCode의 어법 포인트에 따라 의도적으로 변형한 형태로, correctExpression과 달라야 함."),
  surroundingText: z
    .string()
    .describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용, 원문 그대로 복사)"),
  pointCode: z
    .enum(GRAMMAR_POINT_CODES)
    .describe(
      "이 네모의 어법 출제 포인트 코드. 세 네모는 서로 다른 코드를 사용. (a)정·준동사 (b)관계사 (c)분사능수동 (d)수일치 (e)능수동태 (f)형부자리 (g)대명사 (h)목적격보어 (i)병렬 (j)가정법 (k)to-v/v-ing (l)전치사vs.접속사 (m)비교구문",
    ),
});

export const aiGrammarChoiceComboSchema = z.object({
  ...commonFields,
  correctAnswer: z
    .string()
    .describe('정답 선지 label ("1"~"5" 중 하나). 세 네모가 모두 correctExpression인 유일한 조합.'),
  slots: z
    .array(grammarComboSlotSchema)
    .length(3)
    .describe("네모 정의. 정확히 3개, 서로 다른 문장에서 선택, 서로 다른 pointCode."),
  options: z
    .array(
      z.object({
        label: z.string().describe('선지 라벨 "1"~"5"'),
        text: z.string().describe('slotValues를 " - "로 연결한 표시 텍스트'),
        slotValues: z
          .array(z.string())
          .length(3)
          .describe(
            "각 네모 (A), (B), (C)에서 고른 표현. 정확히 3개, 라벨 순서대로. 각 값은 해당 네모의 correctExpression 또는 wrongExpression과 정확히 일치해야 함.",
          ),
      }),
    )
    .length(5)
    .describe("조합 선지 5개. 정확히 1개만 세 네모 모두 correctExpression인 조합이고, 같은 조합은 반복 금지."),
  ...mcWrongExplanations,
});
export type AiGrammarChoiceComboQuestion = z.infer<typeof aiGrammarChoiceComboSchema>;

// ---------------------------------------------------------------------------
// 3. 어휘 적절성 (VOCAB_CHOICE)
// ---------------------------------------------------------------------------

const VOCAB_CHOICE_LABELS = ["(a)", "(b)", "(c)", "(d)", "(e)", "(f)", "(g)", "(h)", "(i)", "(j)"] as const;

const vocabMarkedWordSchema = z.object({
  label: z.string().describe("(a)~(j) 라벨 (요청한 개수만큼 순서대로)"),
  originalWord: z.string().describe("원문에 실제로 존재하는 올바른 단어. isInappropriate=true여도 원문 정답 단어를 넣음"),
  isInappropriate: z.boolean().describe("이 위치에 부적절한 단어를 넣을지 여부"),
  betterWord: z.string().optional().describe("부적절한 경우 적절한 단어 (= originalWord)"),
  substituteWord: z.string().describe("지문에 표시할 단어. isInappropriate=true일 때는 원문 단어를 대체할 부적절한 단어, false일 때는 originalWord와 동일"),
  surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
});

const vocabDisplayModeField = {
  vocabDisplayMode: z
    .enum(["SOURCE_EXACT", "SYNONYM_VARIANT"])
    .optional()
    .describe(
      "SYNONYM_VARIANT이면 정답이 아닌 밑줄 단어도 substituteWord에 원문과 다른 문맥상 적절한 동의어를 넣어 표시(지문 암기 무력화). 미지정/SOURCE_EXACT이면 기존 방식(정답 외 단어는 원문 그대로).",
    ),
};

export const aiVocabChoiceSchema = z.object({
  ...commonFields,
  markedWords: z.array(vocabMarkedWordSchema).length(5).describe("밑줄 표시할 5개 어휘"),
  options: z.array(optionSchema).length(5).describe("5개 선지"),
  ...vocabDisplayModeField,
  ...mcWrongExplanations,
});
export type AiVocabChoiceQuestion = z.infer<typeof aiVocabChoiceSchema>;

export function buildAiVocabChoiceSchema(markerCount: number, answerCount = 1) {
  const count = Math.min(10, Math.max(5, Math.round(markerCount)));
  const answers = Math.min(count, Math.max(1, Math.round(answerCount)));
  const labels = VOCAB_CHOICE_LABELS.slice(0, count).join(" ");
  return z.object({
    ...commonFields,
    correctAnswer: z
      .string()
      .describe(
        answers > 1
          ? `정답 label들을 comma + space로 연결. 사용 가능한 label: ${labels}. 정확히 ${answers}개 label이어야 함.`
          : `정답 label 하나. 사용 가능한 label: ${labels}.`,
      ),
    correctAnswers:
      answers > 1
        ? z
            .array(z.string())
            .length(answers)
            .describe(`정답 label 배열. 정확히 ${answers}개이며, 모든 isInappropriate=true label과 정확히 일치해야 함.`)
        : z.array(z.string()).length(1).optional(),
    markedWords: z
      .array(vocabMarkedWordSchema)
      .length(count)
      .describe(`밑줄 표시할 어휘. 정확히 ${count}개를 생성해야 함.`),
    options: z
      .array(optionSchema)
      .length(count)
      .describe(`선지. 정확히 ${count}개를 생성해야 함.`),
    ...vocabDisplayModeField,
    wrongOptionExplanations: buildAiWrongOptionExplanationsSchema(count - answers),
  });
}

// ---------------------------------------------------------------------------
// 4. 문장 삽입 (SENTENCE_INSERT)
// ---------------------------------------------------------------------------

export const aiSentenceInsertSchema = z.object({
  ...commonFields,
  sourceSentenceToOmit: z.string().optional().describe("If givenSentence is copied or transformed from a source passage sentence, copy the original source sentence here so the server can remove it from the displayed passage."),
  givenSentence: z
    .string()
    .describe(
      "삽입할 문장. 지시어/정관사/연결사/시간·인과 순서/어휘사슬 중 최소 1개의 응집 단서를 포함해야 함(단서 없는 중립 문장 금지).",
    ),
  markerAfterSentenceIndices: z.array(z.number()).length(5).describe("①~⑤ 마커를 배치할 위치 (0-based: 'N번째 문장 뒤에 마커 삽입'). 5개 인덱스 배열, 오름차순"),
  options: z.array(sentenceInsertOptionSchema).length(5).describe("삽입 위치 선지. text는 반드시 ①, ②, ③, ④, ⑤"),
  // CoT 효과로 정답 위치 정합성을 높이기 위한 선택 필드(.optional 로 생성 안정성 유지).
  insertionRationale: z
    .string()
    .optional()
    .describe(
      "정답 위치에서 앞 문장과의 연결(앞 고리)과 뒤 문장과의 연결(뒤 고리)이 어떻게 동시에 성립하는지 1~2문장 한국어 근거.",
    ),
  // 함정 게이트: 오답 위치별 '유혹 단서 1개 + 결정적 결함 1개'를 데이터로 받아 검증에 사용.
  distractorTraps: z
    .array(
      z.object({
        gapLabel: z.string().describe("오답 gap 라벨 '1'~'5' (정답 제외)"),
        temptingClue: z.string().describe("이 자리가 그럴듯해 보이는 유혹 단서(예: 같은 키워드 반복, 연결사 외형)"),
        fatalFlaw: z.string().describe("이 자리가 정답이 될 수 없는 결정적 결함(끊기는 고리: 선행사 부재/뒤 고리 단절/연결사 논리 불일치 등)"),
      }),
    )
    .max(4)
    .optional()
    .describe("오답 위치별 함정 근거 4개. 각 fatalFlaw 는 서로 달라야 함"),
  ...mcWrongExplanations,
});
export type AiSentenceInsertQuestion = z.infer<typeof aiSentenceInsertSchema>;

export function buildAiSentenceInsertSchema(slotCount: number) {
  const count = Math.min(8, Math.max(5, Math.round(slotCount)));
  const labels = Array.from({ length: count }, (_, index) => String(index + 1));
  const circled = Array.from({ length: count }, (_, index) =>
    String.fromCodePoint(0x2460 + index),
  );
  const dynamicOptionSchema = z.object({
    label: z.enum(labels as [string, ...string[]]).describe("삽입 위치 label"),
    text: z
      .enum(circled as [string, ...string[]])
      .describe(`삽입 위치 마커. label과 같은 순서로 ①~${circled[count - 1]}만 사용`),
  });
  return aiSentenceInsertSchema.extend({
    markerAfterSentenceIndices: z
      .array(z.number())
      .length(count)
      .describe(
        `①~${circled[count - 1]} 마커를 배치할 위치 (0-based: 'N번째 문장 뒤에 마커 삽입'). 정확히 ${count}개 인덱스 배열, 오름차순·중복 금지`,
      ),
    options: z
      .array(dynamicOptionSchema)
      .length(count)
      .describe(`삽입 위치 선지. 정확히 ${count}개, text는 반드시 ①~${circled[count - 1]}`),
    distractorTraps: z
      .array(
        z.object({
          gapLabel: z.string().describe(`오답 gap 라벨 '1'~'${count}' (정답 제외)`),
          temptingClue: z.string().describe("이 자리가 그럴듯해 보이는 유혹 단서(예: 같은 키워드 반복, 연결사 외형)"),
          fatalFlaw: z.string().describe("이 자리가 정답이 될 수 없는 결정적 결함(끊기는 고리: 선행사 부재/뒤 고리 단절/연결사 논리 불일치 등)"),
        }),
      )
      .max(count - 1)
      .optional()
      .describe(`오답 위치별 함정 근거 ${count - 1}개. 각 fatalFlaw 는 서로 달라야 함`),
    // The default schema fixes wrong-option explanations at 4 (5 gaps - 1 answer).
    wrongOptionExplanations: buildAiWrongOptionExplanationsSchema(count - 1),
  });
}

// ---------------------------------------------------------------------------
// 5. 무관한 문장 (IRRELEVANT)
// ---------------------------------------------------------------------------

// Default IRRELEVANT schema (5 slots). Teacher may override slot count via
// IRRELEVANT.slotCount setting; use `buildAiIrrelevantSchema(n)` then.
export const aiIrrelevantSchema = z.object({
  ...commonFields,
  sentences: z.array(z.string()).min(5).max(5).describe("정확히 5개 문장: 원문 4문장(지문 전체에 분산, 원래 순서 유지) + 삽입 무관문 1개. 5개를 초과하지 마세요."),
  irrelevantIndex: z.number().min(1).max(3).describe("무관한 문장의 인덱스 (1~3 → 정답 ②③④, 첫/마지막 금지)"),
  options: z.array(optionSchema).min(5).max(5).describe("선지 5개 (서버에서 숫자 마커로 재생성)"),
  ...mcWrongExplanations,
});
export type AiIrrelevantQuestion = z.infer<typeof aiIrrelevantSchema>;

export function buildAiIrrelevantSchema(slotCount: number) {
  const n = Math.max(5, Math.round(slotCount));
  // NOTE: keep schema permissive (min 5, max n) — strict `.length(n)` makes
  // Gemini 3.5 Flash unstable for n > 5. The exact n is enforced in prompt +
  // post-process instead.
  return z.object({
    ...commonFields,
    sentences: z.array(z.string()).min(5).max(n).describe(`표시할 ${n}개 문장. 원문 ${n - 1}개 문장은 그대로 보존하고 AI 무관문 1개만 삽입`),
    irrelevantIndex: z.number().min(1).max(n - 2).describe(`무관한 문장의 인덱스 (1~${n - 2}, 첫/마지막 금지)`),
    options: z.array(optionSchema).min(5).max(n).describe(`${n}개 선지`),
    wrongOptionExplanations: buildAiWrongOptionExplanationsSchema(n - 1),
  });
}

// ---------------------------------------------------------------------------
// 6. 지칭 추론 (REFERENCE)
// ---------------------------------------------------------------------------

export const aiReferenceSchema = z.object({
  ...commonFields,
  underlinedPronoun: z.string().describe("밑줄 칠 대명사"),
  surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
  options: z.array(optionSchema).length(5).describe("한국어 선택지"),
  ...mcWrongExplanations,
});
export type AiReferenceQuestion = z.infer<typeof aiReferenceSchema>;

// ---------------------------------------------------------------------------
// 7. 함축 의미 추론 (IMPLIED_MEANING)
// ---------------------------------------------------------------------------

export const aiImpliedMeaningSchema = z.object({
  ...commonFields,
  underlinedExpression: z
    .string()
    .describe("원문에서 밑줄 칠 정확한 구, 절, 또는 문장. 사전식 단일 단어가 아니라 문맥상 함축을 담은 표현이어야 함."),
  surroundingText: z
    .string()
    .describe("밑줄 표현을 포함하는 원문 그대로의 주변 텍스트 40~80자. 동일 표현이 반복될 수 있으므로 반드시 포함."),
  surfaceMeaning: z
    .string()
    .describe("밑줄 표현을 문자 그대로 읽었을 때의 표면 의미. 한국어로 작성."),
  impliedMeaning: z
    .string()
    .describe("정답 선택지가 나타내는 핵심 함축 의미. 한국어로 작성."),
  reasoningGap: z
    .string()
    .describe("표면 의미와 실제 함축 의미 사이의 거리, 즉 어떤 문맥 단서 때문에 깊은 의미로 이동해야 하는지 한국어로 설명."),
  evidenceChain: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe("정답을 뒷받침하는 지문 근거 흐름. 한국어 2~4단계."),
  options: z
    .array(optionSchema)
    .length(5)
    .describe("영어 함축 의미 선택지. 한글을 포함하면 안 됨."),
  ...mcWrongExplanations,
});
export type AiImpliedMeaningQuestion = z.infer<typeof aiImpliedMeaningSchema>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const AI_MC_QUESTION_SCHEMAS: Record<string, z.ZodType> = {
  BLANK_INFERENCE: aiBlankInferenceSchema,
  GRAMMAR_ERROR: aiGrammarErrorSchema,
  GRAMMAR_CHOICE_COMBO: aiGrammarChoiceComboSchema,
  VOCAB_CHOICE: aiVocabChoiceSchema,
  SENTENCE_ORDER: aiSentenceOrderSchema,
  SENTENCE_INSERT: aiSentenceInsertSchema,
  TOPIC: aiTopicSchema,
  MAIN_IDEA: aiMainIdeaSchema,
  TOPIC_MAIN_IDEA: aiTopicMainIdeaSchema,
  TITLE: aiTitleSchema,
  IMPLIED_MEANING: aiImpliedMeaningSchema,
  REFERENCE: aiReferenceSchema,
  CONTENT_MATCH: aiContentMatchSchema,
  SUMMARY_COMPLETE_MC: aiSummaryCompleteMcSchema,
  IRRELEVANT: aiIrrelevantSchema,
};

// ---------------------------------------------------------------------------
// Combined registry (MC + Vocab)
// ---------------------------------------------------------------------------

import {
  AI_VOCAB_QUESTION_SCHEMAS,
  aiContextMeaningSchema,
  aiSynonymSchema,
  buildAiAntonymSchema,
} from "./question-ai-schemas-vocab";
import {
  conditionalWritingSchema,
  sentenceTransformSchema,
  fillBlankKeySchema,
  summaryCompleteSchema,
  buildSummaryCompleteSchema,
  summaryWritingSchema,
  buildSummaryWritingSchema,
  wordOrderSchema,
  grammarCorrectionSchema,
} from "./question-schemas-essay";

const AI_ESSAY_QUESTION_SCHEMAS: Record<string, z.ZodType> = {
  CONDITIONAL_WRITING: conditionalWritingSchema,
  SENTENCE_TRANSFORM: sentenceTransformSchema,
  FILL_BLANK_KEY: fillBlankKeySchema,
  SUMMARY_COMPLETE: summaryCompleteSchema,
  SUMMARY_WRITING: summaryWritingSchema,
  WORD_ORDER: wordOrderSchema,
  GRAMMAR_CORRECTION: grammarCorrectionSchema,
};

export const AI_QUESTION_SCHEMAS: Record<string, z.ZodType> = {
  ...AI_MC_QUESTION_SCHEMAS,
  ...AI_VOCAB_QUESTION_SCHEMAS,
  ...AI_ESSAY_QUESTION_SCHEMAS,
};

// ---------------------------------------------------------------------------
// Generic option-count variants — free-text option types where the visible
// option count is a tunable parameter (default 5). The base schema's options
// field is replaced with an exact-length array.
// ---------------------------------------------------------------------------

const GENERIC_OPTION_COUNT_BASE_SCHEMAS: Record<string, z.ZodObject> = {
  TOPIC: aiTopicSchema,
  MAIN_IDEA: aiMainIdeaSchema,
  TOPIC_MAIN_IDEA: aiTopicMainIdeaSchema,
  TITLE: aiTitleSchema,
  IMPLIED_MEANING: aiImpliedMeaningSchema,
  CONTEXT_MEANING: aiContextMeaningSchema,
  SYNONYM: aiSynonymSchema,
};

export function buildAiGenericOptionCountSchema(
  typeId: string,
  optionCount: number,
  answerCount = 1,
) {
  const base = GENERIC_OPTION_COUNT_BASE_SCHEMAS[typeId];
  if (!base) throw new Error(`Type does not support a generic option count: ${typeId}`);
  const count = Math.min(8, Math.max(4, Math.round(optionCount)));
  const answers = Math.min(count - 1, Math.max(1, Math.round(answerCount)));
  const labels = Array.from({ length: count }, (_, index) => String(index + 1));
  const labelSchema = z.enum(labels as [string, ...string[]]);
  const baseOptionsDescription =
    (base.shape.options as z.ZodType | undefined)?.description ?? "선택지";
  return base.extend({
    correctAnswer: z
      .string()
      .describe(
        answers > 1
          ? `정답 label들을 comma + space로 연결. 사용 가능한 label: ${labels.join(", ")}. 정확히 ${answers}개 label이어야 함.`
          : `정답 label 하나. 사용 가능한 label: ${labels.join(", ")}.`,
      ),
    correctAnswers:
      answers > 1
        ? z
            .array(labelSchema)
            .length(answers)
            .describe(`정답 label 배열. 정확히 ${answers}개.`)
        : z.array(labelSchema).length(1).optional(),
    options: z
      .array(optionSchema)
      .length(count)
      .describe(`${baseOptionsDescription} — label "1"~"${count}", 정확히 ${count}개를 생성해야 함.`),
    // The default schema fixes wrong-option explanations at 4 (5 options - 1 answer).
    wrongOptionExplanations: buildAiWrongOptionExplanationsSchema(count - answers),
  });
}

export function getAiResponseSchema(
  typeId: string,
  options?: {
    irrelevantSlotCount?: number;
    grammarMarkerCount?: number;
    grammarAnswerCount?: number;
    grammarCorrectionErrorCount?: number;
    summaryCompleteMcBlankCount?: number;
    summaryCompleteBlankCount?: number;
    summaryWritingBlankCount?: number;
    contentMatchOptionCount?: number;
    contentMatchAnswerCount?: number;
    vocabChoiceMarkerCount?: number;
    vocabChoiceAnswerCount?: number;
    sentenceInsertSlotCount?: number;
    antonymPairCount?: number;
    /** 2~3 switches BLANK_INFERENCE to the multi-blank combination schema. */
    blankInferenceBlankCount?: number;
    /** Option count for free-text option types (TOPIC/TITLE/...). */
    genericOptionCount?: number;
    /** Correct-answer count for free-text option types. */
    genericAnswerCount?: number;
    /** Legacy option name; interpreted as grammarMarkerCount. */
    grammarErrorCount?: number;
  },
) {
  let schema = AI_QUESTION_SCHEMAS[typeId];
  if (!schema) throw new Error(`Unknown AI question type: ${typeId}`);
  if (typeId === "GRAMMAR_ERROR") {
    const grammarMarkerCount = options?.grammarMarkerCount ?? options?.grammarErrorCount;
    const grammarAnswerCount = options?.grammarAnswerCount;
    if (
      (grammarMarkerCount && grammarMarkerCount !== 5) ||
      (grammarAnswerCount && grammarAnswerCount !== 1)
    ) {
      schema = buildAiGrammarErrorSchema(
        grammarMarkerCount ?? 5,
        grammarAnswerCount ?? 1,
      );
    }
  }
  if (typeId === "IRRELEVANT" && options?.irrelevantSlotCount && options.irrelevantSlotCount !== 5) {
    schema = buildAiIrrelevantSchema(options.irrelevantSlotCount);
  }
  if (
    typeId === "SUMMARY_COMPLETE_MC" &&
    options?.summaryCompleteMcBlankCount &&
    options.summaryCompleteMcBlankCount !== 2
  ) {
    schema = buildSummaryCompleteMcSchema(options.summaryCompleteMcBlankCount);
  }
  if (
    typeId === "SUMMARY_COMPLETE" &&
    options?.summaryCompleteBlankCount &&
    options.summaryCompleteBlankCount !== 2
  ) {
    schema = buildSummaryCompleteSchema(options.summaryCompleteBlankCount);
  }
  if (
    typeId === "SUMMARY_WRITING" &&
    options?.summaryWritingBlankCount &&
    options.summaryWritingBlankCount !== 1
  ) {
    schema = buildSummaryWritingSchema(options.summaryWritingBlankCount);
  }
  if (
    typeId === "CONTENT_MATCH" &&
    ((options?.contentMatchOptionCount && options.contentMatchOptionCount !== 5) ||
      (options?.contentMatchAnswerCount && options.contentMatchAnswerCount !== 1))
  ) {
    schema = buildAiContentMatchSchema(
      options?.contentMatchOptionCount ?? 5,
      options?.contentMatchAnswerCount ?? 1,
    );
  }
  if (
    typeId === "VOCAB_CHOICE" &&
    ((options?.vocabChoiceMarkerCount && options.vocabChoiceMarkerCount !== 5) ||
      (options?.vocabChoiceAnswerCount && options.vocabChoiceAnswerCount !== 1))
  ) {
    schema = buildAiVocabChoiceSchema(
      options?.vocabChoiceMarkerCount ?? 5,
      options?.vocabChoiceAnswerCount ?? 1,
    );
  }
  if (
    typeId === "SENTENCE_INSERT" &&
    options?.sentenceInsertSlotCount &&
    options.sentenceInsertSlotCount !== 5
  ) {
    schema = buildAiSentenceInsertSchema(options.sentenceInsertSlotCount);
  }
  if (
    typeId === "ANTONYM" &&
    options?.antonymPairCount &&
    options.antonymPairCount !== 5
  ) {
    schema = buildAiAntonymSchema(options.antonymPairCount);
  }
  if (
    typeId === "BLANK_INFERENCE" &&
    options?.blankInferenceBlankCount &&
    options.blankInferenceBlankCount >= 2
  ) {
    schema = buildAiMultiBlankInferenceSchema(options.blankInferenceBlankCount);
  }
  if (
    GENERIC_OPTION_COUNT_BASE_SCHEMAS[typeId] &&
    ((options?.genericOptionCount && options.genericOptionCount !== 5) ||
      (options?.genericAnswerCount && options.genericAnswerCount !== 1))
  ) {
    schema = buildAiGenericOptionCountSchema(
      typeId,
      options?.genericOptionCount ?? 5,
      options?.genericAnswerCount ?? 1,
    );
  }
  return z.object({ questions: z.array(schema) });
}
