// ============================================================================
// 학습지 분석 — 스트리밍 LLM 호출 (회복형 생성기의 llmText 주입용)
//
// 회복형 생성기(resilient-generate.ts)는 기본적으로 generateQuestionText(AI SDK,
// 비스트리밍)로 호출한다. 이 모듈은 같은 계약(LlmTextFn)을 지키면서 게이트웨이
// SSE 를 직접 읽어 사고/본문 델타를 흘리는 구현을 만든다 — 문제 생성의
// md-stream 라우트가 쓰는 것과 동일한 미리보기 UX 를 학습지 큐에도 주기 위함.
//
// 안전 계약(중요): 스트리밍은 **표시용 부가 기능**이다. 스트림이 어떤 이유로든
// 실패하면 비스트리밍 기본 경로로 폴백해 생성 자체는 절대 깨지지 않게 한다.
// 이 경로는 지문 큐의 주계통(use-passage-queue fast:true)이라 폭발 반경이 크다.
// ============================================================================

import {
  ATLASCLOUD_API_KEY,
  ATLASCLOUD_BASE_URL,
  ATLAS_STANDARD_MODEL_ID,
  getAtlasCloudHeaders,
  normalizeAtlasModelId,
} from "@/lib/atlas-ai";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import type { LlmTextFn, LlmTextResult } from "./resilient-generate";

/** 클라이언트로 나가는 미리보기 프레임 — md-stream 과 동일 문법(t: r|c). */
export type AnalysisStreamEvent =
  | { t: "r"; d: string }
  | { t: "c"; d: string }
  | { t: "phase"; label: string };

export interface StreamingLlmOptions {
  emit: (event: AnalysisStreamEvent) => void;
  /** 스트림 실패 시 사용할 비스트리밍 구현(기본 경로). 반드시 넘긴다. */
  fallback: LlmTextFn;
  /** 단계 라벨 한글화 — 'draft' → '초안', 섹션 kind → 한글명. */
  labelOf?: (label: string) => string;
  modelId?: string;
}

const SECTION_LABEL: Record<string, string> = {
  draft: "전체 초안",
  meta: "표제 정보",
  passage: "지문",
  summary: "요약",
  grammar: "어법",
  "exam-focus": "출제 포인트",
  vocabulary: "어휘",
  parsing: "구문 분석",
  "learning-worksheet": "학습지",
  "self-check": "학습 점검",
  workbook: "실전 워크북",
  inference: "수능 추론",
  // 국어(KO) 생성 섹션 — 정본은 ko-section-prompts.ts 의 KO_ALL_GEN_KINDS
  "ko-overview": "작품 개관",
  "ko-paragraph": "문단 분석",
  "ko-concept-vocab": "개념어·어휘",
  "ko-structure": "구조 분석",
  "ko-literary-device": "표현 기법",
  "ko-speaker": "화자·시점",
  "ko-exam-points": "출제 포인트",
  "ko-check-quiz": "확인 문제",
};

export function analysisPhaseLabel(label: string): string {
  return SECTION_LABEL[label] ?? label;
}

/**
 * 게이트웨이 SSE 를 읽어 델타를 emit 하고 최종 텍스트를 반환한다.
 * 실패는 그대로 throw — 호출부가 폴백을 결정한다.
 * (실전 학습지 경로 generate.ts 도 이 함수를 직접 쓴다 — durationMs 까지 반환.)
 */
export async function streamAnalysisText(args: {
  prompt: string;
  modelId?: string;
  /** 콜 단위 사고 강도 — 미지정 시 기존값 "high"(무회귀). 26-08-12 luna 전환 배선. */
  reasoningEffort?: string;
  maxTokens: number;
  timeoutMs: number;
  temperature: number;
  emit: (event: AnalysisStreamEvent) => void;
}): Promise<LlmTextResult & { durationMs: number }> {
  const modelId = normalizeAtlasModelId(args.modelId ?? ATLAS_STANDARD_MODEL_ID);
  const startedAt = Date.now();
  if (!ATLASCLOUD_API_KEY) throw new Error("gateway api key missing");
  const res = await fetch(`${ATLASCLOUD_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      ...getAtlasCloudHeaders(),
      Authorization: `Bearer ${ATLASCLOUD_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: args.prompt }],
      max_tokens: args.maxTokens,
      temperature: args.temperature,
      response_format: { type: "json_object" },
      stream: true,
      usage: { include: true },
      // exclude:false — 사고 델타를 받아야 "사고 중" 패널을 그린다.
      // 기본 effort 는 사고 high 계약(401e3fae) 그대로 — 콜 단위 오버라이드만 허용.
      reasoning: { enabled: true, effort: args.reasoningEffort ?? "high", exclude: false },
    }),
    signal: AbortSignal.timeout(Math.max(10_000, args.timeoutMs)),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`analysis upstream ${res.status}: ${detail.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usage: {
    cost?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  } | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices?.[0]?.delta ?? {};
        const reasoningDelta: string = delta.reasoning ?? delta.reasoning_content ?? "";
        // 모델명 은닉 — 표시용 델타만 마스킹하고, 파싱에 쓰는 text 는 원문 유지.
        if (reasoningDelta) {
          args.emit({ t: "r", d: sanitizeAiModelDisclosureText(reasoningDelta) });
        }
        const contentDelta: string = delta.content ?? "";
        if (contentDelta) {
          text += contentDelta;
          args.emit({ t: "c", d: sanitizeAiModelDisclosureText(contentDelta) });
        }
        if (j.usage) usage = j.usage;
      } catch {
        /* partial SSE line — 다음 청크에서 완성된다 */
      }
    }
  }

  if (!text.trim()) throw new Error("모델이 본문 출력을 내지 않았습니다.");

  return {
    text,
    // readAiUsageTokens/readAiUsageCost 가 읽는 키로 맞춘다 — 게이트웨이 원문은
    // snake_case(prompt_tokens)라 그대로 두면 원가 원장에 0 으로 기록된다.
    usage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      costUsd:
        typeof usage?.cost === "number" && usage.cost > 0 ? usage.cost : undefined,
    },
    modelId,
    provider: "OPENROUTER",
    durationMs: Date.now() - startedAt,
  };
}

/**
 * 회복형 생성기에 주입할 LlmTextFn — 스트리밍으로 시도하고, 실패하면 조용히
 * 비스트리밍 기본 경로로 폴백한다(생성 성공률 무회귀).
 */
export function createStreamingLlmText(opts: StreamingLlmOptions): LlmTextFn {
  const modelId = normalizeAtlasModelId(opts.modelId ?? ATLAS_STANDARD_MODEL_ID);
  const labelOf = opts.labelOf ?? analysisPhaseLabel;
  return async (args) => {
    opts.emit({ t: "phase", label: labelOf(args.label) });
    try {
      return await streamAnalysisText({
        prompt: args.prompt,
        modelId,
        maxTokens: args.maxTokens,
        timeoutMs: args.timeoutMs,
        temperature: args.label === "draft" ? 0.1 : 0.15,
        emit: opts.emit,
      });
    } catch (error) {
      // 표시용 기능이 생성을 깨뜨리면 안 된다 — 기본 경로로 이어 달린다.
      console.warn(
        `[analysis-stream] ${args.label} 스트리밍 실패 — 비스트리밍 폴백`,
        error instanceof Error ? error.message : error,
      );
      return opts.fallback(args);
    }
  };
}
