import { z } from "zod";

import { getQuestionGenerationResearchExpectedQuestionCount } from "@/lib/question-generation-research-runtime";

export interface QuestionResponseSchemaCardinality {
  /**
   * Exact count already owned by the server-side production plan. This is not
   * accepted from a model response. Callers that do not own an exact count
   * keep the legacy unbounded wrapper.
   */
  readonly expectedQuestionCount?: number;
}

function assertPositiveSafeQuestionCount(
  count: number,
  source: "production" | "research",
): void {
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error(
      `${source} response-schema question count must be a positive safe integer`,
    );
  }
}

/**
 * Builds an exact wrapper when either the server-owned production plan or the
 * sealed research runtime supplies a count. A research runtime remains the
 * authority while active: a production-plan count must agree with its seal.
 * Callers with neither count retain the legacy unbounded wrapper.
 */
export function buildResearchAwareQuestionResponseSchema<T extends z.ZodType>(
  questionSchema: T,
  cardinality: QuestionResponseSchemaCardinality = {},
) {
  const questions = z.array(questionSchema);
  const productionQuestionCount = cardinality.expectedQuestionCount;
  const researchQuestionCount =
    getQuestionGenerationResearchExpectedQuestionCount();
  if (productionQuestionCount !== undefined) {
    assertPositiveSafeQuestionCount(productionQuestionCount, "production");
  }
  if (researchQuestionCount !== undefined) {
    assertPositiveSafeQuestionCount(researchQuestionCount, "research");
  }
  if (
    productionQuestionCount !== undefined &&
    researchQuestionCount !== undefined &&
    productionQuestionCount !== researchQuestionCount
  ) {
    throw new Error(
      `production response-schema question count ${productionQuestionCount} differs from sealed research count ${researchQuestionCount}`,
    );
  }
  if (researchQuestionCount !== undefined) {
    return z.object({ questions: questions.length(researchQuestionCount) });
  }
  if (productionQuestionCount !== undefined) {
    return z.object({ questions: questions.length(productionQuestionCount) });
  }
  return z.object({ questions });
}
