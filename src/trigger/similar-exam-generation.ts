import { logger, task } from "@trigger.dev/sdk/v3";

import {
  SIMILAR_EXAM_GENERATION_MAX_ATTEMPTS,
  SIMILAR_EXAM_GENERATION_QUEUE_CONCURRENCY,
  SIMILAR_EXAM_GENERATION_QUEUE_NAME,
} from "@/lib/concurrency-config";
import { processSimilarExamGenerationJob } from "@/lib/similar-exam-generation/runner";

type Input = { jobId: string };

export const similarExamGenerationTask = task({
  id: "similar-exam-generation",
  queue: {
    name: SIMILAR_EXAM_GENERATION_QUEUE_NAME,
    concurrencyLimit: SIMILAR_EXAM_GENERATION_QUEUE_CONCURRENCY,
  },
  retry: {
    maxAttempts: SIMILAR_EXAM_GENERATION_MAX_ATTEMPTS,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  maxDuration: 900,
  run: async (payload: Input, { ctx }) =>
    processSimilarExamGenerationJob(payload.jobId, {
      runId: ctx.run.id,
      logger,
    }),
});
