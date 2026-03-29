import { google } from "@ai-sdk/google";

/**
 * Gemini 3.0 Flash model instance for AI question generation & passage analysis.
 * Used with Vercel AI SDK's generateObject() for structured output.
 */
export const model = google("gemini-3-flash-preview");
