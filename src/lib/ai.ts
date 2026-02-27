import { google } from "@ai-sdk/google";

/**
 * Gemini 3.0 Flash model instance for AI tutoring.
 * Used with Vercel AI SDK's streamText() for streaming responses.
 */
export const model = google("gemini-3-flash-preview");
