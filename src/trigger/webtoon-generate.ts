import { task, logger } from "@trigger.dev/sdk/v3";
import { processWebtoonGeneration } from "@/lib/webtoon-processor";

type Input = { webtoonId: string };

export const webtoonGenerateTask = task({
  id: "webtoon-generate",
  queue: { name: "webtoon-generate", concurrencyLimit: 2 },
  retry: {
    maxAttempts: 1,
  },
  maxDuration: 900,
  run: async (payload: Input) => {
    const { webtoonId } = payload;
    logger.log("[webtoon-generate] start", { webtoonId });

    const result = await processWebtoonGeneration(webtoonId, { source: "trigger" });

    logger.log("[webtoon-generate] finished", { webtoonId, result });
    return result;
  },
});
