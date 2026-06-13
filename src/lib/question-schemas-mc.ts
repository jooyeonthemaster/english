// ============================================================================
// 수능/모의고사 객관식 스키마 (10 types)
// ============================================================================

import { z } from "zod";

const optionSchema = z.object({ label: z.string(), text: z.string() });

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

// ── 빈칸 추론 ──

export const blankInferenceSchema = z.object({
  ...commonFields,
  originalExpression: z.string().describe("원문에서 빈칸으로 교체한 정확한 표현 (한 글자도 변경하지 않은 원문 그대로)"),
  passageWithBlank: z.string().describe("빈칸(_____) 이 삽입된 지문 전체"),
  blankAnswerMode: z.enum(["SOURCE_EXACT", "PARAPHRASE", "DOUBLE_NEGATIVE"]).optional(),
  answerLogic: z.string().optional(),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type BlankInferenceQuestion = z.infer<typeof blankInferenceSchema>;

// ── 어법 판단 ──

export const grammarErrorSchema = z.object({
  ...commonFields,
  correctAnswers: z.array(z.string()).min(1).max(10).optional(),
  passageWithMarkers: z.string().describe("(A)~(J) 밑줄 표시가 포함된 지문. 밑줄 부분은 __(A) expression__ 형태로 표시"),
  markedExpressions: z.array(z.object({
    label: z.string().describe("(A)~(J)"),
    expression: z.string().describe("원문에서의 올바른 표현"),
    isError: z.boolean().describe("이 표현이 오류인지"),
    correction: z.string().optional().describe("오류인 경우 올바른 표현"),
    errorExpression: z.string().optional().describe("오류인 경우 지문/선지에 표시할 틀린 표현"),
  })).min(5).max(10),
  options: z.array(optionSchema).min(5).max(10),
  ...mcWrongExplanations,
});
export type GrammarErrorQuestion = z.infer<typeof grammarErrorSchema>;

// ── 네모 어법 ──

export const grammarChoiceComboSchema = z.object({
  ...commonFields,
  passageWithMarkers: z.string().describe("(A)~(C) 네모 선택지가 포함된 지문. 네모 부분은 (A) [표현1 / 표현2] 형태로 표시"),
  slots: z.array(z.object({
    label: z.string().describe("(A), (B), (C)"),
    correctExpression: z.string().describe("원문에서의 올바른 표현"),
    wrongExpression: z.string().describe("네모에 함께 제시하는 틀린 표현"),
    pointCode: z.string().optional().describe("어법 출제 포인트 코드 (a~m)"),
  })).length(3),
  options: z.array(z.object({
    label: z.string(),
    text: z.string(),
    slotValues: z.array(z.string()).length(3).optional().describe("각 네모 (A)/(B)/(C)에서 고른 표현, 라벨 순서대로"),
  })).length(5),
  ...mcWrongExplanations,
});
export type GrammarChoiceComboQuestion = z.infer<typeof grammarChoiceComboSchema>;

// ── 어휘 적절성 ──

export const vocabChoiceSchema = z.object({
  ...commonFields,
  passageWithMarkers: z.string().describe("(a)~(e) 밑줄 어휘가 포함된 지문. 밑줄 부분은 __(a) word__ 형태로 표시"),
  markedWords: z.array(z.object({
    label: z.string().describe("(a)~(e)"),
    word: z.string(),
    originalWord: z.string().optional(),
    substituteWord: z.string().optional(),
    isInappropriate: z.boolean(),
    betterWord: z.string().optional().describe("부적절한 경우 적절한 단어"),
  })).length(5),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type VocabChoiceQuestion = z.infer<typeof vocabChoiceSchema>;

// ── 글의 순서 ──

export const sentenceOrderSchema = z.object({
  ...commonFields,
  givenSentence: z
    .string()
    .describe("주어진 글. 반드시 도입부 1~2문장만 사용하고, 긴 문단 전체나 3문장 이상은 금지"),
  paragraphs: z.array(z.object({
    label: z.string().describe("(A), (B), (C)"),
    text: z.string().describe("각 (A)/(B)/(C) 덩어리. 최소 2문장 이상, 세 덩어리의 분량이 균형 있게 배치되어야 함"),
  })).length(3).describe("(A), (B), (C) 세 덩어리. 어느 하나도 한 문장짜리/한 줄짜리로 만들지 말 것"),
  options: z.array(optionSchema).length(5).describe("(A)(B)(C)의 순열 5개. 예: (B)-(A)-(C)"),
  ...mcWrongExplanations,
});
export type SentenceOrderQuestion = z.infer<typeof sentenceOrderSchema>;

// ── 문장 삽입 ──

export const sentenceInsertSchema = z.object({
  ...commonFields,
  givenSentence: z.string().describe("삽입할 문장"),
  passageWithMarkers: z.string().describe("①~⑤ 위치 마커가 포함된 지문"),
  options: z.array(optionSchema).length(5),
  ...mcWrongExplanations,
});
export type SentenceInsertQuestion = z.infer<typeof sentenceInsertSchema>;

// ── 주제/요지 ──

export const topicSchema = z.object({
  ...commonFields,
  options: z.array(optionSchema).length(5).describe("영어 주제 선택지"),
  ...mcWrongExplanations,
});

export const mainIdeaSchema = z.object({
  ...commonFields,
  options: z.array(optionSchema).length(5).describe("한국어 요지/주장 선택지"),
  ...mcWrongExplanations,
});

export const topicMainIdeaSchema = z.object({
  ...commonFields,
  options: z
    .array(optionSchema)
    .length(5)
    .describe("주제는 영어 선택지, 요지/주장은 한국어 선택지"),
  ...mcWrongExplanations,
});
export type TopicQuestion = z.infer<typeof topicSchema>;
export type MainIdeaQuestion = z.infer<typeof mainIdeaSchema>;
export type TopicMainIdeaQuestion = z.infer<typeof topicMainIdeaSchema>;

// ── 제목 추론 ──

export const titleSchema = z.object({
  ...commonFields,
  options: z.array(optionSchema).length(5).describe("영어 제목 선택지"),
  ...mcWrongExplanations,
});
export type TitleQuestion = z.infer<typeof titleSchema>;

// ── 함축 의미 추론 ──

export const impliedMeaningSchema = z.object({
  ...commonFields,
  passageWithUnderline: z.string().describe("밑줄 친 표현이 포함된 지문. 밑줄 표현은 __표현__ 형태로 표시"),
  underlinedExpression: z.string().describe("함축 의미를 묻는 밑줄 친 구, 절, 또는 문장"),
  surfaceMeaning: z.string().describe("밑줄 표현을 문자 그대로 읽었을 때의 표면 의미"),
  impliedMeaning: z.string().describe("정답 선택지가 나타내는 핵심 함축 의미"),
  reasoningGap: z.string().describe("표면 의미에서 실제 함축 의미로 넘어가기 위해 필요한 추론 간극"),
  evidenceChain: z.array(z.string()).min(2).max(4).describe("정답을 뒷받침하는 지문 근거 흐름"),
  options: z.array(optionSchema).length(5).describe("영어 함축 의미 선택지"),
  ...mcWrongExplanations,
});
export type ImpliedMeaningQuestion = z.infer<typeof impliedMeaningSchema>;

// ── 지칭 추론 ──

export const referenceSchema = z.object({
  ...commonFields,
  passageWithUnderline: z.string().describe("밑줄 친 대명사가 포함된 지문. 밑줄 대명사는 __단어__ 형태로 표시"),
  underlinedPronoun: z.string().describe("밑줄 친 대명사"),
  options: z.array(optionSchema).length(5).describe("한국어 선택지"),
  ...mcWrongExplanations,
});
export type ReferenceQuestion = z.infer<typeof referenceSchema>;

// ── 내용 일치 ──

export const contentMatchSchema = z.object({
  ...commonFields,
  matchType: z.enum(["일치", "불일치"]).describe("일치 또는 불일치 문제"),
  options: z.array(optionSchema).length(5).describe("영어 진술문 선택지"),
  ...mcWrongExplanations,
});
export type ContentMatchQuestion = z.infer<typeof contentMatchSchema>;

export function buildContentMatchSchema(optionCount: number, answerCount = 1) {
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
    ...mcWrongExplanations,
  });
}

// ── 요약문 완성 객관식 ──

const summaryPairOptionSchema = optionSchema.extend({
  blankA: z.string().describe("(A)에 들어갈 영어 단어 또는 어구"),
  blankB: z.string().describe("(B)에 들어갈 영어 단어 또는 어구"),
});

export const SUMMARY_COMPLETE_MC_BLANK_LABELS = ["(A)", "(B)", "(C)", "(D)"] as const;

function summaryBlankLabels(blankCount: number) {
  const n = Math.min(
    SUMMARY_COMPLETE_MC_BLANK_LABELS.length,
    Math.max(2, Math.round(blankCount)),
  );
  return SUMMARY_COMPLETE_MC_BLANK_LABELS.slice(0, n);
}

export function buildSummaryCompleteMcSchema(blankCount: number) {
  const labels = summaryBlankLabels(blankCount);
  const labelSchema = z.enum(labels as [string, ...string[]]);
  const blankValueSchema = z.object({
    label: labelSchema,
    value: z.string().describe("English word or phrase for this blank label"),
  });

  return z.object({
    ...commonFields,
    summaryWithBlanks: z
      .string()
      .describe(`English one-sentence summary containing ${labels.join(", ")} exactly once each`),
    blanks: z
      .array(
        z.object({
          label: labelSchema,
          answer: z.string().describe("English answer word or phrase for this blank"),
          role: z.string().optional().describe("Semantic or grammatical role of this blank"),
        }),
      )
      .length(labels.length)
      .describe(`${labels.join(", ")} answer information`),
    options: z
      .array(
        optionSchema.extend({
          blankValues: z
            .array(blankValueSchema)
            .length(labels.length)
            .describe(`Values for ${labels.join(", ")}, in order`),
          blankA: z.string().optional().describe("Compatibility value for (A)"),
          blankB: z.string().optional().describe("Compatibility value for (B)"),
          blankC: z.string().optional().describe("Compatibility value for (C)"),
          blankD: z.string().optional().describe("Compatibility value for (D)"),
        }),
      )
      .length(5)
      .describe(`5 objective answer choices, each with ${labels.length} blank values`),
    ...mcWrongExplanations,
  });
}

export const summaryCompleteMcSchema = z.object({
  ...commonFields,
  summaryWithBlanks: z
    .string()
    .describe("지문 내용을 한 문장으로 요약한 영어 요약문. (A), (B)를 각각 정확히 한 번 포함"),
  blanks: z
    .array(
      z.object({
        label: z.enum(["(A)", "(B)"]),
        answer: z.string().describe("해당 빈칸의 정답 영어 단어 또는 어구"),
        role: z.string().optional().describe("요약문 안에서 해당 빈칸이 담당하는 의미 역할"),
      }),
    )
    .length(2)
    .describe("(A), (B) 정답 정보"),
  options: z
    .array(summaryPairOptionSchema)
    .length(5)
    .describe("5개 객관식 선지. 각 선지는 (A), (B)에 들어갈 영어 단어/어구 쌍"),
  ...mcWrongExplanations,
});
export type SummaryCompleteMcQuestion = z.infer<typeof summaryCompleteMcSchema>;

// ── 무관한 문장 ──

export const irrelevantSchema = z.object({
  ...commonFields,
  passageWithNumbers: z.string().describe("번호가 매겨진 문장들이 포함된 지문"),
  options: z.array(optionSchema).min(5),
  ...mcWrongExplanations,
});
export type IrrelevantQuestion = z.infer<typeof irrelevantSchema>;
