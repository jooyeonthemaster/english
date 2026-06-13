import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import type { JSONValue, LanguageModel } from "ai";

import { GEMINI_MODEL_ID, model as geminiModel } from "@/lib/ai";

/**
 * 동형 "문항 분석" 단계 전용 LLM. SIMILAR_ANALYSIS_MODEL 로 경로 선택:
 *
 *  - 기본(미설정) | "docai-gemini" | "docai" → **Document AI 로 OCR(저작권 차단 우회) → Gemini 로 분석**.
 *      Gemini 이미지 분석은 일부 저작권 자료에서 RECITATION 으로 거부되는데, Document AI 는
 *      그 필터가 없어 OCR 만 따로 수행하고(analyzer 에서) 추출된 텍스트를 Gemini 에 넘긴다.
 *      품질 최고(Gemini) + 거부 회피. (M1 추출 파이프라인과 동일한 우회 패턴.)
 *  - "gemini" → Gemini 멀티모달(이미지 직접). 안 막히는 자료엔 최고 품질이나 막히는 자료엔 거부.
 *  - "claude" | "anthropic/..." | "claude-..." → Anthropic 직결(claude-sonnet-4-6) + jsonTool.
 *
 * 과거 OpenRouter/qwen3-vl 실험 경로는 제거(26-06-12) — 키가 어떤 환경에도 없어 동작한 적 없고,
 * 프로젝트는 Gemini 전용 원칙. 레거시 env 이름 OPENROUTER_ANALYSIS_MODEL 은 프로덕션 env 정리
 * 전까지 같은 의미로 인식한다. 인식 못 하는 값(과거 qwen/... 등)은 전부 기본 docai 경로로 수렴.
 *
 * 동형 전용이라 공유 @/lib/ai.ts 는 수정하지 않고 import 만 한다.
 */

const RAW_MODEL =
  (process.env.SIMILAR_ANALYSIS_MODEL ?? process.env.OPENROUTER_ANALYSIS_MODEL)?.trim() ||
  "docai-gemini";
const RAW_SINGLE_QUESTION_MODEL = GEMINI_MODEL_ID;

const USE_CLAUDE =
  RAW_MODEL === "claude" || RAW_MODEL.startsWith("anthropic/") || RAW_MODEL.startsWith("claude-");
const USE_GEMINI_DIRECT = RAW_MODEL === "gemini";
const USE_DOCAI = !USE_CLAUDE && !USE_GEMINI_DIRECT;

/** PREMIUM 생성과 동일한 Claude 모델 ID(직결). */
const CLAUDE_MODEL_ID = "claude-sonnet-4-6";

export const questionAnalysisModel: LanguageModel = USE_CLAUDE
  ? anthropic(CLAUDE_MODEL_ID)
  : geminiModel;

/** Follow-up analyzer for the 2nd+ question on the same page. */
export const singleQuestionAnalysisModel: LanguageModel = geminiModel;

/** generateObject 에 넘길 프로바이더별 옵션(모델 선택과 묶여 있음). */
export const questionAnalysisProviderOptions: Record<string, Record<string, JSONValue>> =
  USE_CLAUDE
    ? // 직결 + jsonTool 구조화(PREMIUM 생성과 동일).
      { anthropic: { structuredOutputMode: "jsonTool" } }
    : { google: { thinkingConfig: { thinkingBudget: 0 } } };

export const singleQuestionAnalysisProviderOptions: Record<string, Record<string, JSONValue>> = {
  google: { thinkingConfig: { thinkingBudget: 0 } },
};

/** Document AI OCR → 텍스트 분석 여부(analyzer 가 이미지 대신 OCR 텍스트를 쓰도록). */
export const questionAnalysisUseDocAi = USE_DOCAI;

/** 출력 토큰 상한. */
export const questionAnalysisMaxTokens = USE_CLAUDE ? 32_000 : 24_000;
export const singleQuestionAnalysisMaxTokens = 16_000;

/** 스탬프/로그용 실제 모델 ID. */
export const QUESTION_ANALYSIS_MODEL_ID = USE_DOCAI
  ? `docai+image+google/${GEMINI_MODEL_ID}`
  : USE_CLAUDE
    ? `anthropic/${CLAUDE_MODEL_ID}`
    : `google/${GEMINI_MODEL_ID}`;

export const QUESTION_ANALYSIS_TEXT_ONLY_MODEL_ID = USE_DOCAI
  ? `docai+text+google/${GEMINI_MODEL_ID}`
  : QUESTION_ANALYSIS_MODEL_ID;

export const SINGLE_QUESTION_ANALYSIS_MODEL_ID = `google/${RAW_SINGLE_QUESTION_MODEL}`;
