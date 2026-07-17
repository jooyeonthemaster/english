import assert from "node:assert/strict";
import test from "node:test";

import { runWithQuestionGenerationAssignmentBudget } from "../../src/lib/question-generation-assignment-budget";

const descriptor = {
  jobId: "off-identity-job",
  route: "FAST" as const,
  generationPlan: "STANDARD" as const,
  questionType: "BLANK_INFERENCE",
  difficulty: "INTERMEDIATE",
};

test("OFF returns the exact callback value and promise without an async wrapper", () => {
  const previous = process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE;
  process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE = "OFF";
  try {
    const marker = { exact: true };
    assert.strictEqual(
      runWithQuestionGenerationAssignmentBudget(descriptor, () => marker),
      marker,
    );

    const promise = Promise.resolve(marker);
    assert.strictEqual(
      runWithQuestionGenerationAssignmentBudget(descriptor, () => promise),
      promise,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE;
    } else {
      process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE = previous;
    }
  }
});
