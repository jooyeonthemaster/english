import {
  runQuestionGeneration,
  runQuestionGenerationWithEmptyRetry,
  type RunGenerationInput,
} from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import { buildRejectionSummary } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers";
import type {
  QuestionGenerationUsageEvent,
  RejectionRecorder,
} from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation-types";
import {
  runWithQuestionGenerationResearchPromptProfile,
  type QuestionGenerationResearchPromptProfileId,
} from "@/lib/question-generation-research-profiles";
import { runWithQuestionGenerationResearchRuntime } from "@/lib/question-generation-research-runtime";

import { QuestionGenerationCallsiteAdapter } from "./question-generation-callsite-adapter";

export interface PhaseCQuestionGenerationRunnerInput {
  adapter: QuestionGenerationCallsiteAdapter;
  generation: RunGenerationInput;
  maxAttempts?: number;
  deadlineAt?: number;
  logPrefix?: string;
  /** Frozen S1 mechanism profile. Presence selects the direct one-shot core. */
  promptProfileId?: QuestionGenerationResearchPromptProfileId;
}

/**
 * Research-only runner for one frozen subtype assignment. It deliberately
 * does not accept a count separate from the sealed adapter and production
 * plan: all three facts must agree before ALS or provider work begins.
 */
export async function runPhaseCQuestionGenerationAssignment({
  adapter,
  generation,
  maxAttempts,
  deadlineAt,
  logPrefix = "PHASE-C-ZERO-NETWORK",
  promptProfileId,
}: PhaseCQuestionGenerationRunnerInput) {
  if (generation.plan.length !== 1) {
    throw new Error("Phase-C runner requires exactly one question subtype");
  }
  const [item] = generation.plan;
  if (
    !item ||
    !Number.isSafeInteger(item.count) ||
    item.count <= 0 ||
    item.count !== adapter.expectedQuestionsPerStructuredCall
  ) {
    throw new Error(
      "Phase-C production plan count differs from the sealed semantic count",
    );
  }
  if (promptProfileId) {
    if (maxAttempts !== undefined && maxAttempts !== 1) {
      throw new Error("profile screen requires maxAttempts=1 when specified");
    }
    if (
      generation.customPrompt?.trim() ||
      generation.teacherIntentBlock.trim() ||
      item.targetPoints.length > 0
    ) {
      throw new Error(
        "profile screen forbids custom, teacher-intent, and planner target-point prompt drift",
      );
    }
    const usageEvents: QuestionGenerationUsageEvent[] = [];
    const rejectionRecorder: RejectionRecorder = { issues: [] };
    const generationWithUsage: RunGenerationInput = {
      ...generation,
      onModelUsage: (event) => {
        usageEvents.push(event);
        generation.onModelUsage?.(event);
      },
    };
    const questions = await runWithQuestionGenerationResearchPromptProfile(
      promptProfileId,
      () =>
        runWithQuestionGenerationResearchRuntime(adapter, () =>
          runQuestionGeneration(generationWithUsage, {
            qualityMode: "strict",
            attemptIndex: 0,
            rejectionRecorder,
            deadlineAt,
          }),
        ),
    );
    return {
      questions,
      attempts: 1,
      relaxedFallback: false,
      rejectionSummary: buildRejectionSummary(rejectionRecorder),
      usageEvents,
    };
  }
  return runWithQuestionGenerationResearchRuntime(adapter, () =>
    runQuestionGenerationWithEmptyRetry(generation, {
      maxAttempts,
      deadlineAt,
      logPrefix,
    }),
  );
}
