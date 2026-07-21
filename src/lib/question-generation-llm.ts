import { generateObject, generateText, Output, type JSONValue } from "ai";
import { z } from "zod";

import {
  ATLAS_CLOUD_PROVIDER,
  ATLAS_PREMIUM_MODEL_ID,
  ATLAS_PREMIUM_QGEN_MODEL_ID,
  ATLAS_STANDARD_MODEL_ID,
  ATLAS_STANDARD_QGEN_MODEL_ID,
  AtlasTransientResponseError,
  atlasChatModel,
  atlasUsageWithCost,
  isAtlasClaudeModel,
  isAtlasGeminiModel,
} from "@/lib/atlas-ai";
import { isQuestionGenerationAssignmentBudgetError } from "@/lib/atlas-production-assignment-fetch-boundary";
import {
  GEMINI_QUESTION_MAX_RETRIES,
  QUESTION_GENERATION_SDK_MAX_RETRIES,
  normalizeQuestionGenerationApplicationRetries,
} from "@/lib/concurrency-config";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import {
  QUESTION_GENERATION_RESEARCH_STAGES,
  getQuestionGenerationResearchTransportPolicy,
  hasQuestionGenerationResearchRuntime,
  runQuestionGenerationResearchStage,
  type QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";

type QuestionGenerationProvider = typeof ATLAS_CLOUD_PROVIDER;

// 26-07-20 이원 티어: STANDARD 문제생성이 flash3 사고 high 로 바뀌며 무거운
// 유형(순서 등 큰 계약 tail)의 1콜이 60s 를 넘는 실측(스모크: 60s 타임아웃 2회
// 재시도로 207s 낭비) — 기본 120s 로 상향. deadlineAt(fast 270s)이 computeAbortMs
// 로 계속 상한을 조이므로 함수 강제종료 위험은 없다. env 로 조정 가능.
const STANDARD_QUESTION_TIMEOUT_MS = readNumberEnv(
  "GEMINI_QUESTION_TIMEOUT_MS",
  120_000,
);
// 텍스트 경로(지문분석·passage-report)는 사고 high 상향의 범위 밖 — 기존 60s
// 기본을 유지한다(120s 를 공유하면 deadlineAt 없는 텍스트 라우트가 플랫폼
// 타임아웃까지 매달린다). env 는 동일 키로 양쪽을 함께 조정한다.
const TEXT_STANDARD_QUESTION_TIMEOUT_MS = readNumberEnv(
  "GEMINI_QUESTION_TIMEOUT_MS",
  60_000,
);
const PREMIUM_QUESTION_TIMEOUT_MS = readNumberEnv(
  "ATLASCLOUD_PREMIUM_QUESTION_TIMEOUT_MS",
  180_000,
);

// 문제 생성(구조화 출력 = generateQuestionObject) 플랜→모델 매핑.
// 26-07-20 차세대 이원 티어(캠페인 O197~O201): 두 플랜 모두 문제생성 전용 상수
// (기본 google/gemini-3-flash-preview)로 통일 — 티어 차이는 모델이 아니라
// 파이프라인 무게(STANDARD=생성+통합 검수리 2콜, PREMIUM=풀 파이프라인+E-gate)다.
// STANDARD 는 광역 공유 노브(ATLAS_STANDARD_MODEL_ID)에서 분리한
// ATLAS_STANDARD_QGEN_MODEL_ID 를 쓴다 — 튜터·웹툰·지문분석 등 비생성 소비자와
// KO(국어) 경로는 기존 모델을 유지해야 하기 때문(KO 는 호출부 modelId 오버라이드).
// 이 함수의 호출자는 전원 문제 생성 파이프라인이다(AUTO-GEN/AUTO-GEN-PLAN/
// SINGLE-GEN·KO-SOLVER·GRAMMAR-SOLVER). 문제 생성이 아닌 PREMIUM 소비자는 텍스트
// 경로(generateQuestionText: ANALYSIS 지문분석·LEARNING-GEN 학습문제)뿐이라 아래
// TEXT_GENERATION_MODEL_CONFIGS 로 분리해 기존 Claude 를 불변 유지한다.
const QUESTION_GENERATION_MODEL_CONFIGS: Record<
  QuestionGenerationPlan,
  { provider: QuestionGenerationProvider; modelId: string; timeoutMs: number }
> = {
  STANDARD: {
    provider: ATLAS_CLOUD_PROVIDER,
    modelId: ATLAS_STANDARD_QGEN_MODEL_ID,
    timeoutMs: STANDARD_QUESTION_TIMEOUT_MS,
  },
  PREMIUM: {
    provider: ATLAS_CLOUD_PROVIDER,
    modelId: ATLAS_PREMIUM_QGEN_MODEL_ID,
    timeoutMs: PREMIUM_QUESTION_TIMEOUT_MS,
  },
};

// generateQuestionText 전용 플랜 매핑 — PREMIUM 을 실제로 쓰는 텍스트 호출자는
// 지문분석(run-full-analysis, logPrefix=ANALYSIS)과 학습문제 생성
// (generate-learning-question, logPrefix=LEARNING-GEN)이며 둘 다 문제 생성 모델
// 교체 범위 밖이다 — 기존 Claude(ATLAS_PREMIUM_MODEL_ID) 라우팅을 그대로 둔다.
// (passage-report 계열 3소비자는 STANDARD 고정이라 어느 매핑이든 동일.)
const TEXT_GENERATION_MODEL_CONFIGS: Record<
  QuestionGenerationPlan,
  { provider: QuestionGenerationProvider; modelId: string; timeoutMs: number }
> = {
  // 텍스트 경로 STANDARD(지문분석·passage-report 계열)는 문제생성 flash3 통일의
  // 범위 밖 — 광역 표준 모델(26-07-22 부터 기본 gemini-3.6-flash)·기존 60s
  // 타임아웃을 유지한다(학습지 계열 호출자는 timeoutMs 를 자체 상향).
  STANDARD: {
    provider: ATLAS_CLOUD_PROVIDER,
    modelId: ATLAS_STANDARD_MODEL_ID,
    timeoutMs: TEXT_STANDARD_QUESTION_TIMEOUT_MS,
  },
  PREMIUM: {
    provider: ATLAS_CLOUD_PROVIDER,
    modelId: ATLAS_PREMIUM_MODEL_ID,
    timeoutMs: PREMIUM_QUESTION_TIMEOUT_MS,
  },
};

function getQuestionGenerationModelConfig(plan: QuestionGenerationPlan) {
  return QUESTION_GENERATION_MODEL_CONFIGS[plan];
}

function getTextGenerationModelConfig(plan: QuestionGenerationPlan) {
  return TEXT_GENERATION_MODEL_CONFIGS[plan];
}

// Claude 계열 reasoning 제어 — OpenRouter 는 claude-sonnet-5 에
// reasoning 파라미터를 안 보내면 thinking 을 기본 활성화한다(26-07-04 실측:
// 동일 프롬프트 default 31s·completion 2.9k(본문 ~0.8k, 숨은 사고 ~1.8k) vs
// reasoning off 13s·1.1k — 출력 품질 길이 동일). 실전 프롬프트에선 사고 토큰이
// 출력 예산(12k)을 잠식해 호출당 200~255s → 180s 타임아웃·JSON 잘림·repair
// 연쇄의 주범이었다. 우리 스키마는 errorDesign 설계 필드로 계획을 출력 안에서
// 수행시키므로 숨은 thinking 은 기본 비활성. 품질 회귀 시 env 로 예산을
// 재부여할 수 있다(≥1024 = Anthropic thinking budget tokens).
// 26-07-14 PREMIUM 문제생성이 gemini-3.1-pro-preview 로 교체된 뒤에는 이 옵션이
// isAtlasClaudeModel 게이트로 no-op 이 되고(오버라이드로 Claude 를 지정한 경우에만
// 발동), gemini reasoning 은 atlas-ai.ts transformRequestBody 가 어법 사다리 P1 과
// 동일하게 제어한다(기본 disable, env OPENROUTER_GEMINI_REASONING_EFFORT).
const PREMIUM_QGEN_REASONING_TOKENS = readNumberEnv(
  "ATLASCLOUD_PREMIUM_QGEN_REASONING_TOKENS",
  0,
);

function claudeQgenReasoningOptions(modelId: string): {
  providerOptions?: Record<string, Record<string, JSONValue>>;
} {
  if (!isAtlasClaudeModel(modelId)) return {};
  const reasoning: Record<string, JSONValue> =
    PREMIUM_QGEN_REASONING_TOKENS >= 1024
      ? { max_tokens: Math.floor(PREMIUM_QGEN_REASONING_TOKENS) }
      : { enabled: false };
  return { providerOptions: { [ATLAS_CLOUD_PROVIDER]: { reasoning } } };
}

// 명시적 reasoning effort → providerOptions 배선 (E-gate 해설 사실검증 검증·수리
// 콜 전용). openai-compatible provider 의 1급 옵션 `reasoningEffort`(camelCase)로
// 실으면 getArgs 가 이를 파싱해 요청 args.reasoning_effort 로 세팅하고, atlas-ai
// 의 transformRequestBody(atlasReasoningRequestFor)가 비-gemini 경로에서 그대로
// { reasoning_effort } 로 와이어에 흘린다 — 범용 env(OPENROUTER_REASONING_EFFORT)에
// 의존하지 않고 콜 단위로 grok 에 high 추론을 전달하는 최소 침습 경로다.
// (snake_case reasoning_effort 를 providerOptions 로 넣으면 getArgs 가 스키마 밖
// 키를 스프레드한 뒤 `reasoning_effort: compatibleOptions.reasoningEffort` 로
// 덮어써 undefined 가 되므로 반드시 camelCase 를 쓴다.)
//   - gemini: atlasReasoningRequestFor 가 reasoning 을 자체 제어(기본 none)하므로
//     기본 제외 — 여기서 실으면 요청 바이트가 바뀐다(계약: gemini 경로 불변).
//     단 applyToGemini opt-in(26-07-20 이원 티어, O201 S3i 계약: flash3 사고
//     high 를 콜 단위로 고정)일 때만 gemini 에도 싣는다 — wire 의 reasoning_effort
//     가 atlasReasoningRequestFor 의 requestedEffort 로 소비되어 {reasoning:
//     {enabled:true, effort, exclude:true}} 가 된다(전역 env
//     OPENROUTER_GEMINI_REASONING_EFFORT 를 건드리지 않는 콜 단위 경로).
//     opt-in 하지 않은 기존 gemini 콜은 계속 바이트 동일.
//   - claude: claudeQgenReasoningOptions 가 이미 reasoning 을 싣는다 — 이중 지정
//     방지로 제외.
//   - 미지정(undefined/빈값): {} 반환 → 기존 호출과 바이트 동일.
function explicitReasoningEffortOptions(
  modelId: string,
  reasoningEffort: string | undefined,
  applyToGemini = false,
): { providerOptions?: Record<string, Record<string, JSONValue>> } {
  const effort = reasoningEffort?.trim();
  if (!effort) return {};
  if (isAtlasGeminiModel(modelId) && !applyToGemini) return {};
  if (isAtlasClaudeModel(modelId)) return {};
  return {
    providerOptions: { [ATLAS_CLOUD_PROVIDER]: { reasoningEffort: effort } },
  };
}

interface GenerateQuestionObjectArgs<T> {
  schema: z.ZodType<T>;
  prompt: string;
  generationPlan: QuestionGenerationPlan;
  /**
   * 모델 오버라이드(어법 프리미엄 사다리 계약 §3): 지정 시 generationPlan 의
   * 플랜→모델 매핑 대신 이 modelId 로 호출한다(같은 Atlas/OpenRouter provider).
   * provider·timeout·재시도·비재시도 오류 분류·usage 원가 병합은 기존 그대로
   * 동작하며, 미지정 시 기존 경로와 완전 동일하다(무회귀 계약).
   */
  modelId?: string;
  logPrefix?: string;
  maxRetries?: number;
  maxTokens?: number;
  system?: string;
  timeoutMs?: number;
  deadlineAt?: number;
  /**
   * strict 구조화 출력을 건너뛰고 프롬프트 인라인 JSON 모드로 바로 생성한다.
   * Wave-3 TIMEOUT-RCA(26-07-05 실측): sonnet-5(OpenRouter) strict json_schema 가
   * SUMMARY_WRITING/TOPIC_SENTENCE_WRITING 봉투(옵션 필드 20여 개)에서 응답 없이
   * 180s abort 되거나 masked 400("Provider returned error")으로 전멸 — 재시도가
   * 무의미한 스키마 기인 결함이라 호출측(PREMIUM 서술형 라우팅)이 이 플래그로
   * 도밍된 strict 호출 자체를 생략한다. 스키마는 클라이언트 zod 검증 + 하류
   * 품질게이트가 결정론 재검증하므로 provider 강제 없이도 안전하다.
   */
  forceJsonFallback?: boolean;
  /**
   * 명시적 reasoning effort(예: "high"). 지정 시 providerOptions 로 실려 atlas-ai
   * 의 transformRequestBody 가 소비한다 — E-gate(해설 사실검증) 검증·수리 콜이
   * grok 에 high 추론을 명시 전달하는 전용 경로(범용 env
   * OPENROUTER_REASONING_EFFORT 에 의존하지 않는다). claude 는 자체 reasoning
   * 제어가 있어 항상 제외, gemini 는 applyReasoningEffortToGemini opt-in 시에만
   * 적용 — opt-in 없는 기존 콜은 바이트 동일하다.
   */
  reasoningEffort?: string;
  /**
   * 26-07-20 이원 티어(O201 S3i 계약): reasoningEffort 를 gemini 모델에도 콜
   * 단위로 싣는다(wire: {reasoning:{enabled:true, effort, exclude:true}}).
   * flash3 생성·검수리 콜이 전역 env(OPENROUTER_GEMINI_REASONING_EFFORT — 전
   * gemini 소비자 공용)를 건드리지 않고 사고 강도를 고정하는 유일한 경로다.
   * 기본 false = 기존 gemini 콜 바이트 불변.
   */
  applyReasoningEffortToGemini?: boolean;
  /** Opt-in research stage semantic; ignored byte-for-byte when no runtime is active. */
  researchStage?: QuestionGenerationResearchStage;
}

interface GenerateQuestionTextArgs {
  prompt: string;
  generationPlan: QuestionGenerationPlan;
  /** 모델 오버라이드 — GenerateQuestionObjectArgs.modelId 와 동일 계약. */
  modelId?: string;
  logPrefix?: string;
  maxRetries?: number;
  maxTokens?: number;
  omitMaxTokens?: boolean;
  responseFormat?: "json_object";
  isRecoverableJsonText?: (text: string) => boolean;
  /** Deprecated. Atlas/OpenRouter reasoning is controlled in src/lib/atlas-ai.ts. */
  thinkingBudget?: number;
  timeoutMs?: number;
  temperature?: number;
  /** GenerateQuestionObjectArgs.reasoningEffort 와 동일 계약 — 콜 단위 사고 강도. */
  reasoningEffort?: string;
  /**
   * GenerateQuestionObjectArgs.applyReasoningEffortToGemini 와 동일 계약 —
   * true 일 때만 gemini 모델에 reasoningEffort 를 싣는다(기본 false = 기존 콜
   * 바이트 불변). 26-07-22 학습지·실전 학습지 3.6-flash 사고 high 전환용 배선.
   */
  applyReasoningEffortToGemini?: boolean;
}

export interface GenerateQuestionObjectResult<T> {
  object: T;
  usage?: unknown;
  provider: string;
  modelId: string;
  attempts: number;
  durationMs: number;
}

export interface GenerateQuestionTextResult {
  text: string;
  usage?: unknown;
  provider: string;
  modelId: string;
  attempts: number;
  durationMs: number;
  finishReason?: string;
  rawFinishReason?: string;
}

export function isNonRetryableQuestionGenerationProviderError(error: unknown): boolean {
  if (isQuestionGenerationAssignmentBudgetError(error)) return true;
  const message = [
    error instanceof Error ? error.message : String(error),
    readErrorString(error, "text"),
    readErrorString(error, "responseBody"),
    readErrorString(error, "body"),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return [
    "prepayment credits are depleted",
    "exceeded your current quota",
    "quota exceeded",
    "generate_content_paid_tier_input_token_count",
    "api key is missing",
    "api key not found",
    "api key invalid",
    "invalid api key",
    "invalid api key provided",
    "permission denied",
    "billing",
    "insufficient credits",
    "credits are depleted",
    "requires more credits",
    "add more credits",
    "can only afford",
    "\"code\":402",
    " code=402",
    "status=402",
    "no auth credentials found",
    "invalid authorization",
    "unauthorized",
    "output_config.format.schema",
    "output_config.format: extra inputs are not permitted",
    "unrestricted key",
    "permanent disruption",
    "will take effect on june",
  ].some((pattern) => message.includes(pattern));
}

/**
 * T5: 비스트리밍(generateObject/generateText) 호출에서 status 200 인데 응답이
 * SSE/빈 본문으로 와, 파서가 즉시 실패하거나(콜 단위 하드 타임아웃으로) 끊긴
 * 유형을 즉시 재시도 가능한 transient 결함으로 판정한다. 같은 요청 재시도로 대개
 * 회복되므로, grammar-too-large·masked-400 같은 결정론 오류(느린 JSON 폴백 필요)와
 * 달리 구조화 호출을 그대로 빠르게 재시도해야 한다. 결정론 오류 시그니처가 담긴
 * 본문(폴백 경로 대상)은 명시적으로 제외해 오분류를 막는다.
 */
export function isTransientEmptyOrStreamedResponseError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof AtlasTransientResponseError) return true;
    if (isRecord(current)) {
      if (current.name === "AtlasTransientResponseError") return true;
      const status = current.statusCode ?? current.status;
      if (status === 200 || status === "200") {
        const responseBody = (
          readErrorString(current, "responseBody") ??
          readErrorString(current, "body") ??
          ""
        );
        const lowerBody = responseBody.toLowerCase();
        // 결정론 오류(폴백 경로)는 transient 아님 — 여기서 먼저 배제한다.
        if (
          lowerBody.includes("provider returned error") ||
          lowerBody.includes("compiled grammar is too large")
        ) {
          return false;
        }
        // 빈 본문 200, 또는 SSE 프레임(data:/event:/[DONE])이 실린 200.
        if (
          responseBody.trim() === "" ||
          /^\s*(data:|event:|:\s)/m.test(responseBody) ||
          responseBody.includes("[DONE]")
        ) {
          return true;
        }
      }
      current = current.cause;
      continue;
    }
    break;
  }
  return false;
}

export function toUserFacingQuestionGenerationError(rawMessage: string): string {
  const m = rawMessage.toLowerCase();
  const isBilling =
    m.includes("billing") ||
    m.includes("quota") ||
    m.includes("prepayment") ||
    m.includes("spending cap") ||
    m.includes("insufficient credits");
  const isTransient =
    m.includes("temporary service disruptions") ||
    m.includes("unrestricted key") ||
    m.includes("overloaded") ||
    m.includes("service unavailable") ||
    m.includes(" 503");
  if (isBilling) {
    return "AI 서비스 한도 또는 결제 문제로 문제 생성을 일시 중단했어요. 크레딧은 환불되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (isTransient) {
    return "일시적인 AI 서비스 문제로 생성에 실패했어요. 크레딧은 환불되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  return rawMessage;
}

export function generateQuestionObject<T>(
  args: GenerateQuestionObjectArgs<T>,
): Promise<GenerateQuestionObjectResult<T>> {
  const stage = args.researchStage ?? {
    key: args.forceJsonFallback
      ? QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_PROMPT_JSON_FALLBACK
      : QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_STRUCTURED,
    purpose: "candidate" as const,
  };
  return Promise.resolve(
    runQuestionGenerationResearchStage(stage, () =>
      generateQuestionObjectImpl({ ...args, researchStage: stage })),
  );
}

async function generateQuestionObjectImpl<T>({
  schema,
  prompt,
  generationPlan,
  modelId: modelIdOverride,
  logPrefix = "QUESTION-GEN",
  maxRetries = GEMINI_QUESTION_MAX_RETRIES,
  maxTokens = 8192,
  system,
  timeoutMs,
  deadlineAt,
  forceJsonFallback = false,
  reasoningEffort,
  applyReasoningEffortToGemini = false,
  researchStage,
}: GenerateQuestionObjectArgs<T>): Promise<GenerateQuestionObjectResult<T>> {
  // 연구 전용 출력 한도 하한 오버라이드 (O175 후속: 추론 high 스윕에서 reasoning
  // 토큰이 completion 예산을 잠식해 절단되는 것을 막는다). env 미설정 시 무영향.
  const researchFloor = Number(process.env.QGEN_RESEARCH_MAX_TOKENS_FLOOR ?? "");
  if (Number.isFinite(researchFloor) && researchFloor > 0) {
    maxTokens = Math.max(maxTokens, Math.min(32_000, researchFloor));
  }
  const planConfig = getQuestionGenerationModelConfig(generationPlan);
  // 오버라이드는 modelId 만 치환 — provider/timeout 등 나머지는 플랜 매핑 유지.
  // 미지정이면 플랜 config 객체를 그대로 사용해 기존 동작과 완전 동일하다.
  const config = modelIdOverride
    ? { ...planConfig, modelId: modelIdOverride }
    : planConfig;
  let lastError: unknown;
  const operationStartedAt = Date.now();
  const researchTransportPolicy =
    getQuestionGenerationResearchTransportPolicy();
  const effectiveApplicationMaxRetries = researchTransportPolicy
    ? researchTransportPolicy.applicationMaxRetries
    : normalizeQuestionGenerationApplicationRetries(maxRetries);
  const effectiveSdkMaxRetries = researchTransportPolicy
    ? researchTransportPolicy.sdkMaxRetries
    : QUESTION_GENERATION_SDK_MAX_RETRIES;
  const allowStructuredRepair =
    researchTransportPolicy?.allowStructuredRepair ?? true;

  const computeAbortMs = (hardCapMs: number) => {
    if (!deadlineAt) return hardCapMs;
    const remaining = deadlineAt - Date.now();
    return Math.min(hardCapMs, Math.max(1_000, remaining));
  };

  // T5 리뷰 §2: status 200 빈/SSE(또는 콜 단위 하드 타임아웃) 계열의 "빠른 재시도"는
  // 각 시도가 실제 청구될 수 있어(빈 본문 200 도 과금) 이중 과금 상한으로 최대 1회만
  // 허용한다. 1회 재시도 후에도 같은 분류면 기존 오류 경로(throw → 상위 환불)로 간다.
  let transientFastRetries = 0;

  for (
    let attempt = 0;
    attempt <= effectiveApplicationMaxRetries;
    attempt++
  ) {
    const attemptStartedAt = Date.now();

    // 강제 JSON 모드 — strict 구조화 출력이 스키마 기인으로 전멸하는 유형
    // (SW/TSW PREMIUM)이 도밍된 호출을 아예 생략하는 경로. 폴백 함수는 내부에서
    // 모든 실패를 잡아 null 을 반환하므로 여기서는 재시도 카운트만 관리한다.
    if (forceJsonFallback) {
      if (attempt > 0 && deadlineAt && Date.now() >= deadlineAt) {
        console.warn(
          `[${logPrefix}] Deadline reached before forced-JSON retry ${attempt}; stopping (caller refunds).`,
        );
        break;
      }
      if (attempt > 0) {
        console.log(
          `[${logPrefix}] Forced-JSON retry attempt ${attempt} via ${generationPlan} plan...`,
        );
      }
      const fallback = await (
        researchStage?.key ===
          QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_PROMPT_JSON_FALLBACK ||
        researchStage?.key ===
          QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_CANDIDATE_REPAIR_JSON
          ? generateObjectViaJsonFallbackImpl
          : generateObjectViaJsonFallback
      )({
        schema,
        prompt,
        system,
        modelId: config.modelId,
        provider: config.provider,
        maxTokens,
        // grammar-too-large 폴백과 동일한 240s 하드캡 — deadlineAt 은 계속 존중.
        abortMs: computeAbortMs(Math.max(timeoutMs ?? config.timeoutMs, 240_000)),
        deadlineAt,
        logPrefix,
        operationStartedAt,
        attempt,
        sdkMaxRetries: effectiveSdkMaxRetries,
        allowStructuredRepair,
        reasoningEffort,
        applyReasoningEffortToGemini,
      });
      if (fallback) {
        console.log(
          `[${logPrefix}] ${generationPlan} ${config.modelId} forced-JSON attempt ${attempt} succeeded in ${Date.now() - attemptStartedAt}ms`,
        );
        return fallback;
      }
      lastError =
        lastError ??
        new Error(
          "Forced prompt-inlined JSON generation failed (parse/schema validation)",
        );
      console.warn(
        `[${logPrefix}] Forced-JSON attempt ${attempt} failed via ${generationPlan} plan.`,
      );
      continue;
    }

    try {
      if (attempt > 0 && deadlineAt && Date.now() >= deadlineAt) {
        console.warn(
          `[${logPrefix}] Deadline reached before inner retry ${attempt}; stopping (caller refunds).`,
        );
        break;
      }
      if (attempt > 0) {
        console.log(`[${logPrefix}] Retry attempt ${attempt} via ${generationPlan} plan...`);
      }

      const result = await generateObject({
        model: atlasChatModel(config.modelId),
        schema,
        maxRetries: effectiveSdkMaxRetries,
        maxOutputTokens: maxTokens,
        ...claudeQgenReasoningOptions(config.modelId),
        ...explicitReasoningEffortOptions(
          config.modelId,
          reasoningEffort,
          applyReasoningEffortToGemini,
        ),
        abortSignal: AbortSignal.timeout(
          computeAbortMs(timeoutMs ?? config.timeoutMs),
        ),
        ...(generationPlan === "PREMIUM" && allowStructuredRepair
          ? {
              experimental_repairText: async ({ text, error }) =>
                repairPremiumJsonOutput({
                  text,
                  error,
                  modelId: config.modelId,
                  maxTokens,
                  abortMs: computeAbortMs(60_000),
                  logPrefix,
                  sdkMaxRetries: effectiveSdkMaxRetries,
                }),
            }
          : {}),
        ...(system
          ? {
              messages: [
                { role: "system" as const, content: system },
                { role: "user" as const, content: prompt },
              ],
            }
          : { prompt }),
      });

      console.log(
        `[${logPrefix}] ${generationPlan} ${config.modelId} attempt ${attempt} succeeded in ${Date.now() - attemptStartedAt}ms`,
      );

      return {
        object: result.object as T,
        // usage 에 OpenRouter 실측 원가(costUsd/generationId)를 병합해 하류
        // recordAiCost 가 RECORDED 단가로 기록하게 한다.
        usage: atlasUsageWithCost(result),
        provider: config.provider,
        modelId: config.modelId,
        attempts: attempt + 1,
        durationMs: Date.now() - operationStartedAt,
      };
    } catch (error) {
      lastError = error;
      logProviderError(logPrefix, attempt, generationPlan, error);
      // T5: status 200 + SSE/빈 본문(또는 콜 단위 하드 타임아웃)은 즉시 재시도
      // 가능한 transport 결함 — 느린 240s JSON 폴백으로 새지 않고 구조화 호출을
      // 그대로 빠르게 재시도한다. 단, 빠른 재시도는 이중 과금 상한(§2)으로 최대
      // 1회. 상한을 넘었거나 남은 attempt 가 없으면 던져 상위가 환불한다.
      if (isTransientEmptyOrStreamedResponseError(error)) {
        if (transientFastRetries >= 1) {
          console.warn(
            `[${logPrefix}] Transient empty/streamed 200 persisted after 1 fast retry (${config.modelId}); stopping (caller refunds).`,
          );
          throw error;
        }
        transientFastRetries += 1;
        console.warn(
          `[${logPrefix}] Transient empty/streamed 200 response (${config.modelId}); retrying fast (1/1).`,
        );
        if (attempt >= effectiveApplicationMaxRetries) throw error;
        continue;
      }
      // Anthropic(오픈라우터 경유) strict 구조화 출력의 "compiled grammar is too
      // large" — 스키마가 복잡한 유형(국어 확장 봉투)에서 PREMIUM 이 400 으로
      // 전멸한다(26-07-03 실측: KO 7유형 중 6유형). 재시도로는 절대 안 풀리는
      // 결정론 오류이므로, 스키마를 프롬프트에 인라인하고 Output.json()(스키마
      // 비강제)으로 1회 폴백 생성한 뒤 클라이언트에서 zod 검증한다 — 하류
      // 품질게이트가 어차피 전 필드를 결정론 재검증하므로 안전하다.
      if (
        isCompiledGrammarTooLargeError(error) ||
        isMaskedProviderBadRequestError(error)
      ) {
        if (hasQuestionGenerationResearchRuntime()) {
          console.warn(
            `[${logPrefix}] Research strict structured-output failure is an ITT no-candidate; prompt-JSON downgrade is disabled.`,
          );
          if (attempt >= effectiveApplicationMaxRetries) throw error;
          continue;
        }
        console.warn(
          `[${logPrefix}] Structured-output rejected by provider (grammar too large or masked 400) — falling back to prompt-inlined JSON mode (schema enforced client-side).`,
        );
        const fallback = await generateObjectViaJsonFallback({
          schema,
          prompt,
          system,
          modelId: config.modelId,
          provider: config.provider,
          maxTokens,
          // JSON 모드는 strict 문법 강제가 없어 같은 유형도 응답이 더 길고 느리다
          // (26-07-03 실측: KO_GR_HIST 180s 초과). 하드캡을 240s 로 올리되
          // deadlineAt(Vercel 벽)은 computeAbortMs 가 계속 존중한다.
          abortMs: computeAbortMs(Math.max(timeoutMs ?? config.timeoutMs, 240_000)),
          deadlineAt,
          logPrefix,
          operationStartedAt,
          attempt,
          sdkMaxRetries: effectiveSdkMaxRetries,
          allowStructuredRepair,
          reasoningEffort,
          applyReasoningEffortToGemini,
        });
        if (fallback) return fallback;
        // 폴백 실패는 잘림·타임아웃 등 비결정 요인 — 남은 attempt 가 있으면
        // 재시도한다(구조화 호출이 곧장 400 으로 재실패한 뒤 폴백이 다시 돈다).
        if (attempt >= effectiveApplicationMaxRetries) throw error;
        console.warn(
          `[${logPrefix}] JSON fallback failed; retrying (${attempt + 1}/${effectiveApplicationMaxRetries}).`,
        );
        continue;
      }
      if (isNonRetryableQuestionGenerationProviderError(error)) {
        console.warn(
          `[${logPrefix}] Non-retryable provider error (${config.provider}); stopping retries.`,
        );
        throw error;
      }
    }
  }

  throw lastError;
}

/**
 * Anthropic(오픈라우터 경유) strict 구조화 출력의 "compiled grammar is too large"
 * 400 판정 — 스키마 복잡도 기인의 결정론 오류라 재시도가 무의미하다.
 */
function isCompiledGrammarTooLargeError(error: unknown): boolean {
  const message = [
    error instanceof Error ? error.message : String(error),
    readErrorString(error, "responseBody"),
    readErrorString(error, "body"),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return message.includes("compiled grammar is too large");
}

/**
 * OpenRouter 가 업스트림(Anthropic) 400 을 열어보지 않고
 * {"error":{"message":"Provider returned error","code":400}} 로 감싸 200 응답에
 * 흘리는 경우 — strict 구조화 출력 스키마 거부가 대표 사례(26-07-05 SW/TSW 실측:
 * AI_APICallError status=200, responseBody 에 위 페이로드). 같은 요청 재시도는
 * 무의미한 결정론 오류이므로 grammar-too-large 와 동일하게 JSON 폴백으로 우회한다.
 */
export function isMaskedProviderBadRequestError(error: unknown): boolean {
  const message = [
    error instanceof Error ? error.message : String(error),
    readErrorString(error, "responseBody"),
    readErrorString(error, "body"),
    summarizeProviderError(error) ?? "",
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return (
    message.includes("provider returned error") &&
    (message.includes('"code":400') ||
      message.includes("code=400") ||
      message.includes("status=400"))
  );
}

/**
 * 디버그 전용(폴백 경로에서만 호출): QGEN_FALLBACK_RAW_DUMP_DIR 이 설정된 경우
 * zod/파스 실패 raw 응답을 파일로 남긴다. env 미설정(운영 기본) 시 완전 no-op.
 */
function dumpFallbackRawForDebug({
  logPrefix,
  rawText,
  rawFinishReason,
  brief,
}: {
  logPrefix: string;
  rawText: string;
  rawFinishReason?: string;
  brief: string;
}): void {
  const dir = process.env.QGEN_FALLBACK_RAW_DUMP_DIR;
  if (!dir) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      `fallback-raw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.log`,
    );
    fs.writeFileSync(
      file,
      [`logPrefix=${logPrefix}`, `finishReason=${rawFinishReason ?? "?"}`, `issues=${brief}`, "", rawText].join("\n"),
      "utf8",
    );
    console.warn(`[${logPrefix}] Fallback raw dumped to ${file}`);
  } catch {
    /* debug-only, never throw */
  }
}

/** ```json 펜스·전후 잡담을 벗겨 첫 {…} 블록만 남긴다 (폴백 텍스트 파싱용). */
function stripJsonFences(text: string): string {
  const unfenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  return start !== -1 && end > start ? unfenced.slice(start, end + 1) : unfenced;
}

/** 펜스 제거 후 JSON.parse — 실패 시 undefined (throw 하지 않는다). */
export function parseJsonLoose(text: string): unknown {
  if (!text.trim()) return undefined;
  const stripped = stripJsonFences(text);
  try {
    return JSON.parse(stripped);
  } catch {
    // 보수적 2차 시도: trailing comma(",}" / ",]")만 제거 — 1차 파스가 이미
    // 실패한 텍스트에만 적용하므로 유효 JSON 을 훼손할 수 없다.
    try {
      return JSON.parse(stripped.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return undefined;
    }
  }
}

/**
 * H1(26-07-06 실측, SW PREMIUM KILLER 3/3 전멸 raw): 프롬프트 인라인 JSON
 * 모드는 provider 문법 강제가 없어 모델이 해당 없는 optional 필드를 null 로
 * 채운다(예: koreanGloss:null) — z.string().optional() 은 null 을 거부해
 * 후보 전체가 기각됐다. zod 가 "received null" 로 거부한 경로 중 실제 값이
 * null 인 "객체 속성"만 제거(undefined 승격)해 재검증한다.
 * 안전성: 필수 필드는 키 제거 후에도 required 오류로 재실패하므로 잘못된
 * 통과가 생기지 않고, nullable 필드는 애초에 이슈가 되지 않으며, 배열 원소
 * null 은 인덱스가 밀리므로 건드리지 않는다.
 */
function promoteNullOptionalsAtIssuePaths(
  candidate: unknown,
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>,
): boolean {
  let changed = false;
  for (const issue of issues) {
    if (issue.path.length === 0) continue;
    let parent: unknown = candidate;
    for (let i = 0; i < issue.path.length - 1 && parent !== undefined; i += 1) {
      const key = issue.path[i];
      if (Array.isArray(parent) && typeof key === "number") {
        parent = parent[key];
      } else if (isRecord(parent) && (typeof key === "string" || typeof key === "number")) {
        parent = parent[String(key)];
      } else {
        parent = undefined;
      }
    }
    const lastKey = issue.path[issue.path.length - 1];
    if (
      isRecord(parent) &&
      !Array.isArray(parent) &&
      typeof lastKey === "string" &&
      parent[lastKey] === null
    ) {
      delete parent[lastKey];
      changed = true;
    }
  }
  return changed;
}

/**
 * 폴백 전용 safeParse: 실패 시 null-optional 승격 후 최대 2패스 재검증.
 * (2패스 — 첫 승격 후 중첩 경로의 후속 null 이슈가 드러나는 경우 커버.)
 */
export function safeParsePromotingNullOptionals<T>(
  schema: z.ZodType<T>,
  candidate: unknown,
): ReturnType<z.ZodType<T>["safeParse"]> {
  let parsed = schema.safeParse(candidate);
  for (let pass = 0; pass < 2 && !parsed.success; pass += 1) {
    if (!promoteNullOptionalsAtIssuePaths(candidate, parsed.error.issues)) break;
    parsed = schema.safeParse(candidate);
  }
  return parsed;
}

/**
 * grammar-too-large 폴백: 스키마를 JSON Schema 텍스트로 프롬프트에 인라인하고
 * Output.json()(provider 스키마 비강제)으로 생성한 뒤 클라이언트에서 zod 검증한다.
 * 하류 품질게이트가 전 필드를 결정론 재검증하므로 provider 강제 없이도 안전하다.
 * 실패 시 null — 호출측이 원 에러를 던진다.
 */
function generateObjectViaJsonFallback<T>(
  args: Parameters<typeof generateObjectViaJsonFallbackImpl<T>>[0],
): Promise<GenerateQuestionObjectResult<T> | null> {
  return Promise.resolve(
    runQuestionGenerationResearchStage(
      {
        key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_PROMPT_JSON_FALLBACK,
        purpose: "candidate",
      },
      () => generateObjectViaJsonFallbackImpl(args),
    ),
  );
}

async function generateObjectViaJsonFallbackImpl<T>({
  schema,
  prompt,
  system,
  modelId,
  provider,
  maxTokens,
  abortMs,
  deadlineAt,
  logPrefix,
  operationStartedAt,
  attempt,
  sdkMaxRetries,
  allowStructuredRepair,
  reasoningEffort,
  applyReasoningEffortToGemini = false,
}: {
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  modelId: string;
  provider: string;
  maxTokens: number;
  abortMs: number;
  deadlineAt?: number;
  logPrefix: string;
  operationStartedAt: number;
  attempt: number;
  sdkMaxRetries: number;
  allowStructuredRepair: boolean;
  reasoningEffort?: string;
  applyReasoningEffortToGemini?: boolean;
}): Promise<GenerateQuestionObjectResult<T> | null> {
  if (abortMs <= 1_000) return null;
  // zod v4 → JSON Schema 인라인. 변환 불가 스키마(z.custom 류)면 텍스트 없이
  // 진행 — 유형 프롬프트가 필드 구조를 이미 상세 서술한다.
  let schemaText = "";
  try {
    schemaText = JSON.stringify(z.toJSONSchema(schema as never));
  } catch {
    /* noop */
  }
  const jsonInstruction = [
    "## 출력 형식 (스키마 비강제 폴백)",
    "마크다운·코드펜스·주석 없이 순수 JSON 객체 하나만 출력하라.",
    schemaText ? `다음 JSON Schema 를 정확히 준수하라:\n${schemaText}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const userContent = `${prompt}\n\n${jsonInstruction}`;
  try {
    // Output.json() 미사용: output 게터가 파싱 실패 시 throw 해 원문 텍스트에
    // 접근할 수 없게 되고("No output generated", 26-07-03 실측 2유형),
    // response_format 이 일부 Anthropic 백엔드(output_config.format)에서
    // 거부되기도 한다. 순수 텍스트로 받아 직접 파싱·복구한다.
    const result = await generateText({
      model: atlasChatModel(modelId),
      maxRetries: sdkMaxRetries,
      // 사고(reasoning) 토큰이 출력 예산을 공유해 20k 에서도 JSON 이 잘렸다
      // (26-07-03 실측 KO_GR_HIST) — 32k 로 넉넉히. (reasoning 은 이제
      // claudeQgenReasoningOptions 로 기본 비활성 — 잘림·지연의 근본 차단.)
      maxOutputTokens: 32_000,
      ...claudeQgenReasoningOptions(modelId),
      ...explicitReasoningEffortOptions(
        modelId,
        reasoningEffort,
        applyReasoningEffortToGemini,
      ),
      abortSignal: AbortSignal.timeout(abortMs),
      ...(system
        ? {
            messages: [
              { role: "system" as const, content: system },
              { role: "user" as const, content: userContent },
            ],
          }
        : { prompt: userContent }),
    });
    const rawText = (result.text ?? "").trim();
    const rawFinishReason =
      "finishReason" in result && typeof result.finishReason === "string"
        ? result.finishReason
        : undefined;
    let candidate = parseJsonLoose(rawText);
    let parsed =
      candidate === undefined
        ? undefined
        : safeParsePromotingNullOptionals(schema, candidate);
    if (!parsed?.success && rawText && allowStructuredRepair) {
      // 잘림·따옴표 깨짐 등 — 기존 PREMIUM 복구 호출로 1회 재구성 후 재검증.
      const repairReason = parsed
        ? new Error(
            parsed.error.issues
              .slice(0, 5)
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join(" | "),
          )
        : new Error("JSON parse failed (likely truncated output)");
      const repairAbortMs = deadlineAt
        ? Math.min(90_000, Math.max(1_000, deadlineAt - Date.now()))
        : 90_000;
      if (repairAbortMs > 5_000) {
        const repaired = await repairPremiumJsonOutput({
          text: rawText,
          error: repairReason,
          modelId,
          maxTokens,
          abortMs: repairAbortMs,
          logPrefix,
          minOutputTokens: 24_000,
          sdkMaxRetries,
        });
        if (repaired) {
          candidate = parseJsonLoose(repaired);
          if (candidate !== undefined) {
            parsed = safeParsePromotingNullOptionals(schema, candidate);
          }
        }
      }
    }
    if (!parsed?.success) {
      // 진단성: zod 이슈 경로를 에러 메시지에 포함(최대 8개) + finishReason/길이.
      // finishReason=length 면 토큰 절단, 그 외면 필드 계약 위반으로 즉시 판별 가능.
      const brief = parsed
        ? parsed.error.issues
            .slice(0, 8)
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join(" | ")
        : "JSON parse failed";
      console.warn(
        `[${logPrefix}] JSON fallback failed client-side schema validation (finishReason=${rawFinishReason ?? "?"}, rawLen=${rawText.length}): ${brief}`,
      );
      dumpFallbackRawForDebug({ logPrefix, rawText, rawFinishReason, brief });
      return null;
    }
    console.log(`[${logPrefix}] JSON fallback succeeded (schema validated client-side).`);
    return {
      object: parsed.data as T,
      usage: atlasUsageWithCost(result),
      provider,
      modelId,
      attempts: attempt + 2,
      durationMs: Date.now() - operationStartedAt,
    };
  } catch (fallbackError) {
    if (isQuestionGenerationAssignmentBudgetError(fallbackError)) {
      throw fallbackError;
    }
    console.warn(
      `[${logPrefix}] JSON fallback call failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
    );
    return null;
  }
}

function repairPremiumJsonOutput(
  args: Parameters<typeof repairPremiumJsonOutputImpl>[0],
): Promise<string | null> {
  return Promise.resolve(
    runQuestionGenerationResearchStage(
      {
        key: QUESTION_GENERATION_RESEARCH_STAGES.QUESTION_JSON_REPAIR,
        purpose: "candidate",
      },
      () => repairPremiumJsonOutputImpl(args),
    ),
  );
}

async function repairPremiumJsonOutputImpl({
  text,
  error,
  modelId,
  maxTokens,
  abortMs,
  logPrefix,
  minOutputTokens = 12_288,
  sdkMaxRetries,
}: {
  text: string;
  error: unknown;
  modelId: string;
  maxTokens: number;
  abortMs: number;
  logPrefix: string;
  /** 복구 응답은 전체 JSON 재방출 — 긴 국어 봉투는 폴백에서 24k 로 올린다. */
  minOutputTokens?: number;
  sdkMaxRetries: number;
}): Promise<string | null> {
  const raw = text.trim();
  if (raw.length === 0 || abortMs <= 1_000) return null;

  const errorSummary =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const repairPrompt = [
    "You are repairing a JSON response for a structured educational question-generation API.",
    "The previous assistant output failed JSON parsing or schema validation.",
    "Return ONLY one complete valid JSON object. Do not wrap it in markdown.",
    "Preserve the existing question content as much as possible.",
    "If the raw output is truncated, reconstruct the missing closing fields, arrays, and braces in the same schema style.",
    "Do not add commentary.",
    "",
    `## Validation error`,
    errorSummary.slice(0, 1_000),
    "",
    "## Raw broken JSON",
    raw,
  ].join("\n");

  try {
    const result = await generateText({
      model: atlasChatModel(modelId),
      maxRetries: sdkMaxRetries,
      prompt: repairPrompt,
      output: Output.json(),
      temperature: 0,
      maxOutputTokens: Math.min(32_000, Math.max(maxTokens, minOutputTokens)),
      // 복구는 기계적 JSON 재구성 — thinking 불필요(temperature 0 과 thinking 은
      // Anthropic 에서 상충하기도 한다).
      ...claudeQgenReasoningOptions(modelId),
      abortSignal: AbortSignal.timeout(abortMs),
    });
    const repairedResult = result as { output?: unknown; text?: string };
    // output 게터는 파싱 실패 시 throw 한다 — 원문 텍스트 폴백을 살리기 위해 격리.
    let structured: unknown;
    try {
      structured = repairedResult.output;
    } catch {
      structured = undefined;
    }
    const repaired =
      structured !== undefined && structured !== null
        ? JSON.stringify(structured)
        : stripJsonFences(repairedResult.text ?? "");
    if (!repaired || repaired === "null") return null;
    console.warn(`[${logPrefix}] Repaired malformed PREMIUM JSON output via continuation call.`);
    return repaired;
  } catch (repairError) {
    if (isQuestionGenerationAssignmentBudgetError(repairError)) {
      throw repairError;
    }
    console.warn(
      `[${logPrefix}] PREMIUM JSON repair failed: ${
        repairError instanceof Error ? repairError.message : String(repairError)
      }`,
    );
    return null;
  }
}

export async function generateQuestionText({
  prompt,
  generationPlan,
  modelId: modelIdOverride,
  logPrefix = "TEXT-GEN",
  maxRetries = GEMINI_QUESTION_MAX_RETRIES,
  maxTokens = 8192,
  omitMaxTokens = false,
  responseFormat,
  isRecoverableJsonText,
  thinkingBudget,
  timeoutMs,
  temperature = 0.35,
  reasoningEffort,
  applyReasoningEffortToGemini = false,
}: GenerateQuestionTextArgs): Promise<GenerateQuestionTextResult> {
  const planConfig = getTextGenerationModelConfig(generationPlan);
  const config = modelIdOverride
    ? { ...planConfig, modelId: modelIdOverride }
    : planConfig;
  let lastError: unknown;
  const operationStartedAt = Date.now();
  void thinkingBudget;
  // T5 리뷰 §2: 빈/SSE 200(또는 콜 단위 하드 타임아웃) 빠른 재시도는 이중 과금
  // 상한으로 최대 1회. 1회 후에도 같은 분류면 기존 오류 경로(throw)로 간다.
  let transientFastRetries = 0;
  const researchTransportPolicy =
    getQuestionGenerationResearchTransportPolicy();
  const effectiveApplicationMaxRetries = researchTransportPolicy
    ? researchTransportPolicy.applicationMaxRetries
    : normalizeQuestionGenerationApplicationRetries(maxRetries);
  const effectiveSdkMaxRetries = researchTransportPolicy
    ? researchTransportPolicy.sdkMaxRetries
    : QUESTION_GENERATION_SDK_MAX_RETRIES;

  for (
    let attempt = 0;
    attempt <= effectiveApplicationMaxRetries;
    attempt++
  ) {
    const attemptStartedAt = Date.now();
    try {
      if (attempt > 0) {
        console.log(`[${logPrefix}] Retry attempt ${attempt} via ${generationPlan} plan...`);
      }

      const result = await generateText({
        model: atlasChatModel(config.modelId),
        maxRetries: effectiveSdkMaxRetries,
        prompt,
        maxOutputTokens: omitMaxTokens ? undefined : maxTokens,
        temperature,
        ...claudeQgenReasoningOptions(config.modelId),
        ...explicitReasoningEffortOptions(
          config.modelId,
          reasoningEffort,
          applyReasoningEffortToGemini,
        ),
        abortSignal: AbortSignal.timeout(timeoutMs ?? config.timeoutMs),
        ...(responseFormat === "json_object" ? { output: Output.json() } : {}),
      });

      console.log(
        `[${logPrefix}] ${generationPlan} ${config.modelId} text attempt ${attempt} succeeded in ${Date.now() - attemptStartedAt}ms`,
      );

      return {
        text:
          responseFormat === "json_object" && "output" in result
            ? JSON.stringify(result.output)
            : result.text,
        usage: atlasUsageWithCost(result),
        finishReason:
          "finishReason" in result && typeof result.finishReason === "string"
            ? result.finishReason
            : undefined,
        rawFinishReason:
          "rawFinishReason" in result && typeof result.rawFinishReason === "string"
            ? result.rawFinishReason
            : undefined,
        provider: config.provider,
        modelId: config.modelId,
        attempts: attempt + 1,
        durationMs: Date.now() - operationStartedAt,
      };
    } catch (error) {
      lastError = error;
      logProviderError(logPrefix, attempt, generationPlan, error);
      if (isNonRetryableQuestionGenerationProviderError(error)) {
        console.warn(
          `[${logPrefix}] Non-retryable provider error (${config.provider}); stopping retries.`,
        );
        throw error;
      }
      // T5: status 200 + SSE/빈 본문(또는 콜 단위 하드 타임아웃)은 즉시 재시도
      // 가능한 transport 결함 — 같은 요청을 그대로 빠르게 재시도한다. 단, 이중
      // 과금 상한(§2)으로 빠른 재시도는 최대 1회. 상한을 넘었거나 남은 attempt 가
      // 없으면 던져 상위가 환불한다.
      if (isTransientEmptyOrStreamedResponseError(error)) {
        if (transientFastRetries >= 1) {
          console.warn(
            `[${logPrefix}] Transient empty/streamed 200 persisted after 1 fast retry (${config.modelId}); stopping (caller refunds).`,
          );
          throw error;
        }
        transientFastRetries += 1;
        console.warn(
          `[${logPrefix}] Transient empty/streamed 200 response (${config.modelId}); retrying fast (1/1).`,
        );
        if (attempt >= effectiveApplicationMaxRetries) throw error;
        continue;
      }

      const rawText = readErrorString(error, "text");
      if (responseFormat === "json_object" && rawText) {
        if (isRecoverableJsonText?.(rawText)) {
          console.warn(
            `[${logPrefix}] Falling back to recoverable raw JSON text after SDK object parsing failed.`,
          );
          return fallbackTextResult(rawText, error, config, attempt, operationStartedAt);
        }

        if (attempt < effectiveApplicationMaxRetries) {
          console.warn(
            `[${logPrefix}] SDK object parsing failed with unrecoverable raw text; retrying before raw JSON fallback.`,
          );
          continue;
        }

        console.warn(
          `[${logPrefix}] Falling back to raw JSON text after SDK object parsing failed.`,
        );
        return fallbackTextResult(rawText, error, config, attempt, operationStartedAt);
      }
    }
  }

  throw lastError;
}

function fallbackTextResult(
  rawText: string,
  error: unknown,
  config: { provider: QuestionGenerationProvider; modelId: string },
  attempt: number,
  operationStartedAt: number,
): GenerateQuestionTextResult {
  return {
    text: rawText,
    usage: isRecord(error) && "usage" in error ? error.usage : undefined,
    finishReason: readErrorString(error, "finishReason"),
    rawFinishReason: readErrorString(error, "rawFinishReason"),
    provider: config.provider,
    modelId: config.modelId,
    attempts: attempt + 1,
    durationMs: Date.now() - operationStartedAt,
  };
}

function logProviderError(
  logPrefix: string,
  attempt: number,
  generationPlan: QuestionGenerationPlan,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[${logPrefix}] Attempt ${attempt} failed via ${generationPlan} plan: ${message}`);
  const details = summarizeProviderError(error);
  if (details) {
    console.warn(`[${logPrefix}]   providerError: ${details}`);
  }
  if (isRecord(error) && error.finishReason) {
    console.warn(`[${logPrefix}]   finishReason: ${String(error.finishReason)}`);
  }
  if (isRecord(error) && error.usage) {
    console.warn(`[${logPrefix}]   usage: ${JSON.stringify(error.usage).slice(0, 300)}`);
  }
  if (isRecord(error) && typeof error.text === "string") {
    console.warn(`[${logPrefix}]   rawText: ${error.text.slice(0, 300)}`);
  }
}

function summarizeProviderError(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  const chunks: string[] = [];
  let current: unknown = error;

  for (let depth = 0; isRecord(current) && depth < 4 && !seen.has(current); depth += 1) {
    seen.add(current);
    const parts: string[] = [];
    const name = current.name;
    const status = current.statusCode ?? current.status;
    const code = current.code;
    if (typeof name === "string") parts.push(`name=${name}`);
    if (typeof status === "string" || typeof status === "number") parts.push(`status=${status}`);
    if (typeof code === "string" || typeof code === "number") parts.push(`code=${code}`);

    for (const key of ["responseBody", "body", "data", "text"] as const) {
      const value = current[key];
      const text =
        typeof value === "string"
          ? value
          : value === undefined
            ? undefined
            : safeJsonStringify(value);
      if (text) {
        parts.push(`${key}=${text.replace(/\s+/g, " ").slice(0, 1_200)}`);
      }
    }

    if (parts.length > 0) {
      chunks.push(`cause${depth}{${parts.join("; ")}}`);
    }
    current = current.cause;
  }

  return chunks.length > 0 ? chunks.join(" <- ").slice(0, 2_000) : undefined;
}

function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readErrorString(error: unknown, key: string): string | undefined {
  if (!isRecord(error)) return undefined;
  const value = error[key];
  return typeof value === "string" ? value : undefined;
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
