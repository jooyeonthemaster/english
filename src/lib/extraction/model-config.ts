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

// `||` + trim (NOT `??`): an EMPTY env (GEMINI_MODEL="") must fall back too.
// `??` only catches null/undefined, so a blank env yielded model="" →
// `models/:generateContent` → 404 → restoration pages all DEAD.
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";

const GEMINI_FLASH: ExtractionAiModelConfig = {
  model: DEFAULT_GEMINI_MODEL,
  temperature: 0,
  topK: 1,
  topP: 0,
  maxOutputTokens: 8192,
  thinkingBudget: 0,
};

// passage-restoration 전용 모델 — 기본 flash-lite (env 로 오버라이드 가능).
// 검증 근거: scripts/test-restoration-lite.ts 그라운드트루스 22케이스 5라운드에서
// gemini-3.1-flash-lite 가 전 게이트(복원문·검수근거·정직성) 통과
// (3.5-flash 는 16/22 — JSON 파손·요약 잔존·한글 미제거·180s 행 재현),
// 지연 4.9s→1.9s, 건당 비용 $0.0103→$0.0017 (26-06-10 측정).
const RESTORATION_MODEL =
  process.env.GEMINI_RESTORATION_MODEL?.trim() || "gemini-3.1-flash-lite";

// problem-evidence / source-grounding 는 복원과 작업 성격이 달라 미검증 —
// 기존 모델을 유지한다 (passage-restoration 만 lite 로 분리).
const RESTORATION_SHARED: ExtractionAiModelConfig = {
  ...GEMINI_FLASH,
  // 배치 grounded 복원이 한 호출에 ~10 drafts × ~2000 tokens = 20K output 까지
  // 갈 수 있어서 32K 로 잡는다. 단일 draft 복원 호출도 같은 cfg 를 쓰는데
  // 그쪽은 출력이 ~2~3K 라 빈 헤드룸만 늘어나는 정도라 부작용 없음.
  maxOutputTokens: 32768,
};

const RESTORATION: ExtractionAiModelConfig = {
  ...RESTORATION_SHARED,
  model: RESTORATION_MODEL,
};

const CONFIG_BY_STAGE: Record<ExtractionAiStage, ExtractionAiModelConfig> = {
  ocr: GEMINI_FLASH,
  "problem-evidence": RESTORATION_SHARED,
  "source-grounding": RESTORATION_SHARED,
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
