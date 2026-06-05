import { createGoogleGenerativeAI } from "@ai-sdk/google";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

const provider = createGoogleGenerativeAI({
  // `?.trim() ||` (NOT `??`): a blank GEMINI_API_KEY="" must fall through, since
  // @ai-sdk's loadApiKey accepts "" as valid and skips its own env fallback.
  apiKey:
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    undefined,
});

export function getTutorModel() {
  return provider(process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL);
}

export function getTutorModelNameForAudit() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}
