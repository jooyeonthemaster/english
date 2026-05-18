import { generateObject } from "ai";
import { z } from "zod";

import { model } from "@/lib/ai";

/**
 * Wrap `generateObject` with a small retry loop. The Gemini provider
 * occasionally returns truncated/empty payloads under preview-channel quotas;
 * one or two retries usually clear it. Diagnostic info (finishReason, usage,
 * raw preview) is logged on each failed attempt to make production debugging
 * tractable.
 */
export async function generateWithRetry(
  schema: z.ZodType,
  prompt: string,
  maxRetries = 2,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) console.log(`[AUTO-GEN] Retry attempt ${attempt}...`);
      const { object } = await generateObject({
        model,
        schema,
        prompt,
        providerOptions: {
          google: { thinkingConfig: { thinkingBudget: 4096 } },
        },
      });
      return object;
    } catch (err: any) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AUTO-GEN] Attempt ${attempt} failed:`, msg);
      // Diagnostic info for debugging
      if (err.finishReason)
        console.warn(`[AUTO-GEN]   finishReason: ${err.finishReason}`);
      if (err.usage)
        console.warn(
          `[AUTO-GEN]   tokens: input=${err.usage.inputTokens}, output=${err.usage.outputTokens}`,
        );
      if (err.text)
        console.warn(
          `[AUTO-GEN]   rawText (first 300): ${err.text.slice(0, 300)}`,
        );
    }
  }
  throw lastError;
}
