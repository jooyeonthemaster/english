// ============================================================================
// Gemini Flash AI 채점 — 자유서술(직독직해/구문전환/조건영작/어법고치기) (스펙 §4.3)
// 반드시 getTutorModel()=Gemini. Claude 금지(프로젝트 정책).
// ============================================================================

import { generateText, Output } from "ai";
import { z } from "zod";
import { getTutorModel, getTutorModelNameForAudit } from "@/lib/tutor/ai";
import { atlasUsageWithCost } from "@/lib/atlas-ai";
import { recordAiCost } from "@/lib/platform-api-costs";

export const AiGradeResultSchema = z.object({
  verdict: z.enum(["correct", "partial", "incorrect"]),
  scorePct: z.number().min(0).max(100),
  copiedFromSource: z.boolean(),
  matchedConditions: z.array(z.string()).default([]),
  missedConditions: z.array(z.string()).default([]),
  feedbackKo: z.string(),
  evidence: z.string().optional(),
});
export type AiGradeResult = z.infer<typeof AiGradeResultSchema>;

export interface AiGradeInput {
  variant: string; // translate | transform | conditional | correct
  studentAnswer: string;
  instruction?: string;
  sourceText?: string; // 원문(직독직해 영어 / 전환 대상 / 오류 문장)
  modelAnswer?: string;
  conditions?: string[];
  transformType?: string;
  rubric?: string[];
  /** 원가 기록 귀속용 학원 ID(채점 컨텍스트/학생 학원에서 전달). */
  academyId?: string | null;
}

const SYSTEM = [
  "You are a strict but fair Korean high-school English exam grader for a mobile study app.",
  "Output JSON only. Never reveal the full model answer in feedbackKo (give a hint, not the answer).",
  "If the student answer is a verbatim copy of the given source text (sourceText), set copiedFromSource=true and scorePct=0 (베끼기 금지).",
  "Grade by meaning and whether stated conditions are satisfied, not by surface string overlap.",
  "For Korean 직독직해(translate): accept natural Korean with correct meaning and key structural relations even if particles/word-order differ.",
  "feedbackKo: one or two concise Korean sentences coaching what to fix. Do not include model/provider names.",
].join("\n");

export async function aiGradeText(input: AiGradeInput): Promise<AiGradeResult & { model: string; latencyMs: number }> {
  const startedAt = Date.now();
  const result = await generateText({
    model: getTutorModel(),
    output: Output.object({ schema: AiGradeResultSchema }),
    system: SYSTEM,
    prompt: JSON.stringify({
      task: "Grade the student's free-response answer.",
      variant: input.variant,
      instruction: input.instruction ?? "",
      sourceText: input.sourceText ?? "",
      modelAnswer: input.modelAnswer ?? "",
      transformType: input.transformType ?? "",
      conditions: input.conditions ?? [],
      rubric: input.rubric ?? [],
      studentAnswer: input.studentAnswer,
      rules: [
        "verbatim copy of sourceText => copiedFromSource=true, scorePct=0, verdict=incorrect",
        "all conditions satisfied & meaning correct => verdict=correct, scorePct>=90",
        "meaning mostly right but a condition missed => verdict=partial",
        "wrong meaning or empty => verdict=incorrect, scorePct<=40",
      ],
    }),
  });
  const model = getTutorModelNameForAudit();
  await recordAiCost({
    sourceType: "TUTOR_GRADING",
    sourceDetail: "ai-grade",
    academyId: input.academyId,
    model,
    operationType: "AI_GRADING",
    usage: atlasUsageWithCost(result),
  });
  return {
    ...result.output,
    model,
    latencyMs: Date.now() - startedAt,
  };
}
