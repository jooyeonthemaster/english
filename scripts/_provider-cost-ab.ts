/**
 * 임시 진단 스크립트(_prefix) — 프로바이더 원가 A/B 실호출 테스트.
 *
 * 같은 지문(Imagination)·같은 prod 프롬프트·같은 파라미터로:
 *   1) anthropic-direct   (schema / plain)  — ANTHROPIC_API_KEY, /v1/messages
 *   2) openrouter claude  (Bedrock 고정 / Anthropic 고정, 둘 다 schema=prod 형상)
 *   3) gemini-direct      (plain)           — GEMINI_API_KEY, generateContent
 *   4) openrouter gemini  (plain)
 * 를 호출해 라우트별 청구 토큰·원가·지연을 대조한다.
 *
 * raw HTTP 사용 사유: 이 테스트의 목적이 와이어 레벨 토큰 계상 감사이고,
 * 저장소에 @anthropic-ai/sdk 미설치(병렬 세션 활성 중 node_modules 변형 회피).
 *
 * 실행: NODE_OPTIONS="" npx tsx scripts/_provider-cost-ab.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";

const GRAMMAR_ERROR_FINAL_CHECKLIST = `## 출력 직전 최종 자기검증 (하나라도 위반 시 해당 부분을 고치고 나서 JSON을 출력)
1. 정답 밑줄: 오류형(errorExpression)이 지문에 실제로 심어져 있고, correction 은 원문 그대로인가? (오류를 심지 않으면 무효)
2. 정답 포인트: pointCode 가 a~i,k(핵심 10) 중 하나이고, KILLER 라면 인접 주어-동사처럼 한눈에 보이는 자리가 아닌가?
3. 미끼 밑줄 전부: only/given/does/지시사 that 같은 장식 필러가 아니라 구조적으로 의미 있는 문법 자리인가?
4. KILLER: 어떤 미끼도 정답과 같은 pointCode 를 쓰지 않는가?
5. 모든 expression/correction 이 지문 원문에 한 글자도 다르지 않게 실재하는가? (잘린 표현·창작 표현 무효)
6. 명사 뒤에 what 을 넣는 변형을 정답으로 쓰지 않았는가? (한눈에 비문 = 반려됨)
7. keyPoints 3개가 각각 실제 밑줄 라벨로 시작하고 1번이 정답 라벨인가?`;

const IMAGINATION = `Imagination continues to function when perception is not actively discerning objects, in cases of emotion, disease, and sleep. Emotions dispose one to see the world in a distorted way. A coward's perceptual disposition is affected by his disposition to experience fear. A lover's expectations are affected by desire. In such cases, a small similarity between a perceived object and the thing one expects to see can lead to the misidentification of the perceived object as that thing. The coward sees the enemy, while the lover sees the object of desire everywhere. The more affected one is, the less similarity is required for the thing to appear. While the central organ of sense normally functions by comparing similarities and differences, emotions dispose one to discern objects inaccurately. The greater the emotional investment, the more biased one's perception.`;

// Anthropic 구조화출력이 거부하는 제약 키 제거 (atlas-ai.ts normalizeClaudeResponseFormat 동일)
function stripUnsupportedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnsupportedKeys);
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (
      ["maxItems", "minItems", "maximum", "minimum", "exclusiveMaximum", "exclusiveMinimum", "maxLength", "minLength", "multipleOf", "pattern", "format"].includes(k)
    )
      continue;
    out[k] = stripUnsupportedKeys(v);
  }
  return out;
}

type CallResult = {
  route: string;
  ok: boolean;
  latencyMs: number;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  // OpenRouter generation API
  normalizedPrompt?: number;
  nativePrompt?: number;
  nativeCompletion?: number;
  costUsd?: number;
  costSource?: string;
  finish?: string;
  genTimeMs?: number;
  error?: string;
};

async function buildPrompts() {
  const { z } = await import("zod");
  const { STRUCTURED_TYPE_PROMPTS } = await import("../src/lib/question-schemas");
  const { getTypeQualityRubric, buildQuestionTargetCandidateBlock } = await import("../src/lib/question-quality");
  const {
    buildQuestionTypeSettingsPrompt,
    readQuestionTypeDifficultySetting,
    readQuestionTypeGenerationPlanSetting,
    resolveQuestionTypeGenerationSettings,
  } = await import("../src/lib/question-type-generation-settings");
  const { buildDiversityPromptBlock } = await import("../src/lib/question-diversity");
  const { getAiResponseSchema } = await import("../src/lib/question-ai-schemas-mc");
  const { normalizePassageWhitespace } = await import("../src/lib/question-postprocess/text-utils");
  const { DIFF_DESCRIPTION } = await import("../src/app/api/ai/generate-questions-auto/_lib/constants");
  const { buildGenerationPrompt, STRUCTURED_OUTPUT_INSTRUCTIONS } = await import("../src/app/api/ai/generate-questions-auto/_lib/prompts");
  const { mergeCustomPromptWithTypeSettings, isRecord } = await import("../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers");

  const subType = "GRAMMAR_ERROR";
  const rawTypeSettings = { difficulty: "KILLER", pointFocus: true, answerCount: 1, markerCount: 5 } as Record<string, unknown>;
  const passageContent = normalizePassageWhitespace(IMAGINATION).replace(/_{2,}/g, " ").replace(/[ \t]{2,}/g, " ");

  const build = (plan: "STANDARD" | "PREMIUM") => {
    const effectiveDiffLabel = readQuestionTypeDifficultySetting(rawTypeSettings, "KILLER");
    const effectiveDiffInstruction = (DIFF_DESCRIPTION as Record<string, string>)[effectiveDiffLabel] || "top-tier exam item requiring precise passage evidence";
    const effectiveGenerationPlan = readQuestionTypeGenerationPlanSetting(rawTypeSettings, plan);
    const typePrompt = (STRUCTURED_TYPE_PROMPTS as Record<string, string>)[subType]!;
    const typeQualityRubric = getTypeQualityRubric(subType, effectiveDiffLabel);
    const resolved = resolveQuestionTypeGenerationSettings(subType, rawTypeSettings, effectiveDiffLabel) as Record<string, any>;
    const g = Math.min(10, (resolved.grammarMarkerCount ?? 5) + 1); // G=K+1
    const generationTypeSettings = { ...(isRecord(resolved.effectiveTypeSettings) ? resolved.effectiveTypeSettings : {}), markerCount: g };
    const typeSettingsPrompt = buildQuestionTypeSettingsPrompt(subType, generationTypeSettings, effectiveDiffLabel);
    const diversitySignals = { usedTargets: [], usedAnswerLabels: [], usedPointCodes: [] };
    const diversityPromptBlock = buildDiversityPromptBlock(subType, diversitySignals, 4, {
      sentenceInsertSlotCount: resolved.sentenceInsertSlotCount,
      vocabChoiceMarkerCount: resolved.vocabChoiceMarkerCount,
      vocabChoiceAnswerCount: resolved.vocabChoiceAnswerCount,
      antonymPairCount: resolved.antonymPairCount,
      grammarMarkerCount: g,
      grammarAnswerCount: resolved.grammarAnswerCount,
    });
    const mergedCustomPrompt = mergeCustomPromptWithTypeSettings("", [typeSettingsPrompt, diversityPromptBlock].filter(Boolean).join("\n\n"));
    const targetCandidateBlock = buildQuestionTargetCandidateBlock(subType, passageContent, {
      irrelevantSlotCount: resolved.irrelevantSlotCount,
      grammarMarkerCount: g,
      grammarScarcityBaseCount: resolved.grammarMarkerCount,
      grammarAnswerCount: resolved.grammarAnswerCount,
      grammarCorrectionErrorCount: resolved.grammarCorrectionErrorCount,
      antonymPairCount: resolved.antonymPairCount,
      blankInferenceBlankCount: resolved.blankInferenceBlankCount,
      blankInferenceParaphraseAnswer: resolved.blankInferenceParaphraseAnswer,
      blankInferenceDoubleNegative: resolved.blankInferenceDoubleNegative,
      requestedDifficulty: effectiveDiffLabel,
      usedTargets: [],
      usedAnswerLabels: [],
      usedPointCodes: [],
      variantIndex: 4,
      diversityEnabled: true,
      pointFocus: resolved.grammarPointFocus,
    });
    const responseSchema = getAiResponseSchema(subType, {
      irrelevantSlotCount: resolved.irrelevantSlotCount,
      grammarMarkerCount: g,
      grammarAnswerCount: resolved.grammarAnswerCount,
      grammarCorrectionErrorCount: resolved.grammarCorrectionErrorCount,
      summaryCompleteMcBlankCount: resolved.summaryCompleteMcBlankCount,
      summaryCompleteBlankCount: resolved.summaryCompleteBlankCount,
      summaryWritingBlankCount: undefined,
      topicSentenceWritingBlankCount: undefined,
      contentMatchOptionCount: resolved.contentMatchOptionCount,
      contentMatchAnswerCount: resolved.contentMatchAnswerCount,
      vocabChoiceMarkerCount: resolved.vocabChoiceMarkerCount,
      vocabChoiceAnswerCount: resolved.vocabChoiceAnswerCount,
      sentenceInsertSlotCount: resolved.sentenceInsertSlotCount,
      antonymPairCount: resolved.antonymPairCount,
      blankInferenceBlankCount: resolved.blankInferenceBlankCount,
      genericOptionCount: resolved.genericOptionCount,
      genericAnswerCount: resolved.genericAnswerCount,
    });
    const jsonSchema = z.toJSONSchema(responseSchema as never) as Record<string, unknown>;
    const { system, prompt } = buildGenerationPrompt({
      schoolType: "high school",
      gradeInfo: "grade 2",
      passageContent,
      teacherIntentBlock: "",
      analysisContext: "",
      targetPoints: [],
      typePrompt,
      structuredInstructions: STRUCTURED_OUTPUT_INSTRUCTIONS,
      targetCandidateBlock,
      typeQualityRubric,
      typeCount: 1,
      diffLabel: effectiveDiffLabel,
      diffInstruction: effectiveDiffInstruction,
      generationPlan: effectiveGenerationPlan,
      subType,
      finalChecklist: GRAMMAR_ERROR_FINAL_CHECKLIST,
      customPrompt: mergedCustomPrompt,
    });
    return { system, prompt, jsonSchema };
  };

  return { premium: build("PREMIUM"), standard: build("STANDARD") };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = Date.now();
  const value = await fn();
  return { ms: Date.now() - t0, value };
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 240_000): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body };
}

async function orGeneration(id: string, key: string): Promise<any> {
  // generation 레코드는 수 초 뒤에 조회 가능해지기도 한다 — 3회 재시도.
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const { body } = await fetchJson(`https://openrouter.ai/api/v1/generation?id=${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (body?.data) return body.data;
  }
  return null;
}

async function main() {
  const OR_KEY = process.env.OPENROUTER_API_KEY || process.env.ATLASCLOUD_API_KEY || "";
  const ANT_KEY = process.env.ANTHROPIC_API_KEY || "";
  const GEM_KEY = process.env.GEMINI_API_KEY || "";
  if (!OR_KEY || !ANT_KEY || !GEM_KEY) throw new Error("missing keys");

  const { premium, standard } = await buildPrompts();
  const strippedSchema = stripUnsupportedKeys(premium.jsonSchema) as Record<string, unknown>;
  console.log(`[build] premium system=${premium.system?.length}c prompt=${premium.prompt.length}c schema=${JSON.stringify(premium.jsonSchema).length}c`);
  console.log(`[build] standard prompt=${standard.prompt.length}c`);

  const results: CallResult[] = [];
  const SONNET_IN = 2, SONNET_OUT = 10; // $/M — 인트로가(2026-08-31까지), 공식 정가 $3/$15

  // ── 1·2. Anthropic 직행 ────────────────────────────────────────────────────
  for (const withSchema of [true, false]) {
    const route = `anthropic-direct-${withSchema ? "schema" : "plain"}`;
    try {
      const { ms, value } = await timed(() =>
        fetchJson("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": ANT_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-5",
            max_tokens: 12000,
            thinking: { type: "disabled" },
            system: premium.system,
            messages: [{ role: "user", content: premium.prompt }],
            ...(withSchema ? { output_config: { format: { type: "json_schema", schema: strippedSchema } } } : {}),
          }),
        }),
      );
      if (value.status !== 200) {
        results.push({ route, ok: false, latencyMs: ms, error: `HTTP ${value.status}: ${JSON.stringify(value.body).slice(0, 400)}` });
      } else {
        const u = value.body.usage || {};
        const inTok = u.input_tokens ?? 0, outTok = u.output_tokens ?? 0;
        results.push({
          route, ok: true, latencyMs: ms, provider: "Anthropic(1P)", model: value.body.model,
          inputTokens: inTok, outputTokens: outTok,
          costUsd: (inTok * SONNET_IN + outTok * SONNET_OUT) / 1e6, costSource: "computed@$2/$10(intro)",
          finish: value.body.stop_reason,
        });
      }
    } catch (e) {
      results.push({ route, ok: false, latencyMs: -1, error: e instanceof Error ? e.message : String(e) });
    }
    console.log(`[done] ${route}`, JSON.stringify(results[results.length - 1]));
  }

  // ── 3·4. OpenRouter Claude — Bedrock 고정 vs Anthropic 고정 (schema=prod 형상) ──
  for (const pin of ["amazon-bedrock", "anthropic"] as const) {
    const route = `openrouter-claude-pin:${pin}`;
    try {
      const { ms, value } = await timed(() =>
        fetchJson("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OR_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: "anthropic/claude-sonnet-5",
            max_tokens: 12000,
            messages: [
              { role: "system", content: premium.system },
              { role: "user", content: premium.prompt },
            ],
            response_format: { type: "json_schema", json_schema: { name: "question", strict: true, schema: strippedSchema } },
            reasoning: { enabled: false },
            usage: { include: true },
            provider: { order: [pin], allow_fallbacks: false },
          }),
        }),
      );
      if (value.status !== 200 || value.body?.error) {
        results.push({ route, ok: false, latencyMs: ms, error: `HTTP ${value.status}: ${JSON.stringify(value.body?.error ?? value.body).slice(0, 400)}` });
      } else {
        const u = value.body.usage || {};
        const gen = value.body.id ? await orGeneration(value.body.id, OR_KEY) : null;
        results.push({
          route, ok: true, latencyMs: ms,
          provider: gen?.provider_name ?? "?", model: gen?.model ?? value.body.model,
          inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens,
          normalizedPrompt: gen?.tokens_prompt, nativePrompt: gen?.native_tokens_prompt,
          nativeCompletion: gen?.native_tokens_completion,
          reasoningTokens: gen?.native_tokens_reasoning ?? 0,
          costUsd: gen?.total_cost ?? u.cost, costSource: "openrouter-recorded",
          finish: value.body.choices?.[0]?.finish_reason, genTimeMs: gen?.generation_time,
        });
      }
    } catch (e) {
      results.push({ route, ok: false, latencyMs: -1, error: e instanceof Error ? e.message : String(e) });
    }
    console.log(`[done] ${route}`, JSON.stringify(results[results.length - 1]));
  }

  // ── 5. Gemini 직행 (plain, thinking off 시도) ──────────────────────────────
  {
    const route = "gemini-direct-plain";
    const doCall = (thinkingOff: boolean) =>
      timed(() =>
        fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEM_KEY}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: standard.prompt }] }],
            generationConfig: {
              maxOutputTokens: 12000,
              ...(thinkingOff ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          }),
        }),
      );
    try {
      let { ms, value } = await doCall(true);
      if (value.status === 400 && JSON.stringify(value.body).includes("thinking")) {
        ({ ms, value } = await doCall(false)); // thinkingConfig 미지원 시 폴백
      }
      if (value.status !== 200) {
        results.push({ route, ok: false, latencyMs: ms, error: `HTTP ${value.status}: ${JSON.stringify(value.body).slice(0, 400)}` });
      } else {
        const u = value.body.usageMetadata || {};
        results.push({
          route, ok: true, latencyMs: ms, provider: "Google(1P)", model: value.body.modelVersion,
          inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount,
          reasoningTokens: u.thoughtsTokenCount ?? 0,
          costUsd: undefined, costSource: "unknown-google-list-price",
          finish: value.body.candidates?.[0]?.finishReason,
        });
      }
    } catch (e) {
      results.push({ route, ok: false, latencyMs: -1, error: e instanceof Error ? e.message : String(e) });
    }
    console.log(`[done] ${route}`, JSON.stringify(results[results.length - 1]));
  }

  // ── 6. OpenRouter Gemini (plain) ───────────────────────────────────────────
  {
    const route = "openrouter-gemini-plain";
    try {
      const { ms, value } = await timed(() =>
        fetchJson("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OR_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3.5-flash",
            max_tokens: 12000,
            messages: [{ role: "user", content: standard.prompt }],
            reasoning: { enabled: false, effort: "none", exclude: true },
            usage: { include: true },
          }),
        }),
      );
      if (value.status !== 200 || value.body?.error) {
        results.push({ route, ok: false, latencyMs: ms, error: `HTTP ${value.status}: ${JSON.stringify(value.body?.error ?? value.body).slice(0, 400)}` });
      } else {
        const u = value.body.usage || {};
        const gen = value.body.id ? await orGeneration(value.body.id, OR_KEY) : null;
        results.push({
          route, ok: true, latencyMs: ms,
          provider: gen?.provider_name ?? "?", model: gen?.model ?? value.body.model,
          inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens,
          normalizedPrompt: gen?.tokens_prompt, nativePrompt: gen?.native_tokens_prompt,
          nativeCompletion: gen?.native_tokens_completion,
          reasoningTokens: gen?.native_tokens_reasoning ?? 0,
          costUsd: gen?.total_cost ?? u.cost, costSource: "openrouter-recorded",
          finish: value.body.choices?.[0]?.finish_reason, genTimeMs: gen?.generation_time,
        });
      }
    } catch (e) {
      results.push({ route, ok: false, latencyMs: -1, error: e instanceof Error ? e.message : String(e) });
    }
    console.log(`[done] ${route}`, JSON.stringify(results[results.length - 1]));
  }

  // ── 참고: OpenRouter 표시 단가 (gemini-3.5-flash 직행가 추정용) ─────────────
  try {
    const { body } = await fetchJson("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${OR_KEY}` } });
    for (const slug of ["anthropic/claude-sonnet-5", "google/gemini-3.5-flash"]) {
      const m = body?.data?.find((x: any) => x.id === slug);
      if (m) console.log(`[pricing] ${slug}: prompt=$${Number(m.pricing?.prompt) * 1e6}/M completion=$${Number(m.pricing?.completion) * 1e6}/M`);
    }
  } catch { /* noop */ }

  const outPath = path.join(process.cwd(), "scripts", "_provider-cost-ab-out.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log("\n================= PROVIDER COST A/B (Imagination, prod-identical prompt) =================");
  for (const r of results) {
    console.log(
      `${r.route.padEnd(34)} ok=${r.ok ? "Y" : "N"} ${String(r.provider ?? "").padEnd(16)} in=${String(r.inputTokens ?? "-").padStart(6)} out=${String(r.outputTokens ?? "-").padStart(5)} native_in=${String(r.nativePrompt ?? "-").padStart(6)} cost=$${r.costUsd !== undefined ? r.costUsd.toFixed(5) : "?"} lat=${r.latencyMs}ms gen=${r.genTimeMs ?? "-"}ms fin=${r.finish ?? "-"}${r.error ? ` ERR=${r.error}` : ""}`,
    );
  }
  console.log(`saved: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
