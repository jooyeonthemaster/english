// ============================================================================
// craft A/B 러너 (26-07-21) — 방법 {A 현행, B 공예 1콜, C 공예+검수리} × 모델
// {grok-4.5, flash3, 3.1-pro} × {빈칸, 어법 KILLER} × 지문 10개 paired.
// ============================================================================
// 프로덕션 충실도 계약:
//  - 생성·검수리 콜은 프로덕션 LLM 레이어(generateQuestionObject — AI SDK 구조화
//    출력 + atlas 게이트웨이 + 동일 타임아웃/재시도)를 그대로 사용한다.
//  - A암 빈칸 = 프로덕션 buildStandardLeanGenerationPrompt 축자. A암 어법 =
//    프로덕션 runGrammarPremiumLadder 모듈 그대로(파인라이즈만 드라이버 근사).
//  - 검수리 = 프로덕션 runReviewRepairGate 모듈 그대로(flash3@high 핀 포함).
//  - 결정형 게이트: validateQuestionQuality(프로덕션 dispatcher) + 경량 구조
//    게이트(축자·삼킴·트레일링·마커) — 전 암 동일 적용, 위반 시 피드백 재시도 1회.
//  - 제외(정직 공시): Next.js 라우트/DB 저장/큐 오버헤드(실측 수 초), diversity
//    블록, 엔진 외곽 empty-retry 봉투(드라이버는 게이트 피드백 재시도 1회로 통일).
//  - 사고 형상(기검증 최적): grok@high(O192 운영), flash3@high(현행 S3i),
//    3.1pro@medium(O193 확정) — 어법 A암 사다리는 전 모델 low(현행 스펙).
// 실행: npx tsx experiments/question-quality-20260715/craft-ab-20260721/runner.mts [--probe]
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");

// ── env: .env.local 로드 후, 실험을 오염시키는 오버라이드는 제거(코드 기본값 사용) ──
{
  const envText = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  // 프로덕션 코드 기본값(=Vercel 프로덕션 형상)을 쓰도록 dev 전용/구세대 노브 제거.
  // OPENROUTER_GEMINI_REASONING_EFFORT=low 는 프로덕션에도 있는 전역 형상이라 유지.
  for (const k of [
    "GEMINI_QUESTION_TIMEOUT_MS",
    "GEMINI_QUESTION_MAX_RETRIES",
    "GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS",
    "GEMINI_QUESTION_THINKING_BUDGET",
    "STANDARD_QGEN_MODEL_ID",
    "PREMIUM_QGEN_MODEL_ID",
    "GRAMMAR_PREMIUM_MODEL_ID",
    "GRAMMAR_PREMIUM_REASONING_EFFORT",
    "REVIEW_REPAIR_GATE_MODE",
    "REVIEW_REPAIR_GATE_TYPES",
    "REVIEW_REPAIR_REASONING_EFFORT",
    "REVIEW_REPAIR_MIN_BUDGET_MS",
    "QUESTION_GENERATION_SINGLE_TIER",
    "STANDARD_LEAN_CONTRACT",
    "QGEN_GEMINI_REASONING_EFFORT",
  ]) delete process.env[k];
}

// ── 프로덕션 모듈 (env 셋업 후 동적 import) ──────────────────────────────────
const { buildStandardLeanGenerationPrompt } = await import("@/lib/question-generation-prompt-contract");
const { getAiResponseSchema } = await import("@/lib/question-ai-schemas-mc");
const { generateQuestionObject } = await import("@/lib/question-generation-llm");
const { runGrammarPremiumLadder } = await import("@/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder");
const { runReviewRepairGate } = await import("@/app/api/ai/generate-questions-auto/_lib/review-repair-gate");
const { validateQuestionQuality } = await import("@/lib/question-quality/dispatcher");
const { analyzeEnglishPassageIntegrity } = await import("@/lib/question-quality/passage-integrity");
const { postProcessQuestion } = await import("@/lib/question-postprocess");
const { DIFF_DESCRIPTION } = await import("@/app/api/ai/generate-questions-auto/_lib/constants");
const { buildCraftBlankPrompt, buildCraftGrammarPrompt } = await import("./craft-prompts.mts");

// ── 실험 상수 ────────────────────────────────────────────────────────────────
const BUDGET_USD = 28.0;
const OUT = path.join(HERE, "results.jsonl");
const PROBE = process.argv.includes("--probe");
const PASSAGE_PICK = [1, 3, 6, 9, 11, 12, 13, 17, 19, 20]; // 오염 idx15 제외, 유형 다양화
const KRW_PER_USD = 1400;

// genTimeoutMs: flash3/pro31 = 현행 STANDARD 120s. grok = 240s(구 grok 운영
// 데드라인 형상 — O191/O192 실측 어법 175~274s, 120s 는 계통 전멸이라 비교 불능).
const MODELS: Record<string, { id: string; qgenEffort: string; genTimeoutMs: number }> = {
  grok: { id: "x-ai/grok-4.5", qgenEffort: "high", genTimeoutMs: 240_000 },
  flash3: { id: "google/gemini-3-flash-preview", qgenEffort: "high", genTimeoutMs: 120_000 },
  pro31: { id: "google/gemini-3.1-pro-preview", qgenEffort: "medium", genTimeoutMs: 120_000 },
};
const ARM_KEYS = ["A", "B", "C"] as const;

const corpus: Array<{ idx: number; id: string; title: string; content: string }> = JSON.parse(
  fs.readFileSync(path.join(HERE, "..", "hg5-standard-spec", "hg3-corpus.json"), "utf8"),
).filter((p: { idx: number }) => PASSAGE_PICK.includes(p.idx));

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
let spentUsd = 0;
function costUsdOf(usage: unknown): number {
  if (!usage || typeof usage !== "object") return 0;
  const u = usage as Record<string, unknown>;
  const v = typeof u.costUsd === "number" ? u.costUsd : typeof u.cost === "number" ? u.cost : 0;
  return Number.isFinite(v) ? v : 0;
}

interface CallRow { phase: string; modelId: string; ms: number; costUsd: number; attempts?: number; ok: boolean; error?: string }

// 결정형 경량 구조 게이트(전 암 동일) — 프로덕션 신설 게이트와 등가 축.
function lightGate(qtype: "blank" | "grammar", q: Record<string, unknown>, passage: string): string[] {
  const v: string[] = [];
  const pnorm = norm(passage);
  if (qtype === "blank") {
    const opts = q.options;
    if (!Array.isArray(opts) || opts.length !== 5) v.push("OPTIONS_NOT_5");
    const oe = norm(q.originalExpression);
    if (!oe) v.push("ORIGINAL_MISSING");
    else if (!pnorm.includes(oe)) v.push("ORIGINAL_NOT_VERBATIM");
    else {
      const sentences = pnorm.split(/(?<=[.!?])\s+/);
      const host = sentences.find((s) => s.includes(oe));
      if (host && oe.length >= host.length * 0.88) v.push("FULL_SENTENCE_SWALLOW");
      const after = pnorm.slice(pnorm.indexOf(oe) + oe.length);
      if (/^\s*,?\s*(nor\b|which\b|whom\b|behind which|in which|and neither)/i.test(after)) v.push("TRAILING_DEPENDENT");
    }
  } else {
    const ms = q.markedExpressions;
    if (!Array.isArray(ms) || ms.length !== 5) return [...v, "MARKERS_NOT_5"];
    let errCount = 0;
    for (const m of ms as Array<Record<string, unknown>>) {
      const expr = norm(m.expression);
      if (!expr || !pnorm.includes(expr)) v.push(`EXPR_NOT_VERBATIM:${m.label ?? "?"}`);
      if (m.isError === true) {
        errCount += 1;
        if (!norm(m.errorExpression) || norm(m.errorExpression) === expr) v.push("ANSWER_NOT_MUTATED");
      }
    }
    if (errCount !== 1) v.push(`ANSWER_COUNT_${errCount}`);
  }
  return v;
}

// 프로덕션 dispatcher 게이트 — 지문 자체 기인 코드는 기저 차감(전 암 동일 노이즈 제거).
const passageBaseline = new Map<number, Set<string>>();
function baselineCodes(pIdx: number, passage: string): Set<string> {
  if (!passageBaseline.has(pIdx)) {
    try {
      passageBaseline.set(pIdx, new Set(analyzeEnglishPassageIntegrity(passage).map((f: { code: string }) => f.code)));
    } catch { passageBaseline.set(pIdx, new Set()); }
  }
  return passageBaseline.get(pIdx)!;
}
function dispatcherIssues(qtype: "blank" | "grammar", q: Record<string, unknown>, passage: string, pIdx: number) {
  try {
    const issues = validateQuestionQuality({
      typeId: qtype === "blank" ? "BLANK_INFERENCE" : "GRAMMAR_ERROR",
      question: q,
      passage,
      requestedDifficulty: "KILLER",
      ...(qtype === "grammar" ? { grammarMarkerCount: 5, grammarAnswerCount: 1 } : {}),
    }) as Array<{ severity: string; code: string; message: string }>;
    const base = baselineCodes(pIdx, passage);
    const filtered = issues.filter((i) => !base.has(i.code));
    return {
      errors: filtered.filter((i) => i.severity === "error").map((i) => i.code),
      warnings: filtered.filter((i) => i.severity === "warning").map((i) => i.code),
      validatorOk: true,
    };
  } catch (e) {
    return { errors: [], warnings: [], validatorOk: false, validatorError: String(e).slice(0, 200) };
  }
}

// ── 프로덕션 후처리 → 검증 순서(run-question-generation 동형) ────────────────
// KILLER 단일 빈칸은 프로덕션이 blankAnswerMode=PARAPHRASE 를 강제 스탬프한다.
function finalizeQuestion(qtype: "blank" | "grammar", rawQ: Record<string, unknown>, passage: string, pIdx: number) {
  const typeId = qtype === "blank" ? "BLANK_INFERENCE" : "GRAMMAR_ERROR";
  const normalized = qtype === "blank" ? { ...rawQ, blankAnswerMode: "PARAPHRASE" } : rawQ;
  let pp: { success: boolean; data?: unknown; error?: string };
  try {
    pp = postProcessQuestion(typeId, passage, normalized) as { success: boolean; data?: unknown; error?: string };
  } catch (e) {
    pp = { success: false, error: String(e).slice(0, 160) };
  }
  if (!pp.success || !pp.data) {
    return { ppOk: false as const, ppError: pp.error ?? "postprocess-failed", mapped: null, disp: { errors: [], warnings: [], validatorOk: false } };
  }
  const mapped = { ...(pp.data as Record<string, unknown>), difficulty: "KILLER" };
  const disp = dispatcherIssues(qtype, mapped, passage, pIdx);
  return { ppOk: true as const, ppError: null, mapped, disp };
}

// ── 어법 사다리 finalize 근사(드라이버) — 마커 위치 + dispatcher 게이트 ────────
function grammarPositions(q: Record<string, unknown>, passage: string) {
  const pnorm = norm(passage);
  const sentences = pnorm.split(/(?<=[.!?])\s+/);
  const sentStarts: number[] = [];
  let acc = 0;
  for (const s of sentences) { sentStarts.push(acc); acc += s.length + 1; }
  const ms = Array.isArray(q.markedExpressions) ? (q.markedExpressions as Array<Record<string, unknown>>) : [];
  let cursor = 0;
  let notFound = 0;
  let answerRelPos: number | null = null;
  const markers = ms.map((m) => {
    const expr = norm(m.expression);
    let idx = expr ? pnorm.indexOf(expr, cursor) : -1;
    if (idx < 0 && expr) idx = pnorm.indexOf(expr);
    const found = idx >= 0;
    if (!found) notFound += 1;
    else cursor = idx + expr.length;
    let sentenceIndex = -1;
    if (found) for (let i = sentStarts.length - 1; i >= 0; i--) { if (idx >= sentStarts[i]) { sentenceIndex = i; break; } }
    const relPos = found ? idx / Math.max(1, pnorm.length) : null;
    if (m.isError === true && found) answerRelPos = relPos;
    return { label: String(m.label ?? "?"), isError: m.isError === true, relPos, sentenceIndex, found };
  });
  return { markers, notFoundCount: notFound, answerRelPos };
}

// ── 생성 콜 래퍼 ─────────────────────────────────────────────────────────────
async function genCall(args: {
  prompt: string; qtype: "blank" | "grammar"; modelKey: string; calls: CallRow[]; phase: string;
}) {
  const model = MODELS[args.modelKey];
  const schema = args.qtype === "blank"
    ? getAiResponseSchema("BLANK_INFERENCE")
    : getAiResponseSchema("GRAMMAR_ERROR", { grammarMarkerCount: 5, grammarAnswerCount: 1 });
  const t0 = Date.now();
  try {
    const res = await generateQuestionObject({
      schema,
      prompt: args.prompt,
      generationPlan: "STANDARD",
      modelId: model.id,
      logPrefix: `CRAFT-${args.phase}`,
      maxTokens: 16_000,
      timeoutMs: model.genTimeoutMs,
      reasoningEffort: model.qgenEffort,
      applyReasoningEffortToGemini: true,
    });
    const cost = costUsdOf(res.usage);
    spentUsd += cost;
    args.calls.push({ phase: args.phase, modelId: res.modelId, ms: res.durationMs, costUsd: cost, attempts: res.attempts, ok: true });
    const obj = res.object as { questions?: Array<Record<string, unknown>> };
    return Array.isArray(obj?.questions) ? obj.questions[0] ?? null : null;
  } catch (e) {
    args.calls.push({ phase: `${args.phase}#failed`, modelId: model.id, ms: Date.now() - t0, costUsd: 0, ok: false, error: String(e).slice(0, 200) });
    return null;
  }
}

// 게이트 + 피드백 재시도 1회(전 암 동일 봉투) — 프로덕션 순서: 후처리 → 검증.
interface GenOutcome {
  raw: Record<string, unknown> | null;
  mapped: Record<string, unknown> | null;
  viol: string[];
  disp: { errors: string[]; warnings: string[]; validatorOk: boolean };
  retries: number;
}
function assess(qtype: "blank" | "grammar", raw: Record<string, unknown> | null, passage: string, pIdx: number) {
  if (!raw) return { mapped: null, viol: ["GEN_FAILED"], disp: { errors: [], warnings: [], validatorOk: false } };
  const viol = lightGate(qtype, raw, passage);
  const fin = finalizeQuestion(qtype, raw, passage, pIdx);
  if (!fin.ppOk) return { mapped: null, viol: [...viol, `POSTPROCESS_FAIL:${fin.ppError}`], disp: fin.disp };
  return { mapped: fin.mapped, viol, disp: fin.disp };
}
async function genWithGates(args: {
  basePrompt: string; qtype: "blank" | "grammar"; modelKey: string; calls: CallRow[]; pIdx: number; passage: string; phase: string;
}): Promise<GenOutcome> {
  const raw1 = await genCall({ prompt: args.basePrompt, qtype: args.qtype, modelKey: args.modelKey, calls: args.calls, phase: args.phase });
  let best: GenOutcome = { raw: raw1, ...assess(args.qtype, raw1, args.passage, args.pIdx), retries: 0 };
  const blocking = [...best.viol, ...best.disp.errors];
  if (blocking.length > 0) {
    const fb = `${args.basePrompt}\n\n[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${blocking.join(", ")}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라.`;
    const raw2 = await genCall({ prompt: fb, qtype: args.qtype, modelKey: args.modelKey, calls: args.calls, phase: `${args.phase}-retry` });
    const cand: GenOutcome = { raw: raw2, ...assess(args.qtype, raw2, args.passage, args.pIdx), retries: 1 };
    const score = (o: GenOutcome) => (o.mapped ? o.viol.length + o.disp.errors.length : 99);
    best = score(cand) < score(best) ? cand : { ...best, retries: 1 };
  }
  return best;
}

// 검수리(프로덕션 모듈 그대로 — flash3@high 핀) + 채택 판정(finalize 재검증 동형)
async function reviewRepair(args: {
  qtype: "blank" | "grammar"; q: Record<string, unknown>; passage: string; pIdx: number; calls: CallRow[];
}) {
  const schema = args.qtype === "blank"
    ? getAiResponseSchema("BLANK_INFERENCE")
    : getAiResponseSchema("GRAMMAR_ERROR", { grammarMarkerCount: 5, grammarAnswerCount: 1 });
  const t0 = Date.now();
  const res = await runReviewRepairGate({
    subType: args.qtype === "blank" ? "BLANK_INFERENCE" : "GRAMMAR_ERROR",
    question: args.q,
    passage: args.passage,
    generationPlan: "STANDARD",
    responseSchema: schema,
    onModelUsage: (u: { usage?: unknown; modelId?: string; attempts?: number; durationMs?: number }) => {
      const cost = costUsdOf(u.usage);
      spentUsd += cost;
      args.calls.push({ phase: "review", modelId: String(u.modelId ?? "?"), ms: u.durationMs ?? 0, costUsd: cost, attempts: u.attempts, ok: true });
    },
  });
  const reviewMs = Date.now() - t0;
  let adopted = false;
  let finalQ = args.q; // 후처리 완료본(mapped) 유지가 기본
  if (res.status === "FIXED" && res.fixedItem) {
    // 프로덕션 시맨틱: 수리본은 생성 스키마 형상 → 재-finalize(후처리+게이트) 통과 시에만 채택.
    const fviol = lightGate(args.qtype, res.fixedItem, args.passage);
    const fin = finalizeQuestion(args.qtype, res.fixedItem, args.passage, args.pIdx);
    const odisp = dispatcherIssues(args.qtype, args.q, args.passage, args.pIdx);
    if (fviol.length === 0 && fin.ppOk && fin.mapped && fin.disp.errors.length <= odisp.errors.length) {
      finalQ = fin.mapped; adopted = true;
    }
  }
  return { status: res.status, defects: res.defects ?? [], adopted, finalQ, reviewMs };
}

// ── 암 구현 ──────────────────────────────────────────────────────────────────
type TaskResult = Record<string, unknown>;

async function runArm(arm: string, modelKey: string, p: { idx: number; content: string }, qtype: "blank" | "grammar"): Promise<TaskResult> {
  const calls: CallRow[] = [];
  const t0 = Date.now();
  const model = MODELS[modelKey];
  let mapped: Record<string, unknown> | null = null;
  let viol: string[] = [];
  let disp: { errors: string[]; warnings: string[]; validatorOk: boolean } = { errors: [], warnings: [], validatorOk: false };
  let retries = 0;
  let ladderMeta: Record<string, unknown> | null = null;
  let giveUp: string | null = null;

  if (arm === "A" && qtype === "grammar") {
    // 현행: 어법 KILLER = 프로덕션 사다리 모듈 그대로(사고 low).
    // finalize = 프로덕션 동형(후처리 → dispatcher) + 마커 위치(배치 소프트 검사용).
    const res = await runGrammarPremiumLadder({
      passageContent: p.content,
      difficulty: "KILLER",
      difficultyInstruction: DIFF_DESCRIPTION.KILLER,
      generationPlan: "STANDARD",
      qualityMode: "strict",
      modelId: model.id,
      onModelUsage: (e: { usage?: unknown; durationMs?: number; modelId?: string; attempts?: number }) => {
        const cost = costUsdOf(e.usage);
        spentUsd += cost;
        calls.push({ phase: "ladder", modelId: String(e.modelId ?? model.id), ms: e.durationMs ?? 0, costUsd: cost, attempts: e.attempts, ok: true });
      },
      finalize: async (aiQuestion: Record<string, unknown>) => {
        const pos = grammarPositions(aiQuestion, p.content);
        const fin = finalizeQuestion("grammar", aiQuestion, p.content, p.idx);
        return {
          ok: fin.ppOk && pos.notFoundCount === 0,
          error: !fin.ppOk ? String(fin.ppError) : pos.notFoundCount > 0 ? `markers-not-found:${pos.notFoundCount}` : undefined,
          question: fin.mapped ?? aiQuestion,
          errors: fin.disp.errors,
          warnings: fin.disp.warnings,
          answerRelPos: pos.answerRelPos,
          positions: { markers: pos.markers, notFoundCount: pos.notFoundCount },
        };
      },
    });
    ladderMeta = { status: res.status, regenerations: res.regenerations, repairs: res.repairs, ladder: res.ladder, giveUpReason: res.giveUpReason ?? null, callCount: res.calls.length };
    const cand = (res.aiQuestion ?? res.bestCandidate ?? null) as Record<string, unknown> | null;
    if (res.status === "gave-up") giveUp = res.giveUpReason ?? "gave-up";
    if (cand) {
      const a = assess("grammar", cand, p.content, p.idx);
      mapped = a.mapped; viol = a.viol; disp = a.disp;
    } else viol = ["LADDER_NO_CANDIDATE"];
  } else {
    const basePrompt =
      arm === "A"
        ? buildStandardLeanGenerationPrompt({ typeId: "BLANK_INFERENCE", passageContent: p.content, difficulty: "KILLER" })
        : qtype === "blank"
          ? buildCraftBlankPrompt(p.content)
          : buildCraftGrammarPrompt(p.content);
    const g = await genWithGates({ basePrompt, qtype, modelKey, calls, pIdx: p.idx, passage: p.content, phase: `${arm}-gen` });
    mapped = g.mapped; viol = g.viol; disp = g.disp; retries = g.retries;
  }

  // 검수리: A(현행)·C(공예+검수리)만 — B 는 1콜 순수형. 입력은 후처리 완료본(프로덕션 동형).
  let review: { status: string; defects: string[]; adopted: boolean; reviewMs: number } | null = null;
  if (mapped && (arm === "A" || arm === "C")) {
    const r = await reviewRepair({ qtype, q: mapped, passage: p.content, pIdx: p.idx, calls });
    review = { status: r.status, defects: r.defects, adopted: r.adopted, reviewMs: r.reviewMs };
    mapped = r.finalQ;
    const d2 = dispatcherIssues(qtype, mapped, p.content, p.idx);
    disp = d2;
  }

  const costUsd = calls.reduce((a, c) => a + c.costUsd, 0);
  return {
    ts: new Date().toISOString(), arm, model: modelKey, modelId: model.id, effort: arm === "A" && qtype === "grammar" ? "low(ladder)" : model.qgenEffort,
    p: p.idx, qtype,
    ok: !!mapped && viol.length === 0 && disp.errors.length === 0 && !giveUp,
    giveUp, wallMs: Date.now() - t0, retries,
    costUsd, costKrw: Math.round(costUsd * KRW_PER_USD * 10) / 10,
    lightViol: viol, dispErrors: disp.errors, dispWarnings: disp.warnings, validatorOk: disp.validatorOk,
    review, ladderMeta, calls, item: mapped,
  };
}

// ── 실행 계획 + 재개 ─────────────────────────────────────────────────────────
const done = new Set<string>();
if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.item) done.add(`${r.arm}:${r.model}:${r.p}:${r.qtype}`); } catch {}
  }
}

interface Task { arm: string; modelKey: string; p: { idx: number; content: string }; qtype: "blank" | "grammar" }
const tasks: Task[] = [];
if (PROBE) {
  const p1 = corpus[0];
  tasks.push(
    { arm: "B", modelKey: "flash3", p: p1, qtype: "blank" },
    { arm: "B", modelKey: "grok", p: p1, qtype: "blank" },
    { arm: "B", modelKey: "pro31", p: p1, qtype: "blank" },
    { arm: "A", modelKey: "flash3", p: p1, qtype: "blank" },
    { arm: "A", modelKey: "flash3", p: p1, qtype: "grammar" },
    { arm: "B", modelKey: "flash3", p: p1, qtype: "grammar" },
  );
} else {
  for (const p of corpus) for (const qtype of ["blank", "grammar"] as const) for (const arm of ARM_KEYS) for (const modelKey of Object.keys(MODELS)) {
    if (!done.has(`${arm}:${modelKey}:${p.idx}:${qtype}`)) tasks.push({ arm, modelKey, p, qtype });
  }
}
console.log(`craft-ab tasks: ${tasks.length} (probe=${PROBE}) | budget $${BUDGET_USD}`);

let doneCount = 0;
const t00 = Date.now();
async function runTask(t: Task) {
  if (spentUsd > BUDGET_USD) {
    fs.appendFileSync(OUT, JSON.stringify({ arm: t.arm, model: t.modelKey, p: t.p.idx, qtype: t.qtype, skipped: "BUDGET" }) + "\n");
    return;
  }
  let row: TaskResult;
  try {
    row = await runArm(t.arm, t.modelKey, t.p, t.qtype);
  } catch (e) {
    row = { arm: t.arm, model: t.modelKey, p: t.p.idx, qtype: t.qtype, ok: false, crash: String(e).slice(0, 300) };
  }
  doneCount += 1;
  fs.appendFileSync(OUT, JSON.stringify(row) + "\n");
  const r = row as { ok?: boolean; wallMs?: number; costUsd?: number; lightViol?: string[]; dispErrors?: string[]; crash?: string };
  console.log(
    `[${doneCount}/${tasks.length}] ${t.arm}×${t.modelKey} p${t.p.idx} ${t.qtype} ` +
    `${r.ok ? "OK" : "FAIL(" + [...(r.lightViol ?? []), ...(r.dispErrors ?? []), r.crash ?? ""].filter(Boolean).join("|").slice(0, 90) + ")"} ` +
    `${Math.round((r.wallMs ?? 0) / 1000)}s $${(r.costUsd ?? 0).toFixed(3)} | spent=$${spentUsd.toFixed(2)}`,
  );
  if (PROBE) {
    console.log("  usage-calls:", JSON.stringify((row as { calls?: CallRow[] }).calls ?? []));
    console.log("  validatorOk:", (row as { validatorOk?: boolean }).validatorOk, "| dispErrors:", JSON.stringify((row as { dispErrors?: string[] }).dispErrors), "| dispWarnings:", JSON.stringify(((row as { dispWarnings?: string[] }).dispWarnings ?? []).slice(0, 10)));
    const item = (row as { item?: Record<string, unknown> }).item;
    if (item) console.log("  item-keys:", Object.keys(item).join(","), "\n  item-sample:", JSON.stringify(item).slice(0, 600));
  }
}

const CONC = PROBE ? 2 : 4;
const queue = [...tasks];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (queue.length) {
    const t = queue.shift();
    if (!t) break;
    try { await runTask(t); } catch (e) { console.log("task-crash", String(e).slice(0, 150)); }
  }
}));
console.log(`CRAFT-AB DONE in ${((Date.now() - t00) / 60000).toFixed(1)}min, spent=$${spentUsd.toFixed(2)}`);
