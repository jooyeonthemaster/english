/**
 * 임시 진단 스크립트(_prefix) — 일반(Gemini) 경로의 strict json_schema 오버헤드 실측.
 *
 * 같은 지문(Imagination)·같은 prod STANDARD 프롬프트로 OpenRouter gemini-3.5-flash 에
 *   1) plain (형식 강제 없음)
 *   2) schema (response_format json_schema strict = prod 형상)
 * 2콜을 쏘고 native 청구 토큰·원가·지연을 대조한다.
 * (프리미엄 Claude 실측: 스키마 부착 시 +8,235tok/+20%/지연 3배 — 같은 현상이 Gemini 에도 있는지 확인)
 *
 * 주의: OR gemini-3.5-flash 는 reasoning disable 형상을 400 거부하므로 reasoning 필드 자체를 생략한다.
 * 실행: NODE_OPTIONS="" npx tsx scripts/_gemini-schema-ab.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";

const IMAGINATION = `Imagination continues to function when perception is not actively discerning objects, in cases of emotion, disease, and sleep. Emotions dispose one to see the world in a distorted way. A coward's perceptual disposition is affected by his disposition to experience fear. A lover's expectations are affected by desire. In such cases, a small similarity between a perceived object and the thing one expects to see can lead to the misidentification of the perceived object as that thing. The coward sees the enemy, while the lover sees the object of desire everywhere. The more affected one is, the less similarity is required for the thing to appear. While the central organ of sense normally functions by comparing similarities and differences, emotions dispose one to discern objects inaccurately. The greater the emotional investment, the more biased one's perception.`;

const GRAMMAR_ERROR_FINAL_CHECKLIST = `## 출력 직전 최종 자기검증 (하나라도 위반 시 해당 부분을 고치고 나서 JSON을 출력)
1. 정답 밑줄: 오류형(errorExpression)이 지문에 실제로 심어져 있고, correction 은 원문 그대로인가? (오류를 심지 않으면 무효)
2. 정답 포인트: pointCode 가 a~i,k(핵심 10) 중 하나이고, KILLER 라면 인접 주어-동사처럼 한눈에 보이는 자리가 아닌가?
3. 미끼 밑줄 전부: only/given/does/지시사 that 같은 장식 필러가 아니라 구조적으로 의미 있는 문법 자리인가?
4. KILLER: 어떤 미끼도 정답과 같은 pointCode 를 쓰지 않는가?
5. 모든 expression/correction 이 지문 원문에 한 글자도 다르지 않게 실재하는가? (잘린 표현·창작 표현 무효)
6. 명사 뒤에 what 을 넣는 변형을 정답으로 쓰지 않았는가? (한눈에 비문 = 반려됨)
7. keyPoints 3개가 각각 실제 밑줄 라벨로 시작하고 1번이 정답 라벨인가?`;

async function buildStandard() {
  const { z } = await import("zod");
  const { STRUCTURED_TYPE_PROMPTS } = await import("../src/lib/question-schemas");
  const { getTypeQualityRubric, buildQuestionTargetCandidateBlock } = await import("../src/lib/question-quality");
  const {
    buildQuestionTypeSettingsPrompt,
    readQuestionTypeDifficultySetting,
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

  const effectiveDiffLabel = readQuestionTypeDifficultySetting(rawTypeSettings, "KILLER");
  const effectiveDiffInstruction = (DIFF_DESCRIPTION as Record<string, string>)[effectiveDiffLabel] || "top-tier exam item requiring precise passage evidence";
  const typePrompt = (STRUCTURED_TYPE_PROMPTS as Record<string, string>)[subType]!;
  const typeQualityRubric = getTypeQualityRubric(subType, effectiveDiffLabel);
  const resolved = resolveQuestionTypeGenerationSettings(subType, rawTypeSettings, effectiveDiffLabel) as Record<string, any>;
  const g = Math.min(10, (resolved.grammarMarkerCount ?? 5) + 1); // G=K+1
  const generationTypeSettings = { ...(isRecord(resolved.effectiveTypeSettings) ? resolved.effectiveTypeSettings : {}), markerCount: g };
  const typeSettingsPrompt = buildQuestionTypeSettingsPrompt(subType, generationTypeSettings, effectiveDiffLabel);
  const diversityPromptBlock = buildDiversityPromptBlock(subType, { usedTargets: [], usedAnswerLabels: [], usedPointCodes: [] }, 4, {
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
    generationPlan: "STANDARD",
    subType,
    finalChecklist: GRAMMAR_ERROR_FINAL_CHECKLIST,
    customPrompt: mergedCustomPrompt,
  });
  return { system, prompt, jsonSchema };
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
  if (!OR_KEY) throw new Error("missing OPENROUTER_API_KEY");

  const { system, prompt, jsonSchema } = await buildStandard();
  console.log(`[build] standard system=${system?.length ?? 0}c prompt=${prompt.length}c schema=${JSON.stringify(jsonSchema).length}c`);

  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt },
  ];

  const results: any[] = [];
  for (const withSchema of [false, true]) {
    const route = `or-gemini-${withSchema ? "schema" : "plain"}`;
    const t0 = Date.now();
    try {
      const { status, body } = await fetchJson("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3.5-flash",
          messages,
          max_tokens: 12000,
          usage: { include: true },
          // reasoning 필드 생략 필수 — disable 형상은 400 "Reasoning is mandatory"
          ...(withSchema
            ? { response_format: { type: "json_schema", json_schema: { name: "question", strict: true, schema: jsonSchema } } }
            : {}),
        }),
      });
      const ms = Date.now() - t0;
      if (status !== 200) {
        results.push({ route, ok: false, latencyMs: ms, error: `HTTP ${status}: ${JSON.stringify(body?.error ?? body).slice(0, 400)}` });
      } else {
        const u = body.usage ?? {};
        const gen = body.id ? await orGeneration(body.id, OR_KEY) : null;
        results.push({
          route, ok: true, latencyMs: ms,
          provider: gen?.provider_name, model: body.model,
          inputTokens: gen?.native_tokens_prompt ?? u.prompt_tokens,
          outputTokens: gen?.native_tokens_completion ?? u.completion_tokens,
          reasoningTokens: gen?.native_tokens_reasoning ?? u.completion_tokens_details?.reasoning_tokens ?? 0,
          normalizedPrompt: gen?.tokens_prompt,
          nativePrompt: gen?.native_tokens_prompt,
          costUsd: gen?.total_cost ?? u.cost,
          costSource: gen ? "openrouter-recorded" : "usage-field",
          finish: body.choices?.[0]?.finish_reason,
          genTimeMs: gen?.generation_time,
        });
      }
    } catch (e) {
      results.push({ route, ok: false, latencyMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
    }
    console.log(`[done] ${route}`, JSON.stringify(results[results.length - 1]));
  }

  console.log("\n================= GEMINI SCHEMA A/B (STANDARD prod prompt) =================");
  for (const r of results) {
    console.log(
      `${r.route.padEnd(18)} ok=${r.ok ? "Y" : "N"} in=${String(r.inputTokens ?? "-").padStart(6)} out=${String(r.outputTokens ?? "-").padStart(5)} think=${String(r.reasoningTokens ?? "-").padStart(5)} cost=$${r.costUsd !== undefined ? Number(r.costUsd).toFixed(5) : "?"} lat=${r.latencyMs}ms gen=${r.genTimeMs ?? "-"}ms fin=${r.finish ?? "-"}${r.error ? ` ERR=${r.error}` : ""}`,
    );
  }
  const outPath = path.join(process.cwd(), "scripts", "_gemini-schema-ab-out.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`saved: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
