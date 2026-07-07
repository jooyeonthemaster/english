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

// ── 필드 순서 = 생성 순서 (Wave-1 재배열) ───────────────────────────────────
// 구조화 출력 모델은 스키마 프로퍼티 순서대로 필드를 생성한다. 종전에는
// commonFields 스프레드가 맨 앞에 와서 correctAnswer/explanation 이 문항 본문
// (빈칸/밑줄/선지)보다 먼저 생성되는 역순이었다 — GRAMMAR_ERROR 대개편이 고친
// 것과 동일한 문제. MC 유형 전반을 "발문 → 콘텐츠/변형 필드 → 정답(들) →
// 오답해설 → 해설 → keyPoints → tags → difficulty" 순서로 재배열한다.
// 필드명·타입·의미는 전부 불변(선언 순서만 변경) — 렌더러 데이터 계약 무접촉.
const commonHeadFields = {
  direction: z.string().describe("발문 (한국어)"),
};

const commonAnswerField = {
  correctAnswer: z.string().describe("정답 라벨"),
};

const commonTailFields = {
  explanation: z.string().describe("정답 해설 (한국어, 상세)"),
  keyPoints: z.array(z.string()).describe("학습 포인트 3개 이상"),
  tags: z.array(z.string()).describe("관련 태그 (한국어)"),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]).describe("난이도"),
};

// 아직 재배열하지 않은 유형(GRAMMAR_CHOICE_COMBO)용 — 기존 선언 순서 그대로 유지.
const commonFields = {
  ...commonHeadFields,
  ...commonAnswerField,
  ...commonTailFields,
};

const mcWrongExplanations = {
  wrongOptionExplanations: aiWrongOptionExplanationsSchema,
};

const ORDER_HEAD_KEYS = ["direction", "blankDesign"] as const;
const ORDER_ANSWER_KEYS = ["correctAnswers", "correctAnswer"] as const;
const ORDER_TAIL_KEYS = [
  "wrongOptionExplanations",
  "explanation",
  "keyPoints",
  "tags",
  "difficulty",
] as const;

/**
 * 스키마 프로퍼티를 생성 순서로 재배열한 새 z.object 를 만든다 — 필드·zod 타입은
 * 그대로 재사용하고 선언 순서만 바꾼다. 순서: direction(·blankDesign) → 콘텐츠
 * 필드(원래 상대 순서 유지) → correctAnswers → correctAnswer →
 * wrongOptionExplanations → explanation → keyPoints → tags → difficulty.
 * 다른 파일이 소유한 베이스 스키마(question-schemas-mc/vocab)를 이 파일에서
 * 무수정으로 재배열하기 위한 장치이기도 하다.
 */
function toGenerationOrder<T extends z.ZodObject>(schema: T): T {
  const shape = schema.shape as Record<string, z.ZodType>;
  const specialKeys = new Set<string>([
    ...ORDER_HEAD_KEYS,
    ...ORDER_ANSWER_KEYS,
    ...ORDER_TAIL_KEYS,
  ]);
  const contentKeys = Object.keys(shape).filter((key) => !specialKeys.has(key));
  const orderedKeys = [
    ...ORDER_HEAD_KEYS,
    ...contentKeys,
    ...ORDER_ANSWER_KEYS,
    ...ORDER_TAIL_KEYS,
  ].filter((key) => key in shape);
  const orderedShape: Record<string, z.ZodType> = {};
  for (const key of orderedKeys) orderedShape[key] = shape[key];
  return z.object(orderedShape) as unknown as T;
}

const GRAMMAR_POINT_CODES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"] as const;
const GRAMMAR_LABELS = ["(A)", "(B)", "(C)", "(D)", "(E)", "(F)", "(G)", "(H)", "(I)", "(J)"] as const;

const grammarMarkedExpressionSchema = z.object({
  label: z.string().describe("(A)~(J) 라벨"),
  expression: z
    .string()
    .describe(
      "원문에서 밑줄 칠 '최소 문법 단위' — 그 자리의 어법 판단을 결정하는 핵심 토큰만. 수능 어법 밑줄은 보통 1~3단어, 최대 5단어. 동사/준동사/분사/관계사/대명사/형용사·부사 등 판단 대상 토큰과 그것을 어법적으로 묶는 최소 수식어까지만 포함한다. ⚠️ 절 전체(주어+정동사+목적어), 문장 전체, 등위로 이어진 두 동사구를 통째로 밑줄 치지 마라 — 예: 'these digital platforms create a trusting environment'(X, 절 전체) → 'create'(O, 동사 1개). 이 문자열의 길이가 곧 화면 밑줄 길이다.",
    ),
  isError: z.boolean().describe("이 표현이 오류인지 여부"),
  correction: z.string().optional().describe("오류인 경우 올바른 표현 (expression과 동일한 최소 단위)"),
  errorExpression: z
    .string()
    .describe(
      "지문에 표시할 어법 오류 표현. isError=true일 때는 expression의 어간을 유지하고 형태만 틀리게 변형한 비슷한 길이의 최소 단위 — 품사 변경 금지, 굴절·기능어 변형만(필요한 to/be 등 기능어 추가·삭제는 허용: interact↔to interact, because↔because of). isError=false일 때는 expression과 동일. expression과 같은 최소 span 규칙을 따른다 — 절/문장 통째 금지.",
    ),
  surroundingText: z
    .string()
    .describe(
      "이 표현이 포함된 원문 그대로의 구간 40~120자 (위치 식별 + 판단 근거 제시). 판단에 필요한 문법 의존 구간 전체 — 수일치면 진짜 주어 핵부터 동사까지, 관계사면 선행사부터 관계절까지, 분사면 의미상 주어부터, 병렬이면 첫 항목부터 — 를 반드시 포함할 것(의존 구간이 길면 80자를 넘겨도 됨). 밑줄 단어 앞뒤 몇 단어만 자르면 장거리 판단 근거가 안 보여 거부된다.",
    ),
  pointCode: z
    .enum(GRAMMAR_POINT_CODES)
    .describe(
      "이 위치의 어법 출제 포인트 코드. 가능한 한 서로 다른 코드를 사용. (a)정·준동사 (b)관계사 (c)분사능수동 (d)수일치 (e)능수동태 (f)형부자리 (g)대명사 (h)목적격보어 (i)병렬 (j)가정법 (k)to-v/v-ing (l)전치사vs.접속사 (m)비교구문",
    ),
});

// GRAMMAR_ERROR 설계 메모 필드 — markedExpressions 보다 먼저 생성되도록 스키마
// 필드 순서 상단에 배치한다(구조화 출력은 스키마 프로퍼티 순서를 따르므로
// "설계→밑줄→정답→해설" 순서를 강제하는 저비용 계획 단계). 학생에게 절대
// 노출되지 않으며 후처리(processGrammarError)가 저장 전 제거한다.
const grammarErrorDesignField = z
  .string()
  .describe(
    // ⑤~⑥ 코드 계획 강제 — 실측 26-07-06: 프롬프트 지시(design order)만으로는
    // KILLER 에서 정답 pointCode 가 디코이에 반복돼(grammar-killer-answer-point-
    // repeated) strict 가 전멸했다. 계획을 스키마 필드 안에 쓰게 하면 무시 불가.
    "내부 설계 메모 (학생 비노출, 저장 전 서버가 제거). 반드시 markedExpressions 작성 전에 먼저 채울 것: ① 정답으로 쓸 문장 인용 ② 적용한 어법 프레임 이름과 정답 pointCode X ③ 오류 변형(올바른 형태→틀린 형태)과 그것이 그 자리에서 비문인 통사적 이유 ④ 반증 검사 결과(다른 해석으로 읽어도 비문임을 확인) ⑤ 디코이 각각의 자리와 pointCode 나열 — KILLER 난이도에서는 디코이 코드가 하나라도 X 와 같으면 안 되며(같으면 그 자리를 버리고 다른 프레임의 자리로 교체), 전체 밑줄은 서로 다른 코드 3개 이상·코드당 최대 2회 ⑥ 각 디코이가 금지 표면 목록에 없고 장식 토큰(one/it's/does/than/thicker/depends 류 단독)이 아님을 확인. 한국어 4~7문장.",
  );

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

// 베이스 스키마(question-schemas-mc 소유)는 무수정 — 이 파일에서 생성 순서로만
// 재배열한 AI 응답 스키마를 노출한다.
export const aiSentenceOrderSchema = toGenerationOrder(sentenceOrderSchema.extend(mcWrongExplanations));
export const aiTopicMainIdeaSchema = toGenerationOrder(topicMainIdeaSchema.extend(mcWrongExplanations));
export const aiTopicSchema = toGenerationOrder(topicSchema.extend(mcWrongExplanations));
export const aiMainIdeaSchema = toGenerationOrder(mainIdeaSchema.extend(mcWrongExplanations));
export const aiTitleSchema = toGenerationOrder(titleSchema.extend(mcWrongExplanations));
export const aiContentMatchSchema = toGenerationOrder(contentMatchSchema.extend(mcWrongExplanations));
export const aiSummaryCompleteMcSchema = toGenerationOrder(summaryCompleteMcSchema.extend(mcWrongExplanations));

export function buildAiContentMatchSchema(optionCount: number, answerCount = 1) {
  const optionN = Math.min(12, Math.max(5, Math.round(optionCount)));
  const answerN = Math.min(optionN, Math.max(1, Math.round(answerCount)));
  const labels = Array.from({ length: optionN }, (_, index) => String(index + 1));
  const labelSchema = z.enum(labels as [string, ...string[]]);

  // 필드 순서 = 생성 순서: 발문 → 콘텐츠(matchType/options) → 정답(들) → 오답해설 → 해설.
  return z.object({
    ...commonHeadFields,
    matchType: z.enum(["일치", "불일치"]).describe("일치 또는 불일치 문제"),
    options: z
      .array(optionSchema.extend({ label: labelSchema }))
      .length(optionN)
      .describe(`${optionN} English statement options`),
    correctAnswers:
      answerN > 1
        ? z
            .array(labelSchema)
            .length(answerN)
            .describe(`Exactly ${answerN} correct labels`)
        : z.array(labelSchema).length(1).optional(),
    correctAnswer: z
      .string()
      .describe(
        answerN > 1
          ? `Correct labels joined by comma + space. Exactly ${answerN} labels from ${labels.join(", ")}.`
          : `Single correct label from ${labels.join(", ")}.`,
      ),
    wrongOptionExplanations: buildAiWrongOptionExplanationsSchema(optionN - answerN),
    ...commonTailFields,
  });
}

// ---------------------------------------------------------------------------
// 1. 빈칸 추론 (BLANK_INFERENCE)
// ---------------------------------------------------------------------------

// BLANK_INFERENCE 설계 메모 필드 — GRAMMAR_ERROR 의 errorDesign 과 동일한
// 설계-우선 장치. direction 바로 뒤에 배치해 "설계 → 빈칸 → 선지 → 해설" 생성
// 순서를 강제한다. 학생에게 절대 노출되지 않으며 후처리(processBlankInference)가
// 저장 전 제거한다.
const blankDesignField = z
  .string()
  .describe(
    "내부 설계 메모 (학생 비노출, 서버가 제거). 반드시 빈칸·선지 작성 전에 먼저 채울 것: ① 빈칸 문장 선택과 그 문장의 담화 역할(주제문/결론/인과 귀결), ② 정답 논리 축(재진술/인과/대조/전체 논지), ③ 오답 4개 각각의 함정 기제(극성 반전/과협소/과확장/소재 연상). 한국어 2~5문장.",
  );

// 빈칸 해설 4단 템플릿 — 공유 계약(200~450자).
const blankExplanationField = z
  .string()
  .describe(
    "정답 해설 (한국어, 200~450자, 4단 구조): ① 빈칸 문장의 담화 역할 제시 → ② 근거 문장 연결(지문에서 최소 2문장을 인용하거나 지시) → ③ 정답 도출 → ④ 각 오답의 함정 기제 명명. 출제 과정·내부 필드명 언급 금지.",
  );

// 필드 순서 = 생성 순서: 발문 → 설계 → 빈칸 정의 → 선지 → 정답 → 오답해설 → 해설.
export const aiBlankInferenceSchema = z.object({
  ...commonHeadFields,
  blankDesign: blankDesignField,
  originalExpression: z.string().describe("원문에서 빈칸으로 교체할 정확한 표현 (원문 그대로, 한 글자도 변경 금지)"),
  surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
  blankAnswerMode: z
    .enum(["SOURCE_EXACT", "PARAPHRASE", "DOUBLE_NEGATIVE"])
    .optional()
    .describe("빈칸 정답 구성 방식 (PARAPHRASE는 빈칸 변형 설정이 있을 때)"),
  answerLogic: z.string().optional().describe("부정-부정 빈칸 등 특수 정답 논리 설명"),
  options: z.array(optionSchema).length(5).describe("5개 선지"),
  ...commonAnswerField,
  ...mcWrongExplanations,
  ...commonTailFields,
  explanation: blankExplanationField,
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
  // 필드 순서 = 생성 순서: 발문 → 설계 → 빈칸 정의 → 조합 선지 → 정답 → 오답해설 → 해설.
  return z.object({
    ...commonHeadFields,
    blankDesign: blankDesignField,
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
    ...commonAnswerField,
    ...mcWrongExplanations,
    ...commonTailFields,
    explanation: blankExplanationField,
  });
}

// ---------------------------------------------------------------------------
// 2. 어법 판단 (GRAMMAR_ERROR)
// ---------------------------------------------------------------------------

// GRAMMAR_ERROR 한정: 다른 유형에 영향 없도록 commonFields/mcWrongExplanations를 인라인 오버라이드
// - correctAnswer: enum 강제 (괄호 포맷 보장)
// - markedExpressions[i].pointCode: 어법 출제 포인트 코드 (a~m), 5개 unique 강제 가이드
// - wrongOptionExplanations: array 형태로 변경 (label·expression·pointCode 일치 강제), 후처리에서 Record로 변환
// ⚠️ 필드 순서 = 생성 순서: 설계(errorDesign) → 밑줄(markedExpressions) → 정답 →
// 선지/오답해설 → 본해설. 구조화 출력이 스키마 프로퍼티 순서를 따르므로, 해설을
// 밑줄 설계보다 먼저 쓰게 되는 역순 생성을 막는다. 필드명 계약은 기존과 동일.
export const aiGrammarErrorSchema = z.object({
  direction: z.string().describe("발문 (한국어)"),
  errorDesign: grammarErrorDesignField,
  markedExpressions: z.array(grammarMarkedExpressionSchema).min(5).max(10).describe("밑줄 표시할 5~10개 표현"),
  correctAnswers: z
    .array(z.string())
    .min(1)
    .max(10)
    .optional()
    .describe("복수 정답 지원용 정답 label 배열. correctAnswer와 같은 label들을 담음."),
  correctAnswer: z
    .string()
    .describe("정답 label. 복수 정답이면 '(A), (C)'처럼 comma + space로 연결"),
  options: z.array(optionSchema).min(5).max(10).describe("5~10개 선지"),
  wrongOptionExplanations: z
    .array(grammarWrongOptionExplanationSchema)
    .min(0)
    .max(9)
    .describe(
      "정답을 제외한 오답 위치 각각에 대한 해설 (label·expression·pointCode가 markedExpressions와 일치). 후처리에서 Record<label, explanation> 형태로 변환됨.",
    ),
  explanation: z
    .string()
    .describe(
      "정답 해설 (한국어, 200~450자, 4단 구조): ① 정답 문장의 골격 해부(진짜 주어/선행사/의미상 주어/병렬 짝을 이름 붙여 제시) ② 밑줄 표현이 그 자리에서 비문인 통사적 이유 단정 ③ '따라서 Y로 고쳐야 한다' 교정 ④ (선택) 학생이 헷갈리는 함정 1문장. 반드시 학생에게 보이는 틀린 표현을 먼저 인용한 뒤 교정형을 제시. 출제 과정·변형 서사·내부 필드명 언급 금지.",
    ),
  keyPoints: z
    .array(z.string())
    .describe(
      "핵심 포인트 정확히 3개, 각 항목은 반드시 해당 밑줄 라벨로 시작 — 형식: '(D) 능동태 vs 수동태 — 목적어 유무로 판정'. 1번째 항목=정답 라벨의 출제 포인트, 2·3번째=실제 오답 밑줄 중 학생이 가장 헷갈릴 두 라벨의 포인트(해당 라벨의 pointCode 와 같은 문법 주제여야 함). 이 문항의 밑줄에 없는 문법 주제를 채워 넣는 것 절대 금지 — 일반론 필러가 검수에서 반복 적발되었다.",
    ),
  tags: z.array(z.string()).describe("관련 태그 (한국어)"),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]).describe("난이도"),
});
export type AiGrammarErrorQuestion = z.infer<typeof aiGrammarErrorSchema>;

export function buildAiGrammarErrorSchema(markerCount: number, answerCount = 1) {
  const count = Math.min(10, Math.max(5, Math.round(markerCount)));
  const answers = Math.min(count, Math.max(1, Math.round(answerCount)));
  const wrongCount = count - answers;
  const labels = GRAMMAR_LABELS.slice(0, count).join(" ");
  // 필드 순서 = 생성 순서 (aiGrammarErrorSchema 주석 참조).
  return z.object({
    direction: z.string().describe("발문 (한국어)"),
    errorDesign: grammarErrorDesignField,
    markedExpressions: z
      .array(grammarMarkedExpressionSchema)
      .length(count)
      .describe(`밑줄 표시할 표현. 정확히 ${count}개를 생성해야 함.`),
    correctAnswers: z
      .array(z.string())
      .length(answers)
      .describe(`정답 label 배열. 정확히 ${answers}개이며, 모든 isError=true label과 정확히 일치해야 함.`),
    correctAnswer: z
      .string()
      .describe(`정답 label들을 comma + space로 연결. 사용 가능한 label: ${labels}. 정확히 ${answers}개 label이어야 함.`),
    options: z
      .array(optionSchema)
      .length(count)
      .describe(`선지. 정확히 ${count}개를 생성해야 함.`),
    wrongOptionExplanations: z
      .array(grammarWrongOptionExplanationSchema)
      .length(wrongCount)
      .describe(`정답이 아닌 모든 label에 대한 해설. 항목 수는 정확히 ${wrongCount}개여야 함.`),
    explanation: z
      .string()
      .describe(
        "정답 해설 (한국어, 200~450자, 4단 구조): ① 정답 문장의 골격 해부(진짜 주어/선행사/의미상 주어/병렬 짝을 이름 붙여 제시) ② 밑줄 표현이 그 자리에서 비문인 통사적 이유 단정 ③ '따라서 Y로 고쳐야 한다' 교정 ④ (선택) 학생이 헷갈리는 함정 1문장. 반드시 학생에게 보이는 틀린 표현을 먼저 인용한 뒤 교정형을 제시. 복수 정답이면 라벨당 2~3문장(골격+판정+교정)으로 압축해 전체 600자 이내로 모든 오류 라벨을 다룰 것. 출제 과정·변형 서사·내부 필드명 언급 금지.",
      ),
    keyPoints: z
    .array(z.string())
    .describe(
      "핵심 포인트 정확히 3개, 각 항목은 반드시 해당 밑줄 라벨로 시작 — 형식: '(D) 능동태 vs 수동태 — 목적어 유무로 판정'. 1번째 항목=정답 라벨의 출제 포인트, 2·3번째=실제 오답 밑줄 중 학생이 가장 헷갈릴 두 라벨의 포인트(해당 라벨의 pointCode 와 같은 문법 주제여야 함). 이 문항의 밑줄에 없는 문법 주제를 채워 넣는 것 절대 금지 — 일반론 필러가 검수에서 반복 적발되었다.",
    ),
    tags: z.array(z.string()).describe("관련 태그 (한국어)"),
    difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]).describe("난이도"),
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

// 필드 순서 = 생성 순서: 발문 → 밑줄 어휘 → 선지 → 정답 → 오답해설 → 해설.
export const aiVocabChoiceSchema = z.object({
  ...commonHeadFields,
  markedWords: z.array(vocabMarkedWordSchema).length(5).describe("밑줄 표시할 5개 어휘"),
  options: z.array(optionSchema).length(5).describe("5개 선지"),
  ...vocabDisplayModeField,
  ...commonAnswerField,
  ...mcWrongExplanations,
  ...commonTailFields,
});
export type AiVocabChoiceQuestion = z.infer<typeof aiVocabChoiceSchema>;

export function buildAiVocabChoiceSchema(markerCount: number, answerCount = 1) {
  const count = Math.min(10, Math.max(5, Math.round(markerCount)));
  const answers = Math.min(count, Math.max(1, Math.round(answerCount)));
  const labels = VOCAB_CHOICE_LABELS.slice(0, count).join(" ");
  // 필드 순서 = 생성 순서 (aiVocabChoiceSchema 와 동일 정렬).
  return z.object({
    ...commonHeadFields,
    markedWords: z
      .array(vocabMarkedWordSchema)
      .length(count)
      .describe(`밑줄 표시할 어휘. 정확히 ${count}개를 생성해야 함.`),
    options: z
      .array(optionSchema)
      .length(count)
      .describe(`선지. 정확히 ${count}개를 생성해야 함.`),
    ...vocabDisplayModeField,
    correctAnswers:
      answers > 1
        ? z
            .array(z.string())
            .length(answers)
            .describe(`정답 label 배열. 정확히 ${answers}개이며, 모든 isInappropriate=true label과 정확히 일치해야 함.`)
        : z.array(z.string()).length(1).optional(),
    correctAnswer: z
      .string()
      .describe(
        answers > 1
          ? `정답 label들을 comma + space로 연결. 사용 가능한 label: ${labels}. 정확히 ${answers}개 label이어야 함.`
          : `정답 label 하나. 사용 가능한 label: ${labels}.`,
      ),
    wrongOptionExplanations: buildAiWrongOptionExplanationsSchema(count - answers),
    ...commonTailFields,
  });
}

// ---------------------------------------------------------------------------
// 4. 문장 삽입 (SENTENCE_INSERT)
// ---------------------------------------------------------------------------

// 필드 순서 = 생성 순서: 발문 → 삽입문/마커/선지/근거 → 정답 → 오답해설 → 해설.
export const aiSentenceInsertSchema = z.object({
  ...commonHeadFields,
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
  ...commonAnswerField,
  ...mcWrongExplanations,
  ...commonTailFields,
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
// 필드 순서 = 생성 순서: 발문 → 문장 구성 → 선지 → 정답 → 오답해설 → 해설.
export const aiIrrelevantSchema = z.object({
  ...commonHeadFields,
  sentences: z.array(z.string()).min(5).max(5).describe("정확히 5개 문장: 원문 4문장(지문 전체에 분산, 원래 순서 유지) + 삽입 무관문 1개. 5개를 초과하지 마세요."),
  irrelevantIndex: z.number().min(1).max(3).describe("무관한 문장의 인덱스 (1~3 → 정답 ②③④, 첫/마지막 금지)"),
  options: z.array(optionSchema).min(5).max(5).describe("선지 5개 (서버에서 숫자 마커로 재생성)"),
  ...commonAnswerField,
  ...mcWrongExplanations,
  ...commonTailFields,
});
export type AiIrrelevantQuestion = z.infer<typeof aiIrrelevantSchema>;

export function buildAiIrrelevantSchema(slotCount: number) {
  const n = Math.max(5, Math.round(slotCount));
  // NOTE: keep schema permissive (min 5, max n) — strict `.length(n)` makes
  // Gemini 3.5 Flash unstable for n > 5. The exact n is enforced in prompt +
  // post-process instead.
  // 필드 순서 = 생성 순서 (aiIrrelevantSchema 와 동일 정렬).
  return z.object({
    ...commonHeadFields,
    sentences: z.array(z.string()).min(5).max(n).describe(`표시할 ${n}개 문장. 원문 ${n - 1}개 문장은 그대로 보존하고 AI 무관문 1개만 삽입`),
    irrelevantIndex: z.number().min(1).max(n - 2).describe(`무관한 문장의 인덱스 (1~${n - 2}, 첫/마지막 금지)`),
    options: z.array(optionSchema).min(5).max(n).describe(`${n}개 선지`),
    ...commonAnswerField,
    wrongOptionExplanations: buildAiWrongOptionExplanationsSchema(n - 1),
    ...commonTailFields,
  });
}

// ---------------------------------------------------------------------------
// 6. 지칭 추론 (REFERENCE)
// ---------------------------------------------------------------------------

// 필드 순서 = 생성 순서: 발문 → 밑줄 대명사 → 선지 → 정답 → 오답해설 → 해설.
export const aiReferenceSchema = z.object({
  ...commonHeadFields,
  underlinedPronoun: z.string().describe("밑줄 칠 대명사"),
  surroundingText: z.string().describe("이 표현이 위치한 주변 텍스트 40~60자 (위치 식별용)"),
  options: z.array(optionSchema).length(5).describe("한국어 선택지"),
  ...commonAnswerField,
  ...mcWrongExplanations,
  ...commonTailFields,
});
export type AiReferenceQuestion = z.infer<typeof aiReferenceSchema>;

// ---------------------------------------------------------------------------
// 7. 함축 의미 추론 (IMPLIED_MEANING)
// ---------------------------------------------------------------------------

// 필드 순서 = 생성 순서: 발문 → 밑줄 표현/의미 분석 → 선지 → 정답 → 오답해설 → 해설.
export const aiImpliedMeaningSchema = z.object({
  ...commonHeadFields,
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
  ...commonAnswerField,
  ...mcWrongExplanations,
  ...commonTailFields,
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
  aiAntonymSchema,
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
  topicSentenceWritingSchema,
  buildTopicSentenceWritingSchema,
  grammarCorrectionSchema,
} from "./question-schemas-essay";
import { KO_TYPE_REGISTRY } from "./korean/registry";

const AI_ESSAY_QUESTION_SCHEMAS: Record<string, z.ZodType> = {
  CONDITIONAL_WRITING: conditionalWritingSchema,
  SENTENCE_TRANSFORM: sentenceTransformSchema,
  FILL_BLANK_KEY: fillBlankKeySchema,
  SUMMARY_COMPLETE: summaryCompleteSchema,
  SUMMARY_WRITING: summaryWritingSchema,
  WORD_ORDER: wordOrderSchema,
  TOPIC_SENTENCE_WRITING: topicSentenceWritingSchema,
  GRAMMAR_CORRECTION: grammarCorrectionSchema,
};

// 어휘 스키마(question-ai-schemas-vocab 소유)는 무수정 — 생성 경로가 쓰는 병합
// 레지스트리에서만 생성 순서로 재배열한 사본으로 덮어쓴다.
const aiContextMeaningSchemaOrdered = toGenerationOrder(aiContextMeaningSchema);
const aiSynonymSchemaOrdered = toGenerationOrder(aiSynonymSchema);
const aiAntonymSchemaOrdered = toGenerationOrder(aiAntonymSchema);

export const AI_QUESTION_SCHEMAS: Record<string, z.ZodType> = {
  ...AI_MC_QUESTION_SCHEMAS,
  ...AI_VOCAB_QUESTION_SCHEMAS,
  CONTEXT_MEANING: aiContextMeaningSchemaOrdered,
  SYNONYM: aiSynonymSchemaOrdered,
  ANTONYM: aiAntonymSchemaOrdered,
  ...AI_ESSAY_QUESTION_SCHEMAS,
};

// ── KO(국어) 유형 병합 — 레지스트리 파생 (기존 영어 엔트리 무변경) ──────────
// KO 스키마(koQuestionEnvelope 계열)는 지문 전문 복사 필드가 없는 AI 응답
// 스키마 그 자체다. 동적 count 슬롯이 없으므로 getAiResponseSchema if-체인은
// 무접촉(KO 는 어떤 분기에도 걸리지 않고 base 스키마 그대로 반환).
for (const [koTypeId, koModule] of Object.entries(KO_TYPE_REGISTRY)) {
  AI_QUESTION_SCHEMAS[koTypeId] = koModule.schema;
}

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
  CONTEXT_MEANING: aiContextMeaningSchemaOrdered,
  SYNONYM: aiSynonymSchemaOrdered,
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
  // extend 는 신규 키(correctAnswers)를 맨 뒤에 붙이므로, 생성 순서 재배열을 한 번 더 적용.
  return toGenerationOrder(base.extend({
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
  }));
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
    topicSentenceWritingBlankCount?: number;
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
    // 동적 빌더는 question-schemas-mc 소유라 무수정 — 여기서 생성 순서로 재배열.
    schema = toGenerationOrder(buildSummaryCompleteMcSchema(options.summaryCompleteMcBlankCount));
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
    typeId === "TOPIC_SENTENCE_WRITING" &&
    options?.topicSentenceWritingBlankCount &&
    options.topicSentenceWritingBlankCount !== 1
  ) {
    schema = buildTopicSentenceWritingSchema(options.topicSentenceWritingBlankCount);
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
    // 동적 빌더는 question-ai-schemas-vocab 소유라 무수정 — 여기서 생성 순서로 재배열.
    schema = toGenerationOrder(buildAiAntonymSchema(options.antonymPairCount));
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
