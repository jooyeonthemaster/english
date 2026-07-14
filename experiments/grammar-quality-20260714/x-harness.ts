/**
 * 어법(GRAMMAR_ERROR) "완전히 다른 접근" 나란히 실측 하니스 (작성: Fable, 26-07-14)
 *
 * corpus-30.json 앞 10개 지문(스크리닝 고정 서브셋, 난이도 i%3 배정)에 대해
 * x-strategies.ts 의 전략 13종을 실측한다. 각 전략의 산출물은 prod 후처리
 * (processGrammarError)로 passageWithMarkers 를 재구성하고 validateQuestionQuality
 * 로 계량한 뒤, 기존 라운드 하니스와 같은 레코드 형태로 남긴다 — make-packets.mjs
 * 가 그대로 읽을 수 있다:
 *   node experiments/grammar-quality-20260714/make-packets.mjs x/s3-minimal
 *
 * 실행: NODE_OPTIONS="" npx tsx experiments/grammar-quality-20260714/x-harness.ts <strategyId|all> [--limit N]
 *   예) ... x-harness.ts s3-minimal
 *       ... x-harness.ts s9 --limit 2
 *       ... x-harness.ts all
 * 결과: experiments/grammar-quality-20260714/x/<strategyId>/results.jsonl (+ summary.json)
 *
 * ⚠️ 생성 모듈은 loadEnvConfig() '후' 동적 import (정적이면 API 키 빈 값 → 401).
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import {
  STRATEGIES,
  type CallLog,
  type Difficulty,
  type FinalizeResult,
  type PassageItem,
  type Strategy,
  type Toolkit,
} from "./x-strategies";

const DIR = path.join(process.cwd(), "experiments", "grammar-quality-20260714");
const OUT_ROOT = path.join(DIR, "x");
const FEWSHOT_PASSAGE_ID = "ebsi_go3_20151013-q19";
const SCREEN_COUNT = 10; // 스크리닝 고정 서브셋: corpus-30 앞 10개
const DIFFS: Difficulty[] = ["INTERMEDIATE", "ADVANCED", "KILLER"];
const CONC = 3;

// ── CLI ────────────────────────────────────────────────────────────────────

const argStrategy = process.argv[2];
const limitIdx = process.argv.indexOf("--limit");
const LIMIT = (() => {
  if (limitIdx === -1) return SCREEN_COUNT;
  const n = Number(process.argv[limitIdx + 1]);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 30) : SCREEN_COUNT;
})();

function usageAndExit(): never {
  console.error(
    [
      'usage: NODE_OPTIONS="" npx tsx experiments/grammar-quality-20260714/x-harness.ts <strategyId|all> [--limit N]',
      "strategies:",
      ...STRATEGIES.map((s) => `  ${s.id.padEnd(20)} [${s.callPlan}] ${s.describe}`),
    ].join("\n"),
  );
  process.exit(1);
}

if (!argStrategy) usageAndExit();

function resolveStrategies(arg: string): Strategy[] {
  if (arg === "all") return STRATEGIES;
  const norm = arg.toLowerCase();
  const hits = STRATEGIES.filter(
    (s) =>
      s.id === norm ||
      s.id.startsWith(`${norm}-`) ||
      s.id.split("-")[0] === norm ||
      // 접두 sN- 를 뗀 별칭 허용: "minimal" → "s3-minimal", "fewshot-a" → "s2-fewshot-a"
      s.id.replace(/^s\d+-/, "") === norm,
  );
  if (hits.length === 0) {
    console.error(`unknown strategy: ${arg}`);
    usageAndExit();
  }
  return hits;
}

// ── 위치 계량 (라운드 하니스와 동일 — 분석기 호환) ──────────────────────────

function splitSentences(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const re = /[^.!?]+[.!?]+(?:["')\]]+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length });
  if (out.length === 0) out.push({ start: 0, end: text.length });
  return out;
}

function positionMetrics(
  passage: string,
  expressions: { label: string; expression: string; isError: boolean }[],
) {
  const sentences = splitSentences(passage);
  const total = passage.length;
  let cursor = 0;
  const placed = expressions.map((e) => {
    let idx = passage.indexOf(e.expression, cursor);
    if (idx === -1) idx = passage.indexOf(e.expression);
    if (idx >= 0) cursor = idx + e.expression.length;
    const sentIdx = idx >= 0 ? sentences.findIndex((s) => idx >= s.start && idx < s.end) : -1;
    return {
      label: e.label,
      isError: e.isError,
      charPos: idx,
      relPos: idx >= 0 ? Number((idx / total).toFixed(3)) : null,
      sentenceIndex: sentIdx,
      found: idx >= 0,
    };
  });
  const rels = placed.filter((p) => p.relPos !== null).map((p) => p.relPos as number);
  const sentIdxs = [...new Set(placed.filter((p) => p.sentenceIndex >= 0).map((p) => p.sentenceIndex))];
  return {
    markers: placed,
    sentenceCount: sentences.length,
    distinctSentences: sentIdxs.length,
    lastMarkerRelPos: rels.length ? Math.max(...rels) : null,
    firstHalfShare: rels.length
      ? Number((rels.filter((r) => r < 0.5).length / rels.length).toFixed(2))
      : null,
    notFoundCount: placed.filter((p) => !p.found).length,
  };
}

// ── 비용 계량 ───────────────────────────────────────────────────────────────

// 폴백 추정 단가($/M tokens) — OpenRouter usage.cost(실측)가 없을 때만 사용.
const PRICE_PER_M: Record<string, { in: number; out: number }> = {
  "google/gemini-3.5-flash": { in: 0.3, out: 2.5 },
  "google/gemini-3.5-pro": { in: 1.25, out: 10 },
  "anthropic/claude-sonnet-5": { in: 2, out: 10 }, // 인트로가(~26-08-31), 이후 $3/$15
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function sumCost(calls: CallLog[]): number | null {
  const vals = calls.map((c) => c.costUsd).filter((v): v is number => typeof v === "number");
  if (!vals.length) return null;
  return Number(vals.reduce((a, b) => a + b, 0).toFixed(6));
}

function costSourceOf(calls: CallLog[]): string {
  if (!calls.length) return "none";
  const sources = new Set(calls.map((c) => c.costSource));
  return sources.size === 1 ? [...sources][0] : "mixed";
}

// ── 마커 재구성 폴백 (prod 후처리 실패 시에만) ──────────────────────────────
// markedExpressions 의 expression 을 지문에서 순서 보존 탐색해 "__(A) 표기__"
// (렌더러 계약: __([^_]+)__ → ^\(([A-J])\)\s*(.+)$)로 결정론 재구성한다.

function plantMarkersFallback(
  passage: string,
  aiQuestion: Record<string, unknown>,
): Record<string, unknown> | null {
  const mes = Array.isArray(aiQuestion.markedExpressions)
    ? (aiQuestion.markedExpressions as Record<string, unknown>[])
    : [];
  if (!mes.length) return null;
  const repl: { idx: number; len: number; text: string }[] = [];
  let cursor = 0;
  for (const me of mes) {
    const source = String(me.expression ?? me.correction ?? me.errorExpression ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!source) continue;
    let idx = passage.indexOf(source, cursor);
    if (idx === -1) idx = passage.indexOf(source);
    if (idx === -1) continue;
    cursor = idx + source.length;
    const surface =
      me.isError === true ? String(me.errorExpression ?? source).trim() || source : source;
    repl.push({ idx, len: source.length, text: `__${String(me.label ?? "")} ${surface}__` });
  }
  if (!repl.length) return null;
  let out = passage;
  for (const r of [...repl].sort((a, b) => b.idx - a.idx)) {
    out = out.slice(0, r.idx) + r.text + out.slice(r.idx + r.len);
  }
  const { errorDesign: _errorDesign, ...rest } = aiQuestion as Record<string, unknown> & {
    errorDesign?: unknown;
  };
  void _errorDesign;
  return { ...rest, passageWithMarkers: out };
}

// ── 메인 ────────────────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;

async function main() {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ATLASCLOUD_API_KEY) {
    throw new Error("OPENROUTER_API_KEY (or ATLASCLOUD_API_KEY) required");
  }

  // src 모듈은 전부 여기서 동적 import (env 로드 후).
  const genLLM = await import("../../src/lib/question-generation-llm");
  const atlasAi = await import("../../src/lib/atlas-ai");
  const schemasMc = await import("../../src/lib/question-ai-schemas-mc");
  const quality = await import("../../src/lib/question-quality");
  const grammarCand = await import("../../src/lib/question-quality/candidate-blocks/grammar");
  const postMod = await import("../../src/lib/question-postprocess");
  const constMod = await import(
    "../../src/app/api/ai/generate-questions-auto/_lib/constants"
  );
  const aiSdk = await import("ai");

  const DIFF_DESCRIPTION = constMod.DIFF_DESCRIPTION as Record<string, string>;
  const DIFF_TEXT: Record<Difficulty, string> = {
    INTERMEDIATE:
      DIFF_DESCRIPTION.INTERMEDIATE ?? "중급 — 모의고사 중위권 수준, 추론 필요",
    // DIFF_DESCRIPTION 에 ADVANCED 항목이 없다(라운드 하니스도 폴백 사용).
    ADVANCED:
      "상급 — 수능 1~2등급 경계 수준, 절 경계·수식어 건너뛰기 같은 구조 파악이 필요한 견고한 실전 문항",
    KILLER:
      DIFF_DESCRIPTION.KILLER ??
      "킬러 — 수능 1등급 컷 수준, 장거리 의존 판단과 매력적인 오답",
  };

  // 스키마: 기존 GRAMMAR_ERROR AI 응답 스키마 재사용 — 밑줄 정확히 5개·정답 1개.
  const schema5 = schemasMc.buildAiGrammarErrorSchema(5, 1) as z.ZodObject<z.ZodRawShape>;
  let schema5JsonText = "";
  try {
    schema5JsonText = JSON.stringify(z.toJSONSchema(schema5 as never));
  } catch {
    schema5JsonText = "(schema serialization unavailable — 프롬프트 필드 서술을 따릅니다)";
  }

  // ── S2 재료: 검증 A등급 실물 2개 로드 ──────────────────────────────────────
  function loadFewshot(): Toolkit["fewshot"] {
    const loadRec = (round: string): Rec | null => {
      const file = path.join(DIR, round, "results.jsonl");
      if (!fs.existsSync(file)) return null;
      const rows = fs
        .readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Rec);
      return (
        rows.find(
          (r) => r.passageId === FEWSHOT_PASSAGE_ID && r.ok === true && !!r.question,
        ) ?? null
      );
    };
    const r6 = loadRec("round-6");
    const r4 = loadRec("round-4");
    if (!r6 || !r4) return null;
    const fmt = (tag: string, rec: Rec): string => {
      const q = rec.question as Rec;
      const mes = (q.markedExpressions as Rec[]) ?? [];
      const lines = mes
        .map((m) => {
          const surface =
            m.isError === true ? String(m.errorExpression ?? m.expression) : String(m.expression);
          return `${m.label} ${surface} — pointCode (${m.pointCode})${
            m.isError === true
              ? ` [정답: 비문 — 원형 "${String(m.correction ?? m.expression)}"]`
              : " [미끼: 원문 그대로]"
          }`;
        })
        .join("\n");
      const keyPoints = Array.isArray(q.keyPoints) ? (q.keyPoints as string[]) : [];
      const basis = keyPoints[0] ?? String(q.explanation ?? "").slice(0, 120);
      return [
        `### 모범 예시 ${tag} — 검증 A등급 실물`,
        `발문: ${String(q.direction ?? "")}`,
        "지문(밑줄 심긴 상태):",
        String(q.passageWithMarkers ?? ""),
        "",
        "밑줄 5개:",
        lines,
        `정답: ${String(q.correctAnswer ?? "")}`,
        `한줄 근거: ${basis}`,
      ].join("\n");
    };
    return {
      examples: [fmt("① (round-6)", r6), fmt("② (round-4)", r4)].join("\n\n"),
      sourcePassageId: FEWSHOT_PASSAGE_ID,
    };
  }
  const fewshot = loadFewshot();
  if (!fewshot) {
    console.warn(
      `[x-harness] fewshot 재료(round-4/round-6 의 ${FEWSHOT_PASSAGE_ID}) 미발견 — s2-fewshot-a 는 실패로 기록됩니다.`,
    );
  }

  // ── finalize: prod 후처리 + 품질 검증 + 위치 계량 ──────────────────────────
  function finalize(
    passage: string,
    aiQuestion: Record<string, unknown>,
    difficulty: Difficulty,
  ): FinalizeResult {
    let question: Record<string, unknown> | undefined;
    let postProcess: "pipeline" | "fallback-mini" | null = null;
    let ppError: string | undefined;
    try {
      const pp = postMod.postProcessQuestion("GRAMMAR_ERROR", passage, aiQuestion as never);
      if (pp.success && (pp.data as Rec)?.passageWithMarkers) {
        question = pp.data as Record<string, unknown>;
        postProcess = "pipeline";
      } else {
        ppError = pp.error;
      }
    } catch (e) {
      ppError = e instanceof Error ? e.message : String(e);
    }
    if (!question) {
      const fb = plantMarkersFallback(passage, aiQuestion);
      if (fb) {
        question = fb;
        postProcess = "fallback-mini";
      }
    }
    if (!question) {
      return {
        ok: false,
        error: ppError ?? "post-process failed (no marker located)",
        errors: [],
        warnings: [],
        answerRelPos: null,
        postProcess: null,
      };
    }
    let errors: string[] = [];
    let warnings: string[] = [];
    try {
      const issues = quality.validateQuestionQuality({
        typeId: "GRAMMAR_ERROR",
        question,
        passage,
        requestedDifficulty: difficulty,
        grammarMarkerCount: 5,
        grammarAnswerCount: 1,
      }) as { severity: string; code: string }[];
      errors = issues.filter((i) => i.severity === "error").map((i) => i.code);
      warnings = issues.filter((i) => i.severity === "warning").map((i) => i.code);
    } catch (e) {
      warnings = [`validator-crashed:${e instanceof Error ? e.message : String(e)}`];
    }
    const me = Array.isArray(question.markedExpressions)
      ? (question.markedExpressions as { label: string; expression: string; isError: boolean }[])
      : [];
    const positions = me.length ? positionMetrics(passage, me) : null;
    const answerMarker = positions?.markers.find((m) => m.isError);
    return {
      ok: true,
      question,
      errors,
      warnings,
      answerRelPos: answerMarker?.relPos ?? null,
      postProcess,
      positions,
    };
  }

  // ── Toolkit (호출 계량 포함, 생성 1건당 새로 발급) ──────────────────────────
  function makeToolkit(calls: CallLog[]): Toolkit {
    const logCall = (
      purpose: string,
      modelId: string,
      attempts: number,
      ms: number,
      usage: unknown,
    ) => {
      const normalizedModel = atlasAi.normalizeAtlasModelId(modelId);
      const u = (usage && typeof usage === "object" ? usage : {}) as Rec;
      const inputTokens = num(u.inputTokens) ?? num(u.promptTokens);
      const outputTokens = num(u.outputTokens) ?? num(u.completionTokens);
      let costUsd = num(u.costUsd);
      let costSource = "openrouter-recorded";
      if (costUsd === null) {
        const price = PRICE_PER_M[normalizedModel];
        if (price && inputTokens !== null && outputTokens !== null) {
          costUsd = Number(
            ((inputTokens * price.in + outputTokens * price.out) / 1e6).toFixed(6),
          );
          costSource = "estimated-list-price";
        } else {
          costSource = "unknown";
        }
      }
      calls.push({
        purpose,
        modelId: normalizedModel,
        ms,
        attempts,
        inputTokens,
        outputTokens,
        costUsd,
        costSource,
      });
    };

    return {
      schema5,
      schema5JsonText,
      fewshot,
      providerName: atlasAi.ATLAS_CLOUD_PROVIDER,
      standardModelId: atlasAi.ATLAS_STANDARD_MODEL_ID,
      calls,
      diffText: (d) => DIFF_TEXT[d],

      async standardObject({ schema, prompt, system, purpose, maxTokens = 12_000 }) {
        const res = await genLLM.generateQuestionObject({
          schema: schema as never,
          prompt,
          system,
          generationPlan: "STANDARD",
          logPrefix: `XH-${purpose}`,
          maxRetries: 2,
          maxTokens,
          timeoutMs: 300_000,
        });
        logCall(purpose, res.modelId, res.attempts, res.durationMs, res.usage);
        return res.object as Record<string, unknown>;
      },

      async standardText({ prompt, purpose, maxTokens = 4_000 }) {
        const res = await genLLM.generateQuestionText({
          prompt,
          generationPlan: "STANDARD",
          logPrefix: `XH-${purpose}`,
          maxRetries: 2,
          maxTokens,
          timeoutMs: 300_000,
        });
        logCall(purpose, res.modelId, res.attempts, res.durationMs, res.usage);
        return res.text;
      },

      async directObject({
        modelId,
        schema,
        prompt,
        purpose,
        maxTokens = 12_000,
        providerOptions,
        timeoutMs = 300_000,
      }) {
        const started = Date.now();
        try {
          // 타입 전용 캐스트(런타임 무변경): schema as never 가 generateObject
          // 오버로드 해석을 no-schema 시그니처로 떨어뜨려 'schema' 초과 속성
          // 오류가 났다 — 인자 전체를 캐스트해 오버로드 검사만 우회한다.
          const res = (await aiSdk.generateObject({
            model: atlasAi.atlasChatModel(modelId),
            schema: schema as never,
            prompt,
            maxOutputTokens: maxTokens,
            ...(providerOptions ? { providerOptions: providerOptions as never } : {}),
            abortSignal: AbortSignal.timeout(timeoutMs),
          } as never)) as { object: unknown; usage?: unknown; providerMetadata?: unknown };
          logCall(purpose, modelId, 1, Date.now() - started, atlasAi.atlasUsageWithCost(res));
          return res.object as Record<string, unknown>;
        } catch (e) {
          logCall(`${purpose}#failed`, modelId, 1, Date.now() - started, undefined);
          throw e;
        }
      },

      async directText({
        modelId,
        prompt,
        purpose,
        maxTokens = 12_000,
        providerOptions,
        timeoutMs = 300_000,
      }) {
        const started = Date.now();
        try {
          const res = await aiSdk.generateText({
            model: atlasAi.atlasChatModel(modelId),
            prompt,
            maxOutputTokens: maxTokens,
            ...(providerOptions ? { providerOptions: providerOptions as never } : {}),
            abortSignal: AbortSignal.timeout(timeoutMs),
          });
          logCall(purpose, modelId, 1, Date.now() - started, atlasAi.atlasUsageWithCost(res));
          return res.text;
        } catch (e) {
          logCall(`${purpose}#failed`, modelId, 1, Date.now() - started, undefined);
          throw e;
        }
      },

      parseToSchema5(text) {
        const candidate = genLLM.parseJsonLoose(text);
        if (candidate === undefined) return undefined;
        const parsed = genLLM.safeParsePromotingNullOptionals(schema5 as never, candidate);
        return parsed.success ? (parsed.data as Record<string, unknown>) : undefined;
      },

      finalize,

      grammarCandidates(passage, difficulty) {
        return grammarCand.selectUsableGrammarCandidates(passage, difficulty)
          .candidates as never;
      },

      grammarCandidateBlock(passage, difficulty) {
        return quality.buildQuestionTargetCandidateBlock("GRAMMAR_ERROR", passage, {
          grammarMarkerCount: 5,
          grammarAnswerCount: 1,
          requestedDifficulty: difficulty,
          diversityEnabled: false,
        });
      },
    };
  }

  // ── 코퍼스: 앞 10개 고정 서브셋, 난이도 i%3 ────────────────────────────────
  type Corpus = { id: string; year: number; exam: string; type: string; words: number; text: string };
  const corpus: Corpus[] = JSON.parse(fs.readFileSync(path.join(DIR, "corpus-30.json"), "utf8"));
  const items: PassageItem[] = corpus
    .slice(0, LIMIT)
    .map((p, i) => ({ ...p, difficulty: DIFFS[i % 3] }))
    .slice(0, LIMIT);

  const strategies = resolveStrategies(argStrategy);
  console.log(
    `[x-harness] strategies=${strategies.map((s) => s.id).join(",")} passages=${items.length} (screen subset=${SCREEN_COUNT}, conc=${CONC})`,
  );

  if (items.length === 0) {
    // --limit 0: LLM 무호출 초기화 게이트 — 동적 import·스키마·fewshot 로드까지만 검증.
    console.log(
      `[x-harness] dry init OK — schema5JsonText=${schema5JsonText.length}c, fewshot=${fewshot ? "loaded" : "MISSING"}, standardModel=${atlasAi.ATLAS_STANDARD_MODEL_ID}`,
    );
    return;
  }

  const allSummaries: Rec[] = [];

  for (const strategy of strategies) {
    const outDir = path.join(OUT_ROOT, strategy.id);
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, "results.jsonl");
    fs.writeFileSync(outFile, "");
    console.log(`\n[x-harness] ── ${strategy.id} (${strategy.callPlan}) ──`);

    const results: Rec[] = new Array(items.length);
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONC, items.length) }, async () => {
        while (cursor < items.length) {
          const my = cursor++;
          const p = items[my];
          const calls: CallLog[] = [];
          const toolkit = makeToolkit(calls);
          const started = Date.now();
          let rec: Rec;
          try {
            const out = await strategy.generate(toolkit, p);
            const fin = finalize(p.text, out.aiQuestion, p.difficulty);
            const q = fin.question ?? null;
            const me =
              q && Array.isArray(q.markedExpressions)
                ? (q.markedExpressions as Rec[])
                : [];
            rec = {
              passageId: p.id,
              meta: { year: p.year, exam: p.exam, origType: p.type, words: p.words },
              difficulty: p.difficulty,
              strategy: strategy.id,
              ok: fin.ok,
              ms: Date.now() - started,
              attempts: calls.reduce((s, c) => s + c.attempts, 0),
              calls: calls.length,
              callLog: calls,
              models: [...new Set(calls.map((c) => c.modelId))],
              costUsd: sumCost(calls),
              costSource: costSourceOf(calls),
              relaxedFallback: false,
              qualityMode: null,
              errors: fin.errors,
              warnings: fin.warnings,
              topReject: [],
              layout: me
                .map((m) => `${m.label}:${m.isError === true ? "ANS" : "dec"}=${m.pointCode ?? "?"}`)
                .join("  "),
              positions: fin.positions ?? null,
              answerRelPos: fin.answerRelPos,
              postProcess: fin.postProcess,
              strategyMeta: out.meta ?? null,
              ...(fin.ok ? {} : { error: fin.error }),
              question: q,
              passageText: p.text,
            };
          } catch (e) {
            rec = {
              passageId: p.id,
              meta: { year: p.year, exam: p.exam, origType: p.type, words: p.words },
              difficulty: p.difficulty,
              strategy: strategy.id,
              ok: false,
              ms: Date.now() - started,
              attempts: calls.reduce((s, c) => s + c.attempts, 0),
              calls: calls.length,
              callLog: calls,
              models: [...new Set(calls.map((c) => c.modelId))],
              costUsd: sumCost(calls),
              costSource: costSourceOf(calls),
              relaxedFallback: false,
              errors: [],
              warnings: [],
              topReject: [],
              error: e instanceof Error ? e.message : String(e),
              question: null,
              passageText: p.text,
            };
          }
          results[my] = rec;
          fs.appendFileSync(outFile, JSON.stringify(rec) + "\n");
          console.log(
            `[x-harness] ${strategy.id} ${my + 1}/${items.length} ${p.id.slice(0, 22)} ${p.difficulty} ok=${rec.ok} calls=${rec.calls} err=${(rec.errors as string[]).length} cost=$${rec.costUsd ?? "?"} ansPos=${rec.answerRelPos ?? "-"}`,
          );
        }
      }),
    );

    // 결정 산출물: 코퍼스 순서로 재기록 (append 는 완료 순서라 순서가 흔들린다).
    fs.writeFileSync(outFile, results.map((r) => JSON.stringify(r)).join("\n") + "\n");

    const summary = buildSummary(strategy, results);
    fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(`[x-harness] ${strategy.id} summary:`, JSON.stringify(summary, null, 2));
    allSummaries.push(summary);
  }

  if (allSummaries.length > 1) {
    console.log("\n================= 전략 비교표 =================");
    console.log(
      "strategy".padEnd(22) +
        "ok".padStart(5) +
        "err0".padStart(6) +
        "avgErr".padStart(8) +
        "avgMs".padStart(9) +
        "avgCalls".padStart(9) +
        "avg$".padStart(10) +
        "ansPos".padStart(8),
    );
    for (const s of allSummaries) {
      console.log(
        String(s.strategy).padEnd(22) +
          `${s.ok}/${s.total}`.padStart(5) +
          String(s.zeroErrorItems ?? "-").padStart(6) +
          String(s.avgErrorCount ?? "-").padStart(8) +
          String(s.avgMs ?? "-").padStart(9) +
          String(s.avgCalls ?? "-").padStart(9) +
          String(s.avgCostUsd ?? "-").padStart(10) +
          String(s.avgAnswerRelPos ?? "-").padStart(8),
      );
    }
  }
}

function buildSummary(strategy: Strategy, results: Rec[]): Rec {
  const oks = results.filter((r) => r.ok === true);
  const avg = (xs: number[], digits = 2): number | null =>
    xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(digits)) : null;
  const nums = (pickFn: (r: Rec) => unknown, pool: Rec[] = oks): number[] =>
    pool.map(pickFn).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const allCalls = results.flatMap((r) => (Array.isArray(r.callLog) ? (r.callLog as CallLog[]) : []));
  const modelCounts: Record<string, number> = {};
  for (const c of allCalls) modelCounts[c.modelId] = (modelCounts[c.modelId] ?? 0) + 1;
  return {
    strategy: strategy.id,
    describe: strategy.describe,
    callPlan: strategy.callPlan,
    total: results.length,
    ok: oks.length,
    failed: results.length - oks.length,
    avgMs: avg(nums((r) => r.ms, results), 0),
    avgAttempts: avg(nums((r) => r.attempts, results)),
    avgCalls: avg(nums((r) => r.calls, results)),
    totalCostUsd: (() => {
      const v = nums((r) => r.costUsd, results);
      return v.length ? Number(v.reduce((a, b) => a + b, 0).toFixed(5)) : null;
    })(),
    avgCostUsd: avg(nums((r) => r.costUsd, results), 5),
    costRecordedCalls: allCalls.filter((c) => c.costSource === "openrouter-recorded").length,
    costEstimatedCalls: allCalls.filter((c) => c.costSource === "estimated-list-price").length,
    costUnknownCalls: allCalls.filter((c) => c.costSource === "unknown").length,
    avgErrorCount: avg(nums((r) => (Array.isArray(r.errors) ? (r.errors as string[]).length : null))),
    zeroErrorItems: oks.filter((r) => Array.isArray(r.errors) && (r.errors as string[]).length === 0)
      .length,
    postProcessFallbacks: oks.filter((r) => r.postProcess === "fallback-mini").length,
    avgLastMarkerRelPos: avg(
      nums((r) => (r.positions as { lastMarkerRelPos?: number | null } | null)?.lastMarkerRelPos),
      3,
    ),
    avgAnswerRelPos: avg(nums((r) => r.answerRelPos), 3),
    answerRelPosInBand: oks.filter(
      (r) => typeof r.answerRelPos === "number" && r.answerRelPos >= 0.2 && r.answerRelPos <= 0.85,
    ).length,
    models: modelCounts,
    byDifficulty: DIFFS.map((d) => {
      const g = results.filter((r) => r.difficulty === d);
      return {
        difficulty: d,
        n: g.length,
        ok: g.filter((r) => r.ok === true).length,
        zeroError: g.filter(
          (r) => r.ok === true && Array.isArray(r.errors) && (r.errors as string[]).length === 0,
        ).length,
      };
    }),
  };
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
