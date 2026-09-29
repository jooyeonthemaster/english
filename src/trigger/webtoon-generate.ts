import { task, logger } from "@trigger.dev/sdk/v3";
import { processWebtoonGeneration } from "@/lib/webtoon-processor";

type Input = { webtoonId: string };

export const webtoonGenerateTask = task({
  id: "webtoon-generate",
  // 전 학원 공용 큐. 1편 ≈ 콘티 20~40초 + 이미지 25~40초(26-09-30 실측)라 2로는 20편
  // 일괄이 10분을 넘겼다 — 4로 올려 대기만 줄인다(총 연산량 동일).
  queue: { name: "webtoon-generate", concurrencyLimit: 4 },
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
