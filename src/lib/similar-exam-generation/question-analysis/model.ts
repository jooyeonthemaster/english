import "server-only";

import type { LanguageModel } from "ai";

import {
  ATLAS_PREMIUM_MODEL_ID,
  ATLAS_STANDARD_MODEL_ID,
  atlasChatModel,
  normalizeAtlasModelId,
} from "@/lib/atlas-ai";

const RAW_MODEL =
  (process.env.SIMILAR_ANALYSIS_MODEL ?? process.env.OPENROUTER_ANALYSIS_MODEL)?.trim() ||
  "docai-gemini";

const USE_CLAUDE =
  RAW_MODEL === "claude" ||
  RAW_MODEL.startsWith("anthropic/") ||
  RAW_MODEL.startsWith("claude-");
const USE_ATLAS_GEMINI = RAW_MODEL === "gemini" || RAW_MODEL.startsWith("google/");
const USE_DOCAI = !USE_CLAUDE && !USE_ATLAS_GEMINI;

const ANALYSIS_MODEL_ID = USE_CLAUDE
  ? ATLAS_PREMIUM_MODEL_ID
  : normalizeAtlasModelId(USE_ATLAS_GEMINI ? RAW_MODEL : ATLAS_STANDARD_MODEL_ID);
const SINGLE_QUESTION_MODEL_ID = ATLAS_STANDARD_MODEL_ID;

export const questionAnalysisModel: LanguageModel = atlasChatModel(ANALYSIS_MODEL_ID);

/** Follow-up analyzer for the 2nd+ question on the same page. */
export const singleQuestionAnalysisModel: LanguageModel = atlasChatModel(SINGLE_QUESTION_MODEL_ID);

/** Document AI OCR extracts page text first, then Atlas analyzes that text. */
export const questionAnalysisUseDocAi = USE_DOCAI;

export const questionAnalysisMaxTokens = USE_CLAUDE ? 32_000 : 24_000;
export const singleQuestionAnalysisMaxTokens = 16_000;

export const QUESTION_ANALYSIS_MODEL_ID = USE_DOCAI
  ? `docai+image+${ANALYSIS_MODEL_ID}`
  : ANALYSIS_MODEL_ID;

export const QUESTION_ANALYSIS_TEXT_ONLY_MODEL_ID = USE_DOCAI
  ? `docai+text+${ANALYSIS_MODEL_ID}`
  : QUESTION_ANALYSIS_MODEL_ID;

export const SINGLE_QUESTION_ANALYSIS_MODEL_ID = SINGLE_QUESTION_MODEL_ID;
