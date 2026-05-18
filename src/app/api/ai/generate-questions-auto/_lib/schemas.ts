import { z } from "zod";

/** Step 1 planning schema — AI plans which question types to use. */
export const planSchema = z.object({
  plan: z.array(
    z.object({
      subType: z.string().describe("Question type ID"),
      count: z.number().describe("Number of questions for this type"),
      reason: z
        .string()
        .describe("왜 이 유형을 선택했는지 분석 데이터 근거와 함께 설명"),
      targetPoints: z
        .array(z.string())
        .describe(
          "이 유형에서 활용할 분석 포인트 (어휘, 문법, 출제포인트 등에서 선별)",
        ),
    }),
  ),
  rationale: z.string().describe("전체 출제 전략 요약 (한국어)"),
});

export type PlanResult = z.infer<typeof planSchema>;

/** Fallback question schema for types without a dedicated structured schema. */
const fallbackQuestionSchema = z.object({
  type: z.string(),
  subType: z.string().optional(),
  direction: z.string().optional(),
  questionText: z.string(),
  options: z
    .array(z.object({ label: z.string(), text: z.string() }))
    .optional(),
  correctAnswer: z.string(),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]),
  explanation: z.string(),
  keyPoints: z.array(z.string()),
  wrongOptionExplanations: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string()),
});

export const fallbackResponseSchema = z.object({
  questions: z.array(fallbackQuestionSchema),
});
