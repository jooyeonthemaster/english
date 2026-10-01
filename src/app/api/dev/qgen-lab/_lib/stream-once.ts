// 복제 원본: src/app/api/workbench/ai-jobs/question-generation/md-stream/route.ts:224-385 (streamOnce)
// qgen-lab 사본 — 요청 본문·SSE 파싱·표시 방류·EMPTY_BODY 문구는 원본과 동일하게 두고,
// 원본의 하드코딩(effort "high"·max_tokens 14k·luna 옵션 묶음)만 GenModelConfig 로 파라미터화했다.
// 추가분(랩 계측): TTFB·첫 사고/첫 본문 도착 ms, reasoning_tokens, generation id·서빙 모델·공급자,
// BYOK upstream 합산 원가(atlas-ai.ts:489-516), 비용 원장 기록·캡 사전 거부.
// 구제 전략 추가분(RESCUE-SPEC §3.2): messages(여러 턴) 덮어쓰기 · 원장 note 머리표(runId). 둘 다 없으면 요청 본문·원장
// 줄은 추가 전과 바이트 동일(scripts/_tmp-qgenlab-rescue-parity.ts A·B·C).
import type { GrammarKillerV2DisplayFilter } from "@/lib/md-qgen/grammar-killer-v2";
import {
  LunaJsonMdBridge,
  type LunaBridgeFieldSpec,
} from "@/lib/md-qgen/luna-stream-bridge";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import type { GenModelConfig, LabEvent } from "@/lib/qgen-lab/types";

import { assertLabBudget, readOpenRouterCostUsd, recordLabCost } from "./ledger";

/** 전략 콜의 대화 턴(시연을 앞선 assistant 턴으로 넣는 ICL 등). */
export interface LabChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamOnceArgs {
  /** 단일 user 턴 프롬프트. messages 가 있으면 본문에 쓰이지 않는다(호출부의 promptChars·sha1 용). */
  prompt: string;
  /** 있으면(비어 있지 않으면) body.messages 로 **그대로** 쓴다 — prompt·systemMessage 는 본문에 넣지 않는다. */
  messages?: LabChatMessage[] | null;
  /** model/effort/maxTokens/providerPin/format */
  gen: GenModelConfig;
  /** luna-json 일 때 LUNA_QGEN_SYSTEM_MESSAGE. */
  systemMessage?: string | null;
  /** luna-json 일 때만 — response_format json_schema. */
  jsonSchema?: { name: string; strict: boolean; schema: unknown } | null;
  /** luna-json 표시용 JSON→md 브리지 스펙. */
  bridgeSpecs?: LunaBridgeFieldSpec[] | null;
  /** 어법 KILLER v2 표시 필터(콜마다 새 인스턴스 — 호출부가 emit 을 묶어 만든다). */
  displayFilter?: GrammarKillerV2DisplayFilter | null;
  timeoutMs: number;
  /** {t:"r"} / {t:"c"} 만 여기서 emit. */
  emit: (e: LabEvent) => void;
  /** 원장 phase. */
  phase: string;
  /** 원장 note 머리표(전략 콜: "run=<runId> <stage>"). 없으면 note 는 기존 그대로. */
  ledgerNote?: string | null;
}

export interface StreamOnceResult {
  text: string;
  reasoningChars: number;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  durationMs: number;
  /** 요청 시작 기준 — 응답 본문 첫 바이트 도착. */
  ttfbMs: number | null;
  /** 요청 시작 기준 — 첫 비어 있지 않은 사고 델타. */
  firstReasoningMs: number | null;
  /** 요청 시작 기준 — 첫 비어 있지 않은 본문 델타. */
  firstContentMs: number | null;
  finishReason: string | null;
  errorChunk: string | null;
  provider: string | null;
  /** 실제 서빙된 모델 id(j.model). 모르면 null. */
  model: string | null;
  generationId: string | null;
}

/** streamOnce 실패. message 는 원본과 동일(EMPTY_BODY: … / generation upstream …) —
 *  호출부는 message.startsWith("EMPTY_BODY") 로 판별한다. partial 은 실패 시점까지의 계측
 *  (AttemptRecord.transportError 기록용, 없을 수 있음). */
export class StreamOnceError extends Error {
  readonly partial: StreamOnceResult | null;
  constructor(message: string, partial: StreamOnceResult | null, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "StreamOnceError";
    this.partial = partial;
  }
}

interface OpenRouterUsage {
  cost?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number | null } | null;
}

/** OpenRouter 직접 스트림 1콜 — 사고/본문 델타를 emit 으로 흘리고 최종 usage 를 회수. */
export async function streamOnce(a: StreamOnceArgs): Promise<StreamOnceResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");
  assertLabBudget(a.phase);
  // luna-json(route 의 args.luna 대응): 본문 델타는 브리지로만 방류, 원문 JSON 은 표시하지 않는다.
  const jsonMode = a.gen.format === "luna-json" || !!a.jsonSchema;
  // 표시 방류는 실패해도 생성·파싱을 멈추지 않는다(route 의 emit 과 같은 정책).
  const emit = (e: LabEvent) => {
    try {
      a.emit(e);
    } catch {
      /* 표시 전용 */
    }
  };
  const body: Record<string, unknown> = {
    model: a.gen.model,
    messages:
      a.messages && a.messages.length > 0
        ? a.messages
        : a.systemMessage
          ? [
              { role: "system", content: a.systemMessage },
              { role: "user", content: a.prompt },
            ]
          : [{ role: "user", content: a.prompt }],
    // 사고+출력이 상한을 공유한다(프로덕션 14k).
    max_tokens: a.gen.maxTokens,
    stream: true,
    usage: { include: true },
  };
  if (a.gen.effort !== null) {
    body.reasoning = { enabled: true, effort: a.gen.effort, exclude: false };
  }
  if (a.jsonSchema) {
    body.response_format = { type: "json_schema", json_schema: a.jsonSchema };
  }
  if (a.gen.providerPin && a.gen.providerPin.length > 0) {
    // Azure 폴백 ~10배 이중가격 차단(O214) — 핀 공급자 직접 서빙만.
    body.provider = { order: a.gen.providerPin, allow_fallbacks: false };
  }

  const t0 = performance.now();
  const since = () => Math.round(performance.now() - t0);
  let text = "";
  let reasoningChars = 0;
  let provider: string | null = null;
  let servedModel: string | null = null;
  let generationId: string | null = null;
  let finishReason: string | null = null;
  let errorChunk: string | null = null;
  let usage: OpenRouterUsage | null = null;
  let ttfbMs: number | null = null;
  let firstReasoningMs: number | null = null;
  let firstContentMs: number | null = null;

  const snapshot = (): StreamOnceResult => ({
    text,
    reasoningChars,
    costUsd: readOpenRouterCostUsd(usage),
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? null,
    durationMs: since(),
    ttfbMs,
    firstReasoningMs,
    firstContentMs,
    finishReason,
    errorChunk,
    provider,
    model: servedModel,
    generationId,
  });
  const record = (r: StreamOnceResult, ok: boolean, note: string) =>
    recordLabCost({
      phase: a.phase,
      kind: "gen",
      model: r.model ?? a.gen.model,
      costUsd: r.costUsd ?? 0,
      ms: r.durationMs,
      ok,
      note: a.ledgerNote ? `${a.ledgerNote} ${note}` : note,
    });
  const fail = (message: string, note: string, cause?: unknown): never => {
    const partial = snapshot();
    record(partial, false, note);
    throw new StreamOnceError(message, partial, cause);
  };

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(10_000, a.timeoutMs)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(message, `fetch: ${message.slice(0, 120)}`, err);
  }
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    return fail(
      `generation upstream ${res.status}: ${detail.slice(0, 200)}`,
      `upstream ${res.status}`,
    );
  }
  // 표시 전용 브릿지 — 예외는 표시만 포기(생성·파싱은 계속).
  let bridge: LunaJsonMdBridge | null =
    jsonMode && a.bridgeSpecs
      ? new LunaJsonMdBridge(a.bridgeSpecs, (delta) =>
          emit({ t: "c", d: sanitizeAiModelDisclosureText(delta) }),
        )
      : null;
  let displayFilter = a.displayFilter ?? null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (ttfbMs === null && value && value.byteLength > 0) ttfbMs = since();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          if (typeof j.provider === "string" && !provider) provider = j.provider;
          if (typeof j.model === "string" && j.model && !servedModel) servedModel = j.model;
          if (typeof j.id === "string" && j.id && !generationId) generationId = j.id;
          if (j.error && !errorChunk)
            errorChunk = JSON.stringify(j.error).slice(0, 300);
          const choice = j.choices?.[0];
          if (choice?.finish_reason) finishReason = String(choice.finish_reason);
          const delta = choice?.delta ?? {};
          const reasoningDelta: string =
            delta.reasoning ?? delta.reasoning_content ?? "";
          if (reasoningDelta) {
            if (firstReasoningMs === null) firstReasoningMs = since();
            reasoningChars += reasoningDelta.length;
            // 모델명 은닉 정책 — 표시용 델타만 마스킹(파싱용 누적 text 는 원문 유지).
            emit({ t: "r", d: sanitizeAiModelDisclosureText(reasoningDelta) });
          }
          const contentDelta: string = delta.content ?? "";
          if (contentDelta) {
            if (firstContentMs === null) firstContentMs = since();
            text += contentDelta;
            if (bridge) {
              try {
                bridge.push(contentDelta);
              } catch (bridgeErr) {
                console.warn("[qgen-lab] luna bridge failed — 표시 중단", bridgeErr);
                bridge = null;
              }
            } else if (displayFilter) {
              // v2 표시 필터 — 예외는 표시만 포기(생성·파싱은 계속, 브릿지와 동일 정책).
              try {
                displayFilter.push(contentDelta);
              } catch (filterErr) {
                console.warn("[qgen-lab] killer-v2 display filter failed", filterErr);
                displayFilter = null;
              }
            } else if (!jsonMode) {
              emit({ t: "c", d: sanitizeAiModelDisclosureText(contentDelta) });
            }
          }
          if (j.usage) usage = j.usage;
        } catch {
          /* partial SSE line */
        }
      }
    }
  } catch (err) {
    // 스트림 중 타임아웃·연결 끊김 — 원본은 그대로 전파. 랩은 원장 기록 후 같은 메시지로 전파.
    const message = err instanceof Error ? err.message : String(err);
    return fail(message, `stream: ${message.slice(0, 120)}`, err);
  }
  try {
    displayFilter?.flush();
  } catch {
    /* 표시 전용 — 무시 */
  }
  if (!text.trim()) {
    // 계통 표식(EMPTY_BODY) — 호출부가 전송 계층 재시도로 흡수한다(route.ts:1381-1405).
    // finish=length 는 사고가 예산 전량을 잠식한 절단 — 원인 표식을 붙여 포렌식을 살린다.
    const message = `EMPTY_BODY: 모델이 본문 출력을 내지 않았습니다.${
      finishReason ? ` (finish=${finishReason})` : ""
    }${errorChunk ? ` (error=${errorChunk.slice(0, 120)})` : ""}`;
    return fail(message, `EMPTY_BODY${finishReason ? ` finish=${finishReason}` : ""}`);
  }
  // 원가 가드(O214 공급자 이중가격) — allow_fallbacks:false 라 이론상 불발이지만 계측은 남긴다.
  const pin = a.gen.providerPin;
  if (pin && pin.length > 0 && provider) {
    // 핀은 slug("openai", "google-ai-studio"), 응답은 표시명("OpenAI") — 영숫자만 비교.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const served = norm(provider);
    if (!pin.some((p) => norm(p) === served)) {
      console.warn(`[qgen-lab] provider drift: ${provider} (pin ${pin.join(",")})`);
    }
  }
  const result = snapshot();
  record(
    result,
    true,
    `${generationId ?? "-"} fin=${finishReason ?? "-"}${result.costUsd === null ? " cost=unknown" : ""}`,
  );
  return result;
}
