// ============================================================================
// 학생 시험 리포트 — 공용 LLM JSON 호출 헬퍼
//
// 전 스테이지가 postAtlasChatCompletionAsGeminiLike 경유. 이 헬퍼는:
// - 스테이지 config(모델/온도/토큰/타임아웃) 적용
// - deadlineAt 기반 타임아웃 산출(마감 5s 전 컷, 초과 시 즉시 TIMEOUT)
// - anthropic 모델 + cacheSystem 옵트인 시 systemCacheControl 부착
// - 기본 fetch 는 timeoutInMs 를 무시하므로 AbortSignal.timeout 자체 구현 주입
// - 응답 텍스트 JSON 추출(코드펜스 제거 → 첫 '{'~마지막 '}' 슬라이스) → zod safeParse
// - 스키마 불일치 시 1회 교정 재시도, 그래도 실패면 PARSE 에러
// ============================================================================

import type { z } from "zod";
import {
  AtlasCloudHttpError,
  postAtlasChatCompletionAsGeminiLike,
  type AtlasChatImageInput,
  type AtlasGeminiLikeResponse,
} from "@/lib/atlas-chat-rest";
import { isAtlasClaudeModel } from "@/lib/atlas-ai";
import { getExamReportAiConfig, type ExamReportAiStage } from "./model-config";

/** 마감 시각 대비 남겨두는 안전 여유(모델 응답 파싱·저장 시간). */
const DEADLINE_SAFETY_MS = 5_000;

export interface ExamReportLlmUsage {
  promptTokens: number;
  completionTokens: number;
  calls: number;
}

export function createExamReportUsage(): ExamReportLlmUsage {
  return { promptTokens: 0, completionTokens: 0, calls: 0 };
}

export type ExamReportLlmErrorKind = "TIMEOUT" | "HTTP" | "PARSE" | "EMPTY";

export class ExamReportLlmError extends Error {
  constructor(
    message: string,
    public readonly kind: ExamReportLlmErrorKind,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ExamReportLlmError";
  }
}

// ── 타임아웃 존중 fetcher (기본 fetch 는 init.timeoutInMs 를 무시) ─────────────
async function abortableFetcher(
  input: string,
  init: RequestInit & { timeoutInMs?: number },
): Promise<Response> {
  const { timeoutInMs, ...rest } = init;
  const signal =
    typeof timeoutInMs === "number" && timeoutInMs > 0
      ? AbortSignal.timeout(timeoutInMs)
      : rest.signal ?? undefined;
  return fetch(input, { ...rest, signal });
}

function resolveTimeoutMs(configTimeout: number, deadlineAt: number | undefined): number {
  if (deadlineAt == null) return configTimeout;
  const remaining = deadlineAt - Date.now() - DEADLINE_SAFETY_MS;
  if (remaining <= 0) {
    throw new ExamReportLlmError("마감 시간 초과로 호출을 시작할 수 없습니다", "TIMEOUT");
  }
  return Math.min(configTimeout, remaining);
}

function toLlmError(err: unknown): ExamReportLlmError {
  if (err instanceof ExamReportLlmError) return err;
  if (err instanceof AtlasCloudHttpError) {
    return new ExamReportLlmError(err.message, "HTTP", err.status);
  }
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new ExamReportLlmError("모델 호출 타임아웃", "TIMEOUT");
  }
  return new ExamReportLlmError(err instanceof Error ? err.message : String(err), "HTTP");
}

// ── 일시 오류 재시도 ─────────────────────────────────────────────────────────
// 게이트웨이 502/503·429·상태코드 없는 네트워크 단절은 짧은 백오프 후 재시도.
// (실측에서 OpenRouter 일시 502로 E1a 전체가 죽는 사례 확인 — 프로브 캡만 소모)
const TRANSIENT_BACKOFF_MS = [1_500, 4_000];

function isTransientHttp(err: ExamReportLlmError): boolean {
  if (err.kind !== "HTTP") return false;
  if (err.status == null) return true; // fetch 자체 실패(상태코드 없음)
  return err.status === 429 || err.status >= 500;
}

function extractResponseText(body: AtlasGeminiLikeResponse): string {
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** 코드펜스 제거 → 직접 파싱 → 실패 시 첫 '{'~마지막 '}' 슬라이스 폴백. */
function extractJsonCandidate(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const direct = tryParseJson(text);
  if (direct !== undefined) return direct;

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return tryParseJson(text.slice(first, last + 1));
  }
  return undefined;
}

function summarizeZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

export interface CallExamReportJsonOptions<T> {
  stage: ExamReportAiStage;
  systemPrompt: string;
  userPrompt: string;
  images?: AtlasChatImageInput[];
  schema: z.ZodType<T>;
  /** 마감 시각(ms). 지정 시 남은 시간 - 5s 로 타임아웃 캡, 초과면 TIMEOUT throw. */
  deadlineAt?: number;
  /** anthropic 모델일 때만 system 캐시 브레이크포인트 부착(옵트인). */
  cacheSystem?: boolean;
  /** anthropic 모델일 때만 마지막 이미지 블록에 캐시 브레이크포인트 부착(옵트인, 이미지 재전송 절감). */
  cacheImages?: boolean;
  /** 토큰 누적 대상(호출자 공유 객체). */
  usage?: ExamReportLlmUsage;
}

export async function callExamReportJson<T>(opts: CallExamReportJsonOptions<T>): Promise<T> {
  const config = getExamReportAiConfig(opts.stage);
  const isClaude = isAtlasClaudeModel(config.model);
  const cacheSystem = Boolean(opts.cacheSystem) && isClaude;
  const cacheImages = Boolean(opts.cacheImages) && isClaude;

  let lastIssues = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const userPrompt =
      attempt === 0
        ? opts.userPrompt
        : `${opts.userPrompt}\n\n[교정 요청] 직전 응답이 스키마와 불일치했습니다: ${lastIssues}. 다른 설명 없이 규격에 맞는 JSON 만 다시 출력하십시오.`;

    let body: AtlasGeminiLikeResponse | undefined;
    for (let transient = 0; ; transient++) {
      const timeoutInMs = resolveTimeoutMs(config.timeoutInMs, opts.deadlineAt);
      try {
        body = await postAtlasChatCompletionAsGeminiLike({
          model: config.model,
          systemPrompt: opts.systemPrompt,
          userPrompt,
          images: opts.images,
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          responseMimeType: "application/json",
          timeoutInMs,
          systemCacheControl: cacheSystem,
          imageCacheControl: cacheImages,
          reasoning: config.reasoning,
          fetcher: abortableFetcher,
        });
        break;
      } catch (err) {
        const llmErr = toLlmError(err);
        const backoff = TRANSIENT_BACKOFF_MS[transient];
        if (!isTransientHttp(llmErr) || backoff == null) throw llmErr;
        // 백오프 후에도 마감 여유가 없으면 재시도 없이 원 오류 전파
        if (
          opts.deadlineAt != null &&
          Date.now() + backoff + DEADLINE_SAFETY_MS >= opts.deadlineAt
        ) {
          throw llmErr;
        }
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    if (opts.usage) {
      opts.usage.calls += 1;
      opts.usage.promptTokens += body.usageMetadata?.promptTokenCount ?? 0;
      opts.usage.completionTokens += body.usageMetadata?.candidatesTokenCount ?? 0;
    }

    const text = extractResponseText(body);
    if (!text) {
      throw new ExamReportLlmError("모델이 빈 응답을 반환했습니다", "EMPTY");
    }

    const parsed = opts.schema.safeParse(extractJsonCandidate(text));
    if (parsed.success) return parsed.data;
    lastIssues = summarizeZodIssues(parsed.error);
  }

  throw new ExamReportLlmError(`스키마 파싱 실패: ${lastIssues}`, "PARSE");
}
