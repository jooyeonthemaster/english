import {
  ATLAS_STANDARD_MODEL_ID,
  atlasChatModel,
  normalizeAtlasModelId,
} from "@/lib/atlas-ai";

/**
 * Legacy Gemini-named exports kept for the existing generation code. Calls now
 * go through Atlas Cloud/OpenRouter-compatible chat completions.
 */
export const GEMINI_MODEL_ID = ATLAS_STANDARD_MODEL_ID;

export const googleGenerativeAI = (modelId: string) =>
  atlasChatModel(normalizeAtlasModelId(modelId));

export const model = googleGenerativeAI(GEMINI_MODEL_ID);
