import { logger, task } from "@trigger.dev/sdk/v3";
import { runGeminiTextHealthCheck } from "./_lib/gemini-ocr";

export const geminiHealthCheckTask = task({
  id: "gemini-health-check",
  retry: {
    maxAttempts: 1,
  },
  async run() {
    const startedAt = Date.now();
    const result = await runGeminiTextHealthCheck(30_000);
    const latencyMs = Date.now() - startedAt;

    logger.info("gemini health check complete", {
      latencyMs,
      text: result.text,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    });

    return {
      ok: result.text.toLowerCase().includes("ok"),
      text: result.text,
      latencyMs,
      usage: result.usage,
    };
  },
});
