import type { ExtractionMode } from "./modes";

export type ExtractionAiStage =
  | "ocr"
  | "problem-evidence"
  | "source-grounding"
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

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

const GEMINI_FLASH: ExtractionAiModelConfig = {
  model: DEFAULT_GEMINI_MODEL,
  temperature: 0,
  topK: 1,
  topP: 0,
  maxOutputTokens: 8192,
  thinkingBudget: 0,
};

const RESTORATION: ExtractionAiModelConfig = {
  ...GEMINI_FLASH,
  // 배치 grounded 복원이 한 호출에 ~10 drafts × ~2000 tokens = 20K output 까지
  // 갈 수 있어서 32K 로 잡는다. 단일 draft 복원 호출도 같은 cfg 를 쓰는데
  // 그쪽은 출력이 ~2~3K 라 빈 헤드룸만 늘어나는 정도라 부작용 없음.
  maxOutputTokens: 32768,
};

const CONFIG_BY_STAGE: Record<ExtractionAiStage, ExtractionAiModelConfig> = {
  ocr: GEMINI_FLASH,
  "problem-evidence": RESTORATION,
  "source-grounding": RESTORATION,
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
