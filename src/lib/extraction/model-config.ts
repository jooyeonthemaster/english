import type { ExtractionMode } from "./modes";
import {
  ATLAS_OCR_MODEL_ID,
  ATLAS_RESTORATION_MODEL_ID,
  ATLAS_STANDARD_MODEL_ID,
} from "@/lib/atlas-ai";

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
const DEFAULT_GEMINI_MODEL = ATLAS_STANDARD_MODEL_ID;

const GEMINI_FLASH: ExtractionAiModelConfig = {
  model: DEFAULT_GEMINI_MODEL,
  temperature: 0,
  topK: 1,
  topP: 0,
  maxOutputTokens: 8192,
  thinkingBudget: 0,
};

// 추출 OCR(블록 분류·구조화) 전용 모델 — 기본 flash-lite (env 로 오버라이드 가능).
// 26-06-12 전환. 복원(아래)과 달리 그라운드트루스 하니스 검증은 없음 — 분류 품질
// 회귀(지문/문제 경계 오류 등)가 보이면 GEMINI_OCR_MODEL=gemini-3.5-flash 즉시 롤백.
const OCR_MODEL = ATLAS_OCR_MODEL_ID;

const OCR: ExtractionAiModelConfig = {
  ...GEMINI_FLASH,
  model: OCR_MODEL,
};

// passage-restoration 전용 모델 — 기본 gemini-3.5-flash-lite (env
// OPENROUTER_RESTORATION_MODEL 로 오버라이드). 26-07-27 유저 지시로 3.1-flash-lite
// 에서 상향 — 크롭 복원에서 3.1 이 JSON 키 자유작명(rawText→ocrText)으로 전건
// EMPTY_OUTPUT DEAD 나던 장애의 모델 축 대응(스키마 강제는 crop-native 참조).
// (구 검증 이력: 26-06-10 scripts/test-restoration-lite.ts 22케이스에서 3.1-flash-lite
// 전 게이트 통과 — 텍스트 경로 기준이며 크롭 멀티모달 경로엔 해당 없음이 판명.)
const RESTORATION_MODEL =
  ATLAS_RESTORATION_MODEL_ID;

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
  ocr: OCR,
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
