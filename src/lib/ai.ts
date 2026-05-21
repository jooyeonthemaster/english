import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * Gemini 3.5 Flash model instance for AI question generation & passage analysis.
 * Used with Vercel AI SDK's generateObject() for structured output.
 */
export const GEMINI_MODEL_ID = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

export const googleGenerativeAI = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export const model = googleGenerativeAI(GEMINI_MODEL_ID);
