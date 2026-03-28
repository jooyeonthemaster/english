import { anthropic } from "@ai-sdk/anthropic";

/**
 * Claude Sonnet 4.6 model instance for AI question generation.
 * Used with Vercel AI SDK's generateObject() for structured output.
 */
export const model = anthropic("claude-sonnet-4-6");
