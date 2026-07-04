// ============================================================================
// 내신 서술형 스키마 (6 types)
// ============================================================================

import { z } from "zod";

const commonFields = {
  direction: z.string().describe("발문 (한국어)"),
  correctAnswer: z.string(),
  explanation: z.string().describe("정답 해설 (한국어, 상세)"),
  keyPoints: z.array(z.string()).describe("학습 포인트 3개 이상"),
  tags: z.array(z.string()).describe("관련 태그 (한국어)"),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]),
};

// ── 조건부 영작 ──

export const conditionalWritingSchema = z.object({
  ...commonFields,
  referenceSentence: z.string().describe("학생이 영작해야 할 한국어 문장 (지문의 핵심 문장을 한국어로 번역한 것)"),
  conditions: z.array(z.string()).describe("작성 조건 목록 (한국어)"),
  modelAnswer: z.string().describe("모범 답안 (영어)"),
  scoringCriteria: z.array(z.string()).optional().describe("채점 기준"),
});
export type ConditionalWritingQuestion = z.infer<typeof conditionalWritingSchema>;

// ── 문장 전환 ──

export const sentenceTransformSchema = z.object({
  ...commonFields,
  originalSentence: z.string().describe("전환 대상 원래 문장"),
  conditions: z.array(z.string()).describe("전환 조건 목록 (한국어)"),
  modelAnswer: z.string().describe("모범 답안 (영어)"),
  scoringCriteria: z.array(z.string()).optional().describe("채점 기준"),
});
export type SentenceTransformQuestion = z.infer<typeof sentenceTransformSchema>;

// ── 핵심 표현 빈칸 ──

export const fillBlankKeySchema = z.object({
  ...commonFields,
  passageWithBlank: z.string().optional().describe("Full passage with the target expression replaced by _____. Server-generated when possible."),
  sentenceWithBlank: z.string().describe("빈칸이 포함된 문장 또는 지문"),
  answer: z.string().describe("빈칸에 들어갈 핵심 표현"),
});
export type FillBlankKeyQuestion = z.infer<typeof fillBlankKeySchema>;

// ── 요약문 완성 ──

export const summaryCompleteSchema = z.object({
  ...commonFields,
  summaryWithBlanks: z.string().describe("빈칸이 포함된 요약문"),
  blanks: z.array(z.object({
    label: z.string().describe("(A), (B) 등"),
    answer: z.string(),
  })),
});
export type SummaryCompleteQuestion = z.infer<typeof summaryCompleteSchema>;

export function buildSummaryCompleteSchema(blankCount: number) {
  const n = Math.min(5, Math.max(1, Math.round(blankCount)));
  const labels = Array.from({ length: n }, (_, index) => `(${String.fromCharCode(65 + index)})`);
  const labelSchema = z.enum(labels as [string, ...string[]]);

  return z.object({
    ...commonFields,
    summaryWithBlanks: z
      .string()
      .describe(`Summary sentence containing ${labels.join(", ")} exactly once each`),
    blanks: z
      .array(
        z.object({
          label: labelSchema,
          answer: z.string(),
        }),
      )
      .length(n)
      .describe(`${n} short-answer summary blanks`),
  });
}

// ── 요약문 영작 (SUMMARY_WRITING) ──
// 요약문 완성(SUMMARY_COMPLETE)의 한 단계 상위: 학생이 [보기]·해석·단서를 활용해
// 빈칸을 "영작(작문)"한다. 한 빈칸에 다단어 어구 전체가 들어간다(레퍼런스: 내신 논술형 영작).
// 🔒비밀(학생 비노출): answer / acceptableVariants / requiredLemmas / modelAnswer /
//   wordBankDistractors / scoringCriteria. 👁학생노출: summaryWithBlanks / koreanGloss /
//   blankGlosses / wordBank / firstLetterHint / targetWordCount / connectorFrameAfter.

const summaryWritingBlankSchema = z.object({
  label: z.string().describe("(A), (B), (C) — 요약문 빈칸 라벨 (학생노출)"),
  answer: z.string().describe("🔒비밀: 이 빈칸의 모범 영작 (다단어 어구, 영어)"),
  acceptableVariants: z
    .array(z.string())
    .optional()
    .describe("🔒비밀: 동치 정답(어순/동의 구문 — 분사구문↔관계절 등). 채점 폭주 방지"),
  requiredLemmas: z
    .array(z.string())
    .optional()
    .describe("🔒비밀: 부분점수 채점에 반드시 포함돼야 할 표제어"),
  firstLetterHint: z
    .string()
    .optional()
    .describe("👁학생노출(clueMode=firstLetter): 각 단어 첫 글자만 소문자로, answer 토큰과 1:1 (예: 'p s d')"),
  targetWordCount: z
    .number()
    .int()
    .optional()
    .describe("이 빈칸 목표 단어 수. targetWordsMode=approx면 '약 N단어'로 표시"),
  connectorFrameAfter: z
    .string()
    .optional()
    .describe("👁학생노출: 빈칸 뒤에 이어지는 고정 프레임 (예: ', which can lead to greater bias')"),
});

const summaryWritingFields = {
  ...commonFields,
  // ── 재사용: SUMMARY_COMPLETE 인프라 ──
  summaryWithBlanks: z
    .string()
    .describe("👁학생노출: (A)(B) placeholder만 담은 영어 요약문. 정답 어구를 절대 포함하지 말 것"),
  // ── 신규: 요약문 영작 전용 ──
  koreanGloss: z
    .string()
    .optional()
    .describe("👁학생노출(glossEnabled): [해석] 박스 한국어 뜻. 보기 단어를 1:1로 직역 나열하지 말 것(누수)"),
  blankGlosses: z
    .array(z.object({ label: z.string(), gloss: z.string() }))
    .optional()
    .describe("👁학생노출(partial/koreanChunk): 빈칸별 한국어 토막 해석"),
  wordBank: z
    .array(z.string())
    .optional()
    .describe("👁학생노출(wordBankEnabled): [보기] 칩(셔플됨, 미끼 포함). 중복 필요 단어는 같은 문자열 2개로"),
  wordBankDistractors: z
    .array(z.string())
    .optional()
    .describe("🔒비밀: wordBank 중 정답에 쓰이지 않는 미끼 목록 (검수/교사면 전용)"),
  wordBankPolicy: z.enum(["useAll", "usePartial", "freeCount"]).optional(),
  wordBankFidelity: z.enum(["verbatim", "inflected", "mixed"]).optional(),
  blankAssignment: z.enum(["separate", "shared"]).optional(),
  clueMode: z
    .enum(["none", "firstLetter", "firstLetterDashes", "skeleton", "wordCount", "koreanChunk"])
    .optional(),
  targetWordsMode: z.enum(["exact", "approx", "hidden"]).optional(),
  connectorFrame: z.enum(["full", "partial", "bare"]).optional(),
  summarySourceMode: z.enum(["paraphrase", "inference"]).optional(),
  sourceSentenceParaphrase: z.boolean().optional(),
  modelAnswer: z
    .string()
    .describe("🔒비밀: 빈칸을 모두 채운 전체 모범 요약문(영어). correctAnswer와 동기화"),
  acceptableVariants: z
    .array(z.string())
    .optional()
    .describe("🔒비밀: 전체 답안 수준의 동치 정답"),
  scoringCriteria: z
    .array(z.string())
    .optional()
    .describe("🔒비밀: 부분점수 채점 기준(한국어, 교사면 전용)"),
  scoringMode: z.enum(["EXACT", "LEMMA", "LLM_RUBRIC"]).optional(),
};

export const summaryWritingSchema = z.object({
  ...summaryWritingFields,
  blanks: z.array(summaryWritingBlankSchema).min(1).max(3).describe("요약문 빈칸 1~3개"),
});
export type SummaryWritingQuestion = z.infer<typeof summaryWritingSchema>;

export function buildSummaryWritingSchema(blankCount: number) {
  const n = Math.min(3, Math.max(1, Math.round(blankCount)));
  const labels = Array.from({ length: n }, (_, index) => `(${String.fromCharCode(65 + index)})`);
  const labelSchema = z.enum(labels as [string, ...string[]]);

  return z.object({
    ...summaryWritingFields,
    summaryWithBlanks: z
      .string()
      .describe(
        `👁학생노출: ${labels.join(", ")}를 각 1회 포함하는 영어 요약문. 정답 어구 포함 금지`,
      ),
    blanks: z
      .array(
        summaryWritingBlankSchema.extend({
          label: labelSchema,
        }),
      )
      .length(n)
      .describe(`${n}개 요약문 영작 빈칸`),
  });
}

// ── 배열 영작 ──

export const wordOrderSchema = z.object({
  ...commonFields,
  scrambledWords: z.array(z.string()).describe("뒤섞인 단어/구 목록"),
  contextHint: z.string().optional().describe("문맥 힌트 (한국어)"),
  modelAnswer: z.string().describe("올바른 완성 문장"),
});
export type WordOrderQuestion = z.infer<typeof wordOrderSchema>;

// ── 주제문 영작 (TOPIC_SENTENCE_WRITING) ──
// 글을 논리적으로 분석해 "글의 주제"를 추출하고, 주제문(12~14단어) 또는 학술 명사구(≤12단어)로
// 만들어 ① 제시어 배열(scrambled) 또는 ② 빈칸 완성(cloze)으로 출제하는 내신 킬러 서술형.
// SUMMARY_WRITING(요약문 영작) + WORD_ORDER(배열 영작)의 하이브리드 — 필드명을 재사용해
// 마스킹/렌더/직렬화 인프라를 공유한다.
// 🔒비밀(학생 비노출): blanks[].answer / acceptableVariants / requiredLemmas / modelAnswer /
//   wordBankDistractors / scoringCriteria. 👁학생노출: mode / topicForm / summaryWithBlanks /
//   blanks[].(label|firstLetterHint|targetWordCount|connectorFrameAfter) / koreanGloss /
//   wordBank / scrambledWords.

const topicSentenceWritingBlankSchema = summaryWritingBlankSchema;

const topicSentenceWritingFields = {
  ...commonFields,
  mode: z
    .enum(["scrambled", "cloze"])
    .describe("출제 방식: scrambled=제시어 배열, cloze=주제문 빈칸 완성"),
  topicForm: z
    .enum(["sentence", "nounPhrase"])
    .optional()
    .describe("주제 형태: sentence=주제문(12~14단어), nounPhrase=주제 명사구(≤12단어 학술표현)"),
  // 👁공통 단서
  koreanGloss: z
    .string()
    .optional()
    .describe("👁학생노출(hintEnabled): [주제 힌트] 한국어. 정답 어구를 1:1 직역 나열하지 말 것(누수)"),
  // ── scrambled 모드 (WORD_ORDER 류) ──
  scrambledWords: z
    .array(z.string())
    .optional()
    .describe("👁학생노출(mode=scrambled): 제시어 칩(셔플됨, 미끼 포함 가능). 정답 어순과 같으면 안 됨"),
  // ── cloze 모드 (SUMMARY_WRITING 류) ──
  summaryWithBlanks: z
    .string()
    .optional()
    .describe("👁학생노출(mode=cloze): (A){,(B)} placeholder만 담은 주제문. 정답 어구 절대 미포함"),
  wordBank: z
    .array(z.string())
    .optional()
    .describe("👁학생노출(mode=cloze): [보기] 제시어 칩(셔플, 미끼 포함). 중복 필요 단어는 같은 문자열 2개로"),
  wordBankDistractors: z
    .array(z.string())
    .optional()
    .describe("🔒비밀: wordBank/scrambledWords 중 정답에 쓰이지 않는 미끼 목록(검수/교사면 전용)"),
  // 메타(설정 반영, optional)
  clueMode: z
    .enum(["none", "firstLetter", "firstLetterDashes", "skeleton", "wordCount", "koreanChunk"])
    .optional(),
  targetWordsMode: z.enum(["exact", "approx", "hidden"]).optional(),
  wordBankFidelity: z.enum(["verbatim", "inflected", "mixed"]).optional(),
  blankAssignment: z.enum(["separate", "shared"]).optional(),
  sourceMode: z.enum(["explicit", "paraphrase", "inference"]).optional(),
  sourceSentenceParaphrase: z.boolean().optional(),
  // 🔒정답계열
  modelAnswer: z
    .string()
    .describe("🔒비밀: 완성된 주제문/명사구 전체(영어). correctAnswer와 동기화"),
  acceptableVariants: z
    .array(z.string())
    .optional()
    .describe("🔒비밀: 전체 답안 수준의 동치 정답"),
  scoringCriteria: z
    .array(z.string())
    .optional()
    .describe("🔒비밀: 부분점수 채점 기준(한국어, 교사면 전용)"),
};

export const topicSentenceWritingSchema = z.object({
  ...topicSentenceWritingFields,
  blanks: z
    .array(topicSentenceWritingBlankSchema)
    .max(2)
    .optional()
    .describe("주제문 빈칸 1~2개 (mode=cloze 일 때만)"),
});
export type TopicSentenceWritingQuestion = z.infer<typeof topicSentenceWritingSchema>;

export function buildTopicSentenceWritingSchema(blankCount: number) {
  const n = Math.min(2, Math.max(1, Math.round(blankCount)));
  const labels = Array.from({ length: n }, (_, index) => `(${String.fromCharCode(65 + index)})`);
  const labelSchema = z.enum(labels as [string, ...string[]]);

  return z.object({
    ...topicSentenceWritingFields,
    summaryWithBlanks: z
      .string()
      .optional()
      .describe(
        `👁학생노출(mode=cloze): ${labels.join(", ")}를 각 1회 포함하는 영어 주제문. 정답 어구 포함 금지`,
      ),
    blanks: z
      .array(
        topicSentenceWritingBlankSchema.extend({
          label: labelSchema,
        }),
      )
      .max(n)
      .optional()
      .describe(`${n}개 주제문 빈칸 (mode=cloze 일 때만)`),
  });
}

// ── 문법 오류 수정 ──

const grammarCorrectionUnderlinedSegmentSchema = z.object({
  label: z.string().optional().describe("(A), (B) style label for this underlined segment"),
  sourceText: z.string().describe("원문 지문에 실제로 있는 문장/절 단위의 밑줄 구간"),
  displayedText: z.string().optional().describe("학생에게 보일 밑줄 구간. 오류 구간은 sourceText 안의 correctedPart를 errorPart로 바꾼 텍스트"),
  isError: z.boolean().describe("이 밑줄 구간 안에 학생이 찾아야 할 어법 오류가 있는지 여부"),
  errorPart: z.string().optional().describe("isError=true일 때 displayedText 안에 숨어 있는 틀린 표현"),
  correctedPart: z.string().optional().describe("isError=true일 때 학생이 써야 하는 올바른 표현"),
  surroundingText: z.string().optional().describe("sourceText 위치 식별용 주변 원문"),
});

export const grammarCorrectionSchema = z.object({
  ...commonFields,
  underlinedSegments: z
    .array(grammarCorrectionUnderlinedSegmentSchema)
    .min(1)
    .max(5)
    .describe("문장/절 단위 밑줄 구간 1~5개. 모든 밑줄 구간 안에 어법 오류가 숨어 있어야 함"),
  passageWithUnderline: z
    .string()
    .optional()
    .describe("서버가 재구성하는 밑줄 구간 포함 지문 (__구간__ 마커 사용)"),
  errorPart: z.string().optional().describe("첫 번째 밑줄 구간 안에 숨어 있는 틀린 표현"),
  errorParts: z.array(z.string()).optional().describe("각 밑줄 구간 안에 숨어 있는 틀린 표현 목록"),
  correctedPart: z.string().optional().describe("첫 번째 밑줄 구간에서 학생이 써야 하는 올바른 표현"),
  correctedParts: z.array(z.string()).optional().describe("각 밑줄 구간에서 학생이 써야 하는 올바른 표현 목록"),
  correctedSentence: z.string().optional().describe("correctedPart가 들어간 원문 문장"),
  sentenceWithError: z.string().optional().describe("legacy fallback only"),
}).superRefine((question, ctx) => {
  const errorItems = question.underlinedSegments.filter((item) => item.isError);
  if (errorItems.length !== question.underlinedSegments.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["underlinedSegments"],
      message: "Every GRAMMAR_CORRECTION underlined segment must have isError=true.",
    });
    return;
  }

  const correctedParts = errorItems.map((item, index) => {
    return (
      item.correctedPart ||
      question.correctedParts?.[index] ||
      (index === 0 ? question.correctedPart ?? "" : "")
    ).trim();
  });
  const errorParts = errorItems.map((item, index) => {
    return (
      item.errorPart ||
      question.errorParts?.[index] ||
      (index === 0 ? question.errorPart || "" : "")
    ).trim();
  });

  errorItems.forEach((errorItem, index) => {
    const errorPart = errorParts[index] || "";
    const correctedPart = correctedParts[index] || "";
    const sourceText = errorItem.sourceText.trim();
    const displayedText = (errorItem.displayedText || sourceText).trim();

    if (!errorPart || !correctedPart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["underlinedSegments", index],
        message: "Each error underlined segment must include errorPart and correctedPart.",
      });
    }
    if (errorPart && correctedPart && errorPart === correctedPart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["underlinedSegments", index],
        message: "errorPart and correctedPart must be different.",
      });
    }
    if (correctedPart && !includesLooseSchemaText(sourceText, correctedPart)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["underlinedSegments", index, "correctedPart"],
        message: "correctedPart must appear inside the original underlined sourceText.",
      });
    }
    if (errorPart && !includesLooseSchemaText(displayedText, errorPart)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["underlinedSegments", index, "errorPart"],
        message: "errorPart must appear inside the displayed underlined text.",
      });
    }
    if (sourceText === displayedText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["underlinedSegments", index],
        message: "The error underlined segment must display a mutated text, not the original sourceText.",
      });
    }
  });

  // The generation pipeline post-processes GRAMMAR_CORRECTION and rewrites
  // correctAnswer from underlinedSegments. Keep the schema gate focused on the
  // source-backed mutation contract so a harmless answer-format drift can be
  // normalized instead of causing generateObject to discard the whole question.
});
export type GrammarCorrectionQuestion = z.infer<typeof grammarCorrectionSchema>;

function includesLooseSchemaText(text: string, fragment: string): boolean {
  return normalizeSchemaComparable(text).includes(normalizeSchemaComparable(fragment));
}

function normalizeSchemaComparable(value: string): string {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
