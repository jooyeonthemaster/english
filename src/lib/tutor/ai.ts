import { createGoogleGenerativeAI } from "@ai-sdk/google";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

const provider = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export function getTutorModel() {
  return provider(process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL);
}

export function getTutorModelNameForAudit() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}
