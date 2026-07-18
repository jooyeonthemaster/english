/**
 * 캠페인 20260716 live 러너 — 프로덕션 동일 코어(runQuestionGeneration)를
 * 연구 런타임(single-dispatch, cardinality 1, provider 고정) 아래에서 실행한다.
 *
 * 예산: budget-ledger.json(full-question candidate 1,000 하드캡).
 *   slot 소비 = purpose==="candidate" 스테이지 콜(생성 경계 진입) — 실패해도 미환불.
 *   design/evaluation 콜은 slot 미소비, 콜·토큰·비용은 전부 기록.
 *
 * 실행: NODE_OPTIONS="" node_modules/.bin/tsx runs/campaign-20260716/runner.ts --spec <spec.json> [--dry]
 * spec: { batchId, phase, note?, assignments: [{ itemId, frameId, subType, difficulty, plan, profile?, armId }] }
 */
import { loadEnvConfig } from "@next/env";
process.env.NEXT_PUBLIC_SHOW_MODEL_SELECTOR = "true"; // PREMIUM 클램프 우회 (동적 import 전)
loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

const ROOT = process.cwd();
const CAMPAIGN_DIR = path.join(ROOT, "experiments", "question-quality-20260715", "runs", "campaign-20260716");
const LEDGER_PATH = path.join(ROOT, "experiments", "question-quality-20260715", "budget-ledger.json");
const CORPUS_PATH = path.join(CAMPAIGN_DIR, "private", "corpus-joined.private.json");

interface Assignment {
  itemId: string;
  frameId: string;
  subType: "GRAMMAR_ERROR" | "BLANK_INFERENCE" | string;
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER" | string;
  plan: "STANDARD" | "PREMIUM";
  profile?: string | null; // G0..G4 / B0..B3 연구 프롬프트 프로필 (null=현행 프로덕션 surface)
  armId: string;
  /** true = 프로덕션 외곽 사다리(runQuestionGenerationWithEmptyRetry: strict 다회
   * →rescue→relaxed→scarce/salvage)까지 포함한 풀 깔때기 실행. profile 과 병용 불가. */
  funnel?: boolean;
}
interface Spec {
  batchId: string;
  phase: string;
  note?: string;
  concurrency?: number;
  /** Gemini reasoning effort — 기본 "low"(현재 작동 프로덕션의 실효 설정, O147). */
  geminiReasoningEffort?: string;
  /** 연구 라우팅: "none"=provider 블록 생략(프로덕션 동일 자유 라우팅), JSON 문자열=커스텀, 미설정=vertex/global 고정. */
  providerRouting?: string;
  /** 배치 전용 추가 env (예: EXPLANATION_VERIFY_GATE_MODE) — 동적 import 전에 주입. */
  env?: Record<string, string>;
  assignments: Assignment[];
}

interface CallRecord {
  itemId: string;
  stageKey: string;
  purpose: string;
  slotConsumed: boolean;
  ok: boolean;
  ms: number;
  error?: string;
  usage?: Record<string, unknown> | null;
}

function argOf(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function nowKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().replace("Z", "+09:00");
}

// ── 원장 ──────────────────────────────────────────────────────────────────
interface Ledger {
  schemaVersion: number;
  capFullQuestionCandidates: number;
  usedFullQuestionCandidates: number;
  reservedFullQuestionCandidates: number;
  acceptedQuestions: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  startedAtKst: string;
  lastUpdatedAtKst: string;
  batches: Record<string, unknown>[];
  note: string;
}
function loadLedger(): Ledger { return readJson<Ledger>(LEDGER_PATH); }
function saveLedger(l: Ledger): void {
  l.lastUpdatedAtKst = nowKst();
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(l, null, 2) + "\n");
}

async function main() {
  const specPath = argOf("--spec");
  if (!specPath) throw new Error("--spec <spec.json> required");
  const DRY = process.argv.includes("--dry");
  const spec = readJson<Spec>(path.resolve(specPath));
  // 프로덕션 parity: Vercel 운영 env 는 thinking-off 로 해석된다(연구노트 O47).
  // 로컬 .env.local 의 "low" 가 새어들지 않게 배치 스펙이 명시한 값(기본 none)으로 고정.
  process.env.OPENROUTER_GEMINI_REASONING_EFFORT = spec.geminiReasoningEffort ?? "low";
  if (spec.providerRouting) {
    process.env.RESEARCH_OPENROUTER_PROVIDER_ROUTING_JSON = spec.providerRouting;
  }
  for (const [k, v] of Object.entries(spec.env ?? {})) {
    process.env[k] = v;
  }
  const outDir = path.join(CAMPAIGN_DIR, "batches", spec.batchId);
  if (fs.existsSync(path.join(outDir, "summary.json"))) {
    throw new Error(`batch ${spec.batchId} already has summary.json — refuse to overwrite`);
  }
  fs.mkdirSync(path.join(outDir, "items"), { recursive: true });

  const corpus = readJson<{ rows: { frameId: string; focusType: string; split: string; contentHash: string; passageText: string }[] }>(CORPUS_PATH);
  const frameById = new Map(corpus.rows.map((r) => [r.frameId, r]));
  for (const a of spec.assignments) {
    if (!frameById.has(a.frameId)) throw new Error(`unknown frameId ${a.frameId}`);
  }

  // 최악 예약: STANDARD 2, PREMIUM(어법) 4, PREMIUM(기타) 3, 커스텀 V1 3 / 기타 커스텀 2 slot/item
  const worstOf = (a: Assignment) => {
    if (a.armId === "G-ONE") return 2;
    if (a.funnel) {
      // 풀 깔때기: strict 다회(어법 STD KILLER cap 4) + rescue/relaxed + salvage.
      if (a.plan === "PREMIUM") return a.subType === "GRAMMAR_ERROR" ? 5 : 3;
      return a.subType === "GRAMMAR_ERROR" ? 7 : 4;
    }
    if (["G-V1", "B-V1", "G-X2", "B-X2", "G-X3", "B-X3"].includes(a.armId)) return 3;
    if (["G-CX", "B-CX"].includes(a.armId)) return 3;
    if (a.armId === "G-LX") return 5;
    if (a.armId === "B-E1") return 4;
    if (a.armId === "G-E1") return 6;
    if (["G-D1", "B-D1", "G-X1", "B-T1"].includes(a.armId)) return 2;
    return a.plan === "PREMIUM" ? (a.subType === "GRAMMAR_ERROR" ? 4 : 3) : 2;
  };
  const worstCase = spec.assignments.reduce((s, a) => s + worstOf(a), 0);

  const ledger = loadLedger();
  const remaining = ledger.capFullQuestionCandidates - ledger.usedFullQuestionCandidates - ledger.reservedFullQuestionCandidates;
  console.log(`[ledger] cap=${ledger.capFullQuestionCandidates} used=${ledger.usedFullQuestionCandidates} reserved=${ledger.reservedFullQuestionCandidates} remaining=${remaining}; batch worst-case=${worstCase}`);
  if (worstCase > remaining) throw new Error(`budget: worst-case ${worstCase} > remaining ${remaining}`);
  if (DRY) { console.log("[dry] spec ok:", spec.assignments.length, "assignments"); return; }

  ledger.reservedFullQuestionCandidates += worstCase;
  saveLedger(ledger);

  const { execSync } = await import("node:child_process");
  const gitSha = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  const gitDirty = execSync("git status --porcelain", { cwd: ROOT }).toString().trim().length > 0;
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify({ batchId: spec.batchId, phase: spec.phase, note: spec.note ?? null, atKst: nowKst(), gitSha, gitDirty, worstCaseReserved: worstCase, spec }, null, 2),
  );

  // ── 동적 import (env 로드 후) ──────────────────────────────────────────
  const genMod = await import("../../../../src/app/api/ai/generate-questions-auto/_lib/run-question-generation");
  const constMod = await import("../../../../src/app/api/ai/generate-questions-auto/_lib/constants");
  const qualMod = await import("../../../../src/lib/question-quality");
  const rtMod = await import("../../../../src/lib/question-generation-research-runtime");
  const profMod = await import("../../../../src/lib/question-generation-research-profiles");
  const atlasMod = await import("../../../../src/lib/atlas-ai");
  const llmMod = await import("../../../../src/lib/question-generation-llm");
  const postMod = await import("../../../../src/lib/question-postprocess");
  const schemasMod = await import("../../../../src/lib/question-ai-schemas-mc");
  const armsMod = await import("./custom-arms");
  const CUSTOM_ARMS = new Set(["G-ONE", "G-V1", "B-V1", "G-D1", "B-D1", "G-X1", "B-T1", "G-X2", "B-X2", "G-X3", "B-X3", "G-CX", "B-CX", "G-LX", "G-E1", "B-E1"]);

  const runGen = genMod.runQuestionGeneration as (
    input: Record<string, unknown>,
    opts: Record<string, unknown>,
  ) => Promise<Record<string, unknown>[]>;
  const DIFF_DESCRIPTION = constMod.DIFF_DESCRIPTION as Record<string, string>;
  const validateQ = qualMod.validateQuestionQuality as (a: Record<string, unknown>) => { severity: string; code: string; message?: string }[];

  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing");

  // ── wire 캡처 (openrouter 요청/응답 원문) ──────────────────────────────
  const callsFile = path.join(outDir, "calls.jsonl");
  const wireFile = path.join(outDir, "wire.jsonl");
  const nativeFetch = globalThis.fetch;
  let wireSeq = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (!url.includes("openrouter.ai")) return nativeFetch(input as RequestInfo, init);
    const seq = ++wireSeq;
    const reqBody = typeof init?.body === "string" ? init.body : null;
    const started = Date.now();
    const res = await nativeFetch(input as RequestInfo, init);
    let resBody: string | null = null;
    try { resBody = await res.clone().text(); } catch { /* stream 소비 충돌 시 생략 */ }
    const cap = (s: string | null, n: number) => (s && s.length > n ? s.slice(0, n) + `…[+${s.length - n}]` : s);
    fs.appendFileSync(wireFile, JSON.stringify({
      seq, atKst: nowKst(), url, status: res.status, ms: Date.now() - started,
      request: cap(reqBody, 400_000), response: cap(resBody, 400_000),
      item: itemAls.getStore()?.itemId ?? null,
    }) + "\n");
    return res;
  }) as typeof fetch;

  // ── 연구 런타임 어댑터 ─────────────────────────────────────────────────
  const itemAls = new AsyncLocalStorage<{ itemId: string; calls: CallRecord[]; slots: number }>();
  let globalSlots = 0;
  let globalCalls = 0;
  const budgetCeiling = ledger.capFullQuestionCandidates - ledger.usedFullQuestionCandidates; // 예약분 포함 상한

  function makeRuntime(runtimeId: string) {
    return {
      runtimeId,
      retryPolicy: rtMod.QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
      expectedQuestionsPerStructuredCall: 1,
      runAssignment<T>(fn: () => T | Promise<T>) { return Promise.resolve(fn()); },
      runOperation<T>(_op: unknown, fn: () => T | Promise<T>) { return Promise.resolve(fn()); },
      async runStage<T>(stage: { key: string; purpose: string }, fn: () => T | Promise<T>): Promise<T> {
        const ctx = itemAls.getStore();
        const isCandidate = stage.purpose === "candidate";
        if (isCandidate) {
          if (globalSlots >= budgetCeiling) throw new Error(`BUDGET_EXHAUSTED: ${globalSlots}/${budgetCeiling}`);
          globalSlots++;
          if (ctx) ctx.slots++;
        }
        globalCalls++;
        const rec: CallRecord = { itemId: ctx?.itemId ?? "?", stageKey: stage.key, purpose: stage.purpose, slotConsumed: isCandidate, ok: false, ms: 0 };
        const t0 = Date.now();
        try {
          const out = await fn();
          rec.ok = true;
          rec.ms = Date.now() - t0;
          const usage = (out as { usage?: unknown } | null | undefined)?.usage;
          rec.usage = usage && typeof usage === "object" ? (usage as Record<string, unknown>) : null;
          return out;
        } catch (e) {
          rec.ms = Date.now() - t0;
          rec.error = e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500);
          throw e;
        } finally {
          ctx?.calls.push(rec);
          fs.appendFileSync(callsFile, JSON.stringify(rec) + "\n");
        }
      },
      async observeCandidateValues() { /* 후보 관측은 item 결과로 갈음 */ },
      async decideCandidateValue() { /* idem */ },
    };
  }

  // ── item 실행 ──────────────────────────────────────────────────────────
  const itemsFile = path.join(outDir, "items.jsonl");
  const results: Record<string, unknown>[] = [];
  let idx = 0;
  const CONC = spec.concurrency ?? 3;
  const startedAt = Date.now();
  // 서킷브레이커(arm 단위): 한 arm에서 연속 3건 zero-cost 실패면 그 arm의 잔여 item만 스킵
  const armConsecFailures = new Map<string, number>();
  const armCircuitOpen = new Set<string>();
  let circuitOpen = false; // 전체 중단은 배치 선두 6연속 실패 시에만
  let batchLeadFailures = 0;
  let anySuccess = false;

  async function runItem(a: Assignment) {
    const frame = frameById.get(a.frameId)!;
    const rejectionRecorder = { issues: [] as Record<string, unknown>[], pool: [] as Record<string, unknown>[] };
    const usageEvents: Record<string, unknown>[] = [];
    const typeSettings =
      a.subType === "GRAMMAR_ERROR"
        ? { GRAMMAR_ERROR: { difficulty: a.difficulty, pointFocus: true, answerCount: 1, markerCount: 5 } }
        : a.subType === "BLANK_INFERENCE"
          ? { BLANK_INFERENCE: { difficulty: a.difficulty } }
          : { [a.subType]: { difficulty: a.difficulty } };
    const input = {
      plan: [{ subType: a.subType, count: 1, reason: `campaign-${spec.batchId}`, targetPoints: [] }],
      schoolType: "고등학교",
      gradeInfo: "2학년",
      passageContent: frame.passageText,
      teacherIntentBlock: "",
      analysisContext: "",
      diffLabel: a.difficulty,
      diffInstruction: DIFF_DESCRIPTION[a.difficulty] || "탄탄한 실전 문항",
      generationPlan: a.plan,
      typeSettings,
      onModelUsage: (e: Record<string, unknown>) => usageEvents.push(e),
    };
    const ctx = { itemId: a.itemId, calls: [] as CallRecord[], slots: 0 };
    const t0 = Date.now();
    let questions: Record<string, unknown>[] = [];
    let fatalError: string | null = null;
    let armTrail: string[] | null = null;
    let armExtra: Record<string, unknown> | null = null;
    try {
      if (CUSTOM_ARMS.has(a.armId)) {
        const deps = {
          generateQuestionObject: llmMod.generateQuestionObject as never,
          postProcessQuestion: postMod.postProcessQuestion as never,
          validateQuestionQuality: qualMod.validateQuestionQuality as never,
          buildAiGrammarErrorSchema: schemasMod.buildAiGrammarErrorSchema as never,
          aiBlankInferenceSchema: schemasMod.aiBlankInferenceSchema as never,
          runProductionGeneration: async () => {
            const qs = await runGen(input, {
              qualityMode: "strict",
              rejectionRecorder,
              attemptIndex: 0,
              deadlineAt: Date.now() + 150_000,
            });
            return {
              accepted: (qs[0] as Record<string, unknown> | undefined) ?? null,
              rejectedCandidates: (rejectionRecorder.pool ?? []) as { question?: Record<string, unknown>; blockingCodes?: string[] }[],
            };
          },
          premiumModelId: atlasMod.ATLAS_PREMIUM_QGEN_MODEL_ID as string,
          passage: frame.passageText,
          difficulty: a.difficulty,
          log: (m: string) => console.log(`[${a.itemId}] ${m}`),
        };
        const armRes = await itemAls.run(ctx, () =>
          rtMod.runWithQuestionGenerationResearchRuntime(makeRuntime(`${spec.batchId}:${a.itemId}`), () =>
            armsMod.runCustomArm(a.armId, deps as never),
          ),
        );
        armTrail = armRes.trail;
        armExtra = (armRes.extra as Record<string, unknown> | undefined) ?? null;
        if (armRes.accepted && armRes.question) {
          questions = [armRes.question];
        } else if (armRes.question) {
          rejectionRecorder.pool.push({
            question: armRes.question,
            blockingCodes: armRes.gateIssues.filter((i) => i.severity === "error").map((i) => i.code),
            warnings: armRes.gateIssues.filter((i) => i.severity === "warning"),
          } as never);
        }
      } else if (a.funnel) {
        if (a.profile) throw new Error(`funnel arm ${a.armId} cannot combine with profile`);
        const runFunnel = genMod.runQuestionGenerationWithEmptyRetry as (
          input: Record<string, unknown>,
          opts: Record<string, unknown>,
        ) => Promise<{
          questions: Record<string, unknown>[];
          attempts: number;
          relaxedFallback: boolean;
          rejectionSummary: Record<string, unknown>;
        }>;
        const funnelRes = await itemAls.run(ctx, () =>
          rtMod.runWithQuestionGenerationResearchRuntime(makeRuntime(`${spec.batchId}:${a.itemId}`), () =>
            runFunnel(input, {
              logPrefix: `CAMPAIGN-${spec.batchId}`,
              deadlineAt: Date.now() + (a.plan === "PREMIUM" ? 280_000 : 260_000),
            }),
          ),
        );
        questions = funnelRes.questions;
        armExtra = {
          funnelAttempts: funnelRes.attempts,
          relaxedFallback: funnelRes.relaxedFallback,
          rejectionSummary: funnelRes.rejectionSummary,
        };
      } else {
        questions = await itemAls.run(ctx, () =>
          rtMod.runWithQuestionGenerationResearchRuntime(makeRuntime(`${spec.batchId}:${a.itemId}`), () => {
            const exec = () =>
              runGen(input, {
                qualityMode: "strict",
                rejectionRecorder,
                attemptIndex: 0,
                deadlineAt: Date.now() + (a.plan === "PREMIUM" ? 280_000 : 150_000),
              });
            return a.profile
              ? profMod.runWithQuestionGenerationResearchPromptProfile(a.profile as never, exec)
              : exec();
          }),
        );
      }
    } catch (e) {
      fatalError = e instanceof Error ? e.message.slice(0, 800) : String(e).slice(0, 800);
    }
    const accepted = (questions[0] as Record<string, unknown> | undefined) ?? null;
    const validate = (q: Record<string, unknown> | null) =>
      q
        ? validateQ({ typeId: a.subType, question: q, passage: frame.passageText, requestedDifficulty: a.difficulty })
        : [];
    const acceptedIssues = validate(accepted);
    const costUsd = ctx.calls.reduce((s, c) => s + (typeof c.usage?.costUsd === "number" ? (c.usage.costUsd as number) : 0), 0);
    const rec = {
      itemId: a.itemId, armId: a.armId, batchId: spec.batchId,
      frameId: a.frameId, contentHash: frame.contentHash, split: frame.split,
      subType: a.subType, difficulty: a.difficulty, plan: a.plan, profile: a.profile ?? null,
      outcome: accepted ? "accepted" : rejectionRecorder.pool.length > 0 ? "gate_rejected" : "no_candidate",
      fatalError,
      ms: Date.now() - t0,
      slots: ctx.slots,
      calls: ctx.calls.map(({ itemId: _i, ...c }) => c),
      costUsd: Number(costUsd.toFixed(6)),
      accepted,
      acceptedGateIssues: acceptedIssues,
      rejectedCandidates: rejectionRecorder.pool.map((p) => ({
        blockingCodes: (p as { blockingCodes?: string[] }).blockingCodes,
        warnings: ((p as { warnings?: { code: string }[] }).warnings ?? []).map((w) => w.code),
        question: (p as { question?: Record<string, unknown> }).question,
      })),
      rejectionIssues: rejectionRecorder.issues.map((i) => ({
        phase: (i as { phase?: string }).phase,
        codes: (i as { codes?: string[] }).codes,
        message: String((i as { message?: string }).message ?? "").slice(0, 300),
      })),
      usageEvents,
      armTrail,
      armExtra,
      passageWords: frame.passageText.split(/\s+/).length,
    };
    if (rec.outcome === "no_candidate") {
      const n = (armConsecFailures.get(a.armId) ?? 0) + 1;
      armConsecFailures.set(a.armId, n);
      if (n >= 3 && !armCircuitOpen.has(a.armId)) {
        armCircuitOpen.add(a.armId);
        console.error(`[circuit-breaker] arm ${a.armId}: ${n}연속 no_candidate — 이 arm 잔여 item 스킵`);
      }
      if (!anySuccess) {
        batchLeadFailures++;
        if (batchLeadFailures >= 6) {
          circuitOpen = true;
          console.error(`[circuit-breaker] 배치 선두 ${batchLeadFailures}연속 실패 — 배치 중단`);
        }
      }
    } else {
      armConsecFailures.set(a.armId, 0);
      anySuccess = true;
    }
    fs.appendFileSync(itemsFile, JSON.stringify(rec) + "\n");
    results.push(rec);
    console.log(
      `[item ${results.length}/${spec.assignments.length}] ${a.itemId} ${a.armId} ${a.subType}/${a.difficulty}/${a.plan} → ${rec.outcome} slots=${ctx.slots} cost=$${rec.costUsd} ms=${rec.ms}${fatalError ? " ERR=" + fatalError.slice(0, 120) : ""}`,
    );
  }

  await Promise.all(
    Array.from({ length: Math.min(CONC, spec.assignments.length) }, async () => {
      while (idx < spec.assignments.length && !circuitOpen) {
        const a = spec.assignments[idx++];
        if (armCircuitOpen.has(a.armId)) {
          console.log(`[skip] ${a.itemId} — arm ${a.armId} circuit open`);
          continue;
        }
        await runItem(a);
      }
    }),
  );

  // ── 정산 ──────────────────────────────────────────────────────────────
  const totalSlots = results.reduce((s, r) => s + (r.slots as number), 0);
  const totalCost = results.reduce((s, r) => s + (r.costUsd as number), 0);
  const totalCallsOk = results.reduce((s, r) => s + (r.calls as CallRecord[]).length, 0);
  const inTok = results.reduce((s, r) => s + (r.calls as CallRecord[]).reduce((t, c) => t + Number((c.usage as Record<string, unknown> | null)?.inputTokens ?? 0), 0), 0);
  const outTok = results.reduce((s, r) => s + (r.calls as CallRecord[]).reduce((t, c) => t + Number((c.usage as Record<string, unknown> | null)?.outputTokens ?? 0), 0), 0);
  const acceptedCount = results.filter((r) => r.outcome === "accepted").length;

  const ledger2 = loadLedger();
  ledger2.reservedFullQuestionCandidates = Math.max(0, ledger2.reservedFullQuestionCandidates - worstCase);
  ledger2.usedFullQuestionCandidates += totalSlots;
  ledger2.acceptedQuestions += acceptedCount;
  ledger2.modelCalls += totalCallsOk;
  ledger2.inputTokens += inTok;
  ledger2.outputTokens += outTok;
  ledger2.costUsd = Number((ledger2.costUsd + totalCost).toFixed(6));
  ledger2.batches.push({
    batchId: spec.batchId, phase: spec.phase, note: spec.note ?? null,
    atKst: nowKst(), assignments: spec.assignments.length,
    slotsConsumed: totalSlots, accepted: acceptedCount, modelCalls: totalCallsOk,
    inputTokens: inTok, outputTokens: outTok, costUsd: Number(totalCost.toFixed(6)),
    durationMs: Date.now() - startedAt,
  });
  saveLedger(ledger2);

  const byArm: Record<string, { n: number; accepted: number; gateRejected: number; noCandidate: number; slots: number; costUsd: number }> = {};
  for (const r of results) {
    const k = r.armId as string;
    byArm[k] ??= { n: 0, accepted: 0, gateRejected: 0, noCandidate: 0, slots: 0, costUsd: 0 };
    byArm[k].n++;
    if (r.outcome === "accepted") byArm[k].accepted++;
    else if (r.outcome === "gate_rejected") byArm[k].gateRejected++;
    else byArm[k].noCandidate++;
    byArm[k].slots += r.slots as number;
    byArm[k].costUsd = Number((byArm[k].costUsd + (r.costUsd as number)).toFixed(6));
  }
  const summary = {
    batchId: spec.batchId, phase: spec.phase, atKst: nowKst(),
    assignments: spec.assignments.length, slotsConsumed: totalSlots,
    accepted: acceptedCount, modelCalls: totalCallsOk,
    inputTokens: inTok, outputTokens: outTok, costUsd: Number(totalCost.toFixed(6)),
    ledgerAfter: { used: ledger2.usedFullQuestionCandidates, cap: ledger2.capFullQuestionCandidates, costUsd: ledger2.costUsd },
    byArm,
    models: { standard: atlasMod.ATLAS_STANDARD_MODEL_ID, premiumQgen: atlasMod.ATLAS_PREMIUM_QGEN_MODEL_ID },
    durationMs: Date.now() - startedAt,
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n[summary]", JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
