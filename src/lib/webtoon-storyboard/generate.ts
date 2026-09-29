// ============================================================================
// Storyboard generation — Gemini (OpenRouter chat, json_schema strict) with one
// validator-driven repair round.
// ----------------------------------------------------------------------------
// Returns the best attempt (fewest violations). Throws only when no attempt is
// structurally usable — the processor then falls back to the legacy direct
// prompt so a storyboard outage never blocks image generation.
// ============================================================================

import { postAtlasChatCompletionAsGeminiLike } from "@/lib/atlas-chat-rest";
import { buildStoryboardRepairPrompt, buildStoryboardUserPrompt, STORYBOARD_SYSTEM_PROMPT, type StoryboardPromptInput } from "./prompt";
import { STORYBOARD_JSON_SCHEMA, type PersistedWebtoonStoryboard } from "./types";
import { normalizeStoryboard, validateStoryboard, violationScore, type StoryboardValidation } from "./validate";

export const DEFAULT_STORYBOARD_MODEL = "google/gemini-3.7-flash";

export function webtoonStoryboardModel(): string {
  return process.env.OPENROUTER_WEBTOON_STORYBOARD_MODEL?.trim() || DEFAULT_STORYBOARD_MODEL;
}

function storyboardReasoningEffort(): string {
  return process.env.OPENROUTER_WEBTOON_STORYBOARD_REASONING?.trim() || "low";
}

const STORYBOARD_TIMEOUT_MS = 120_000;

async function abortableFetcher(
  input: string,
  init: RequestInit & { timeoutInMs?: number },
): Promise<Response> {
  const { timeoutInMs, ...rest } = init;
  if (!timeoutInMs) return fetch(input, rest);
  const controller = new AbortController();
  // Not cleared on resolve: the caller reads the body after this returns, and the
  // deadline must cover that read too. unref() keeps the pending timer from holding
  // the process open; aborting an already-consumed response is a no-op.
  const timer = setTimeout(() => controller.abort(), timeoutInMs);
  timer.unref?.();
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export interface StoryboardCallUsage {
  model: string;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  generationId: string | null;
}

export interface StoryboardResult {
  storyboard: PersistedWebtoonStoryboard;
  /** Raw usage per LLM call (for the cost ledger). */
  calls: StoryboardCallUsage[];
}

interface Attempt {
  json: string;
  storyboard: NonNullable<ReturnType<typeof normalizeStoryboard>>;
  validation: StoryboardValidation;
}

async function callOnce(
  model: string,
  userPrompt: string,
): Promise<{ text: string; usage: StoryboardCallUsage }> {
  const body = await postAtlasChatCompletionAsGeminiLike({
    model,
    systemPrompt: STORYBOARD_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.8,
    maxOutputTokens: 12_000,
    responseJsonSchema: { name: "webtoon_storyboard", schema: STORYBOARD_JSON_SCHEMA, strict: true },
    reasoningEffort: storyboardReasoningEffort(),
    timeoutInMs: STORYBOARD_TIMEOUT_MS,
    fetcher: abortableFetcher,
  });
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
  const finish = body.candidates?.[0]?.finishReason;
  const usage: StoryboardCallUsage = {
    model,
    costUsd: body.usageMetadata?.costUsd ?? null,
    inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
    generationId: body.usageMetadata?.generationId ?? null,
  };
  if (finish && finish !== "STOP") {
    throw Object.assign(new Error(`storyboard stopped early (finishReason=${finish})`), { usage });
  }
  return { text, usage };
}

function parseAttempt(text: string, input: StoryboardPromptInput): Attempt | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      raw = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  const storyboard = normalizeStoryboard(raw);
  if (!storyboard) return null;
  const validation = validateStoryboard(storyboard, {
    language: input.language,
    targetPanels: input.targetPanels,
    passageContent: input.passageContent,
  });
  return { json: text, storyboard, validation };
}

export async function generateWebtoonStoryboard(
  input: StoryboardPromptInput,
): Promise<StoryboardResult> {
  const model = webtoonStoryboardModel();
  const calls: StoryboardCallUsage[] = [];
  const attempts: Attempt[] = [];

  // First call failures (timeout, truncated output) are billed too — keep their usage and
  // spend the second call as a plain retry instead of a repair round.
  let firstText = "";
  try {
    const first = await callOnce(model, buildStoryboardUserPrompt(input));
    calls.push(first.usage);
    firstText = first.text;
  } catch (err) {
    const usage = (err as { usage?: StoryboardCallUsage }).usage;
    if (usage) calls.push(usage);
    console.warn("[webtoon-storyboard] first call failed; retrying once", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const a1 = firstText ? parseAttempt(firstText, input) : null;
  if (a1) attempts.push(a1);

  const needsRepair = !a1 || a1.validation.fatal.length > 0 || a1.validation.violations.length > 0;
  if (needsRepair) {
    const violations = a1
      ? [...a1.validation.fatal, ...a1.validation.violations]
      : ["출력이 스키마에 맞는 JSON 이 아니었다."];
    try {
      const second = await callOnce(
        model,
        firstText
          ? buildStoryboardRepairPrompt(input, a1?.json ?? firstText.slice(0, 4000), violations.slice(0, 30))
          : buildStoryboardUserPrompt(input),
      );
      calls.push(second.usage);
      const a2 = parseAttempt(second.text, input);
      if (a2) attempts.push(a2);
    } catch (err) {
      // Repair is best-effort: keep the first attempt if it is usable.
      const usage = (err as { usage?: StoryboardCallUsage }).usage;
      if (usage) calls.push(usage);
      console.warn("[webtoon-storyboard] repair round failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const usable = attempts.filter((a) => a.validation.fatal.length === 0);
  if (usable.length === 0) {
    const reasons = attempts.flatMap((a) => a.validation.fatal);
    throw Object.assign(
      new Error(`storyboard unusable: ${reasons.join(" / ") || "unparseable output"}`),
      { calls },
    );
  }
  const best = usable.reduce((a, b) => (violationScore(b.validation) < violationScore(a.validation) ? b : a));

  return {
    storyboard: {
      ...best.storyboard,
      meta: {
        model,
        generatedAt: new Date().toISOString(),
        attempts: calls.length,
        warnings: best.validation.violations,
        targetPanels: input.targetPanels,
      },
    },
    calls,
  };
}
