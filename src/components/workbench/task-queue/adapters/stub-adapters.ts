import type { TaskAdapter, TaskDomain } from "../types";

/**
 * Placeholder adapters for domains that don't have background jobs yet.
 * Returns an empty list. Replace with a live adapter once the domain
 * starts persisting background tasks.
 */
function createStubAdapter(domain: TaskDomain): TaskAdapter {
  return {
    domain,
    fetchTasks: async () => [],
  };
}

export const passageAnalysisAdapter = createStubAdapter("passage-analysis");
export const questionGenerationAdapter = createStubAdapter("question-generation");
export const examGenerationAdapter = createStubAdapter("exam-generation");
