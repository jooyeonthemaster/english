import {
  buildHeuristicProblemEvidence,
  buildProblemEvidencePrompts,
  mergeProblemEvidence,
  problemEvidenceResponseSchema,
  type ProblemEvidenceResponse,
} from "@/lib/extraction/problem-evidence";
import type { RestorationQuestionInput } from "@/lib/extraction/m2-restoration";
import { getExtractionAiModelName } from "@/lib/extraction/model-config";
import { generateStructuredTextWithTriggerFetch } from "./gemini-ocr";

const TEXT_CALL_TIMEOUT_MS = 120_000;

export interface ProblemEvidenceResult {
  evidence: ProblemEvidenceResponse | null;
  model: string | null;
  status: "EXTRACTED" | "SKIPPED_CLEAN" | "FAILED";
  error?: string;
}

const PROBLEM_MARKER_PATTERNS = [
  /[\u2460-\u2468]/,
  /\([A-E]\)/,
  /\(\s*(?:[\u2460-\u24681-5]|\?|[^\x00-\x7F]{1,3})\s*\)/,
  /____+/,
  /\[[^\]]+]/,
  /\bchoose\b/i,
  /\bwhich of the following\b/i,
  /insert|blank|order|irrelevant|grammar|vocabulary|summary/i,
  /[\u3131-\u318e\uac00-\ud7a3]/,
];

function shouldExtractEvidence(input: {
  rawText: string;
  questions: RestorationQuestionInput[];
}): boolean {
  if (input.questions.length > 0) return true;
  return PROBLEM_MARKER_PATTERNS.some((pattern) => pattern.test(input.rawText));
}

export async function extractProblemEvidence(input: {
  rawText: string;
  questions?: RestorationQuestionInput[];
}): Promise<ProblemEvidenceResult> {
  const questions = input.questions ?? [];
  const heuristicEvidence = buildHeuristicProblemEvidence(input.rawText);
  if (!shouldExtractEvidence({ rawText: input.rawText, questions })) {
    return {
      evidence: heuristicEvidence,
      model: null,
      status: heuristicEvidence ? "EXTRACTED" : "SKIPPED_CLEAN",
    };
  }

  try {
    const prompts = buildProblemEvidencePrompts({
      rawText: input.rawText,
      questions,
    });
    const result = await generateStructuredTextWithTriggerFetch({
      stage: "problem-evidence",
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      timeoutInMs: TEXT_CALL_TIMEOUT_MS,
      schema: problemEvidenceResponseSchema,
    });
    return {
      evidence: mergeProblemEvidence(result.object, heuristicEvidence),
      model: getExtractionAiModelName("problem-evidence"),
      status: "EXTRACTED",
    };
  } catch (err) {
    return {
      evidence: heuristicEvidence,
      model: getExtractionAiModelName("problem-evidence"),
      status: heuristicEvidence ? "EXTRACTED" : "FAILED",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
