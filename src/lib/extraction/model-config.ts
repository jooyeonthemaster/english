import type { ExtractionMode } from "./modes";

export type ExtractionAiStage =
  | "ocr"
  | "passage-restoration"
  | "restoration-verification";

export interface ExtractionAiModelConfig {
  model: string;
  temperature: number;
  topK: number;
  topP: number;
  maxOutputTokens: number;
  thinkingBudget: number;
}

const GEMINI_FLASH: ExtractionAiModelConfig = {
  model: "gemini-3-flash-preview",
  temperature: 0,
  topK: 1,
  topP: 0,
  maxOutputTokens: 8192,
  thinkingBudget: 0,
};

const RESTORATION: ExtractionAiModelConfig = {
  ...GEMINI_FLASH,
  maxOutputTokens: 16384,
};

const CONFIG_BY_STAGE: Record<ExtractionAiStage, ExtractionAiModelConfig> = {
  ocr: GEMINI_FLASH,
  "passage-restoration": RESTORATION,
  "restoration-verification": GEMINI_FLASH,
};

export function getExtractionAiConfig(
  stage: ExtractionAiStage,
  mode?: ExtractionMode,
): ExtractionAiModelConfig {
  void mode;
  return CONFIG_BY_STAGE[stage];
}

export function getExtractionAiModelName(
  stage: ExtractionAiStage,
  mode?: ExtractionMode,
): string {
  return getExtractionAiConfig(stage, mode).model;
}
