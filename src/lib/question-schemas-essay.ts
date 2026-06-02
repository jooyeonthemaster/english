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

// ── 배열 영작 ──

export const wordOrderSchema = z.object({
  ...commonFields,
  scrambledWords: z.array(z.string()).describe("뒤섞인 단어/구 목록"),
  contextHint: z.string().optional().describe("문맥 힌트 (한국어)"),
  modelAnswer: z.string().describe("올바른 완성 문장"),
});
export type WordOrderQuestion = z.infer<typeof wordOrderSchema>;

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
  correctedPart: z.string().describe("첫 번째 밑줄 구간에서 학생이 써야 하는 올바른 표현"),
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
      (index === 0 ? question.correctedPart : "")
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
    if (correctedPart && !sourceText.includes(correctedPart)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["underlinedSegments", index, "correctedPart"],
        message: "correctedPart must appear inside the original underlined sourceText.",
      });
    }
    if (errorPart && !displayedText.includes(errorPart)) {
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

  const expectedAnswer = correctedParts
    .filter(Boolean)
    .map((part, index) => `(${String.fromCharCode(65 + index)}) ${part}`)
    .join(", ");
  if (question.correctAnswer.trim() !== expectedAnswer) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["correctAnswer"],
      message: "correctAnswer must equal every label and correctedPart joined by comma + space.",
    });
  }
});
export type GrammarCorrectionQuestion = z.infer<typeof grammarCorrectionSchema>;
