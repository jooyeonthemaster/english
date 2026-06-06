import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { JSONValue, LanguageModel } from "ai";

import { GEMINI_MODEL_ID, model as geminiModel } from "@/lib/ai";

/**
 * 동형 "문항 분석" 단계 전용 LLM. OPENROUTER_ANALYSIS_MODEL 로 경로 선택:
 *
 *  - "docai-gemini" | "docai" → **Document AI 로 OCR(저작권 차단 우회) → Gemini 로 텍스트 분석**.
 *      Gemini 이미지 분석은 일부 저작권 자료에서 RECITATION 으로 거부되는데, Document AI 는
 *      그 필터가 없어 OCR 만 따로 수행하고(analyzer 에서) 추출된 텍스트를 Gemini 에 넘긴다.
 *      품질 최고(Gemini) + 거부 회피. (M1 추출 파이프라인과 동일한 우회 패턴.)
 *  - "gemini" → Gemini 멀티모달(이미지 직접). 안 막히는 자료엔 최고 품질이나 막히는 자료엔 거부.
 *  - "claude" | "anthropic/..." | "claude-..." → Anthropic 직결(claude-sonnet-4-6) + jsonTool.
 *  - 그 외(미설정 포함) → OpenRouter(기본 qwen3-vl-235b). reasoning 모델이면
 *      OPENROUTER_ANALYSIS_REASONING=xhigh|high|medium|low|minimal 로 effort 지정(미설정=미전송).
 *
 * 동형 전용이라 공유 @/lib/ai.ts 는 수정하지 않고 import 만 한다.
 */

const RAW_MODEL = process.env.OPENROUTER_ANALYSIS_MODEL?.trim() || "qwen/qwen3-vl-235b-a22b-instruct";
const RAW_SINGLE_QUESTION_MODEL = GEMINI_MODEL_ID;

const USE_DOCAI = RAW_MODEL === "docai-gemini" || RAW_MODEL === "docai";
const USE_GEMINI = RAW_MODEL === "gemini" || USE_DOCAI;
const USE_CLAUDE =
  !USE_GEMINI &&
  (RAW_MODEL === "claude" || RAW_MODEL.startsWith("anthropic/") || RAW_MODEL.startsWith("claude-"));

/** PREMIUM 생성과 동일한 Claude 모델 ID(직결). */
const CLAUDE_MODEL_ID = "claude-sonnet-4-6";

// reasoning(OpenRouter reasoning 모델 전용). none/off/미설정/미지원값이면 미전송.
const VALID_EFFORTS = ["xhigh", "high", "medium", "low", "minimal"] as const;
const envEffort = process.env.OPENROUTER_ANALYSIS_REASONING?.toLowerCase();
const reasoningEffort =
  envEffort && (VALID_EFFORTS as readonly string[]).includes(envEffort) ? envEffort : null;

function buildOpenRouterModel(): LanguageModel {
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
    // HTTP 헤더는 ByteString(Latin1)만 허용 → ASCII only.
    headers: {
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
      "X-Title": "Nara ERP - Similar Question Analysis",
    },
  });
  return openrouter.chat(RAW_MODEL);
}

export const questionAnalysisModel: LanguageModel = USE_GEMINI
  ? geminiModel
  : USE_CLAUDE
    ? anthropic(CLAUDE_MODEL_ID)
    : buildOpenRouterModel();

/** Follow-up analyzer for the 2nd+ question on the same page. */
export const singleQuestionAnalysisModel: LanguageModel = geminiModel;

/** generateObject 에 넘길 프로바이더별 옵션(모델 선택과 묶여 있음). */
export const questionAnalysisProviderOptions: Record<string, Record<string, JSONValue>> = USE_GEMINI
  ? { google: { thinkingConfig: { thinkingBudget: 0 } } }
  : USE_CLAUDE
    ? // OpenRouter tool-mode wrinkle 회피: 직결 + jsonTool 구조화(PREMIUM 생성과 동일).
      { anthropic: { structuredOutputMode: "jsonTool" } }
    : reasoningEffort
      ? { openrouter: { reasoning: { effort: reasoningEffort } } }
      : { openrouter: {} };

export const singleQuestionAnalysisProviderOptions: Record<string, Record<string, JSONValue>> = {
  google: { thinkingConfig: { thinkingBudget: 0 } },
};

/** Document AI OCR → 텍스트 분석 여부(analyzer 가 이미지 대신 OCR 텍스트를 쓰도록). */
export const questionAnalysisUseDocAi = USE_DOCAI;

/** 출력 토큰 상한 — Gemini/ Claude 는 여유, qwen3-vl-235b 는 16,384 한도라 초과 불가. */
export const questionAnalysisMaxTokens = USE_GEMINI ? 24_000 : USE_CLAUDE ? 32_000 : 16_384;
export const singleQuestionAnalysisMaxTokens = 16_000;

/** 스탬프/로그용 실제 모델 ID. */
export const QUESTION_ANALYSIS_MODEL_ID = USE_DOCAI
  ? `docai+image+google/${GEMINI_MODEL_ID}`
  : USE_GEMINI
    ? `google/${GEMINI_MODEL_ID}`
    : USE_CLAUDE
      ? `anthropic/${CLAUDE_MODEL_ID}`
      : RAW_MODEL;

export const QUESTION_ANALYSIS_TEXT_ONLY_MODEL_ID = USE_DOCAI
  ? `docai+text+google/${GEMINI_MODEL_ID}`
  : QUESTION_ANALYSIS_MODEL_ID;

export const SINGLE_QUESTION_ANALYSIS_MODEL_ID = `google/${RAW_SINGLE_QUESTION_MODEL}`;
