import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * Gemini Flash model instance for AI question generation & passage analysis.
 * Used with Vercel AI SDK structured JSON output.
 */
// `||` + trim (NOT `??`) so a blank env (GEMINI_MODEL="") falls back to a real model.
export const GEMINI_MODEL_ID = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";

export const googleGenerativeAI = createGoogleGenerativeAI({
  // `?.trim() ||` (NOT `??`): an EMPTY env (GEMINI_API_KEY="") must fall through
  // to the next key. @ai-sdk's loadApiKey treats "" as a valid key and skips its
  // own env fallback, so a blank GEMINI_API_KEY would otherwise send an empty key.
  apiKey:
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    undefined,
});

export const model = googleGenerativeAI(GEMINI_MODEL_ID);
