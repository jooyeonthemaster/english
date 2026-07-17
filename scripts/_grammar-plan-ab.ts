/**
 * 임시 진단 스크립트(_prefix) — 어법 KILLER 생성: STANDARD(Gemini) vs PREMIUM(Claude)
 * 동일 조건 A/B. prod 충실도를 위해 PREMIUM 에 deadlineAt=270s(Vercel fast 벽)를 명시.
 * 실제 prod 경로(runQuestionGenerationWithEmptyRetry → buildGenerationPrompt →
 * generateQuestionObject → OpenRouter)를 그대로 탄다. 문항은 DB 저장 안 함(원가행만 기록).
 *
 * ⚠️ 생성 모듈은 반드시 loadEnvConfig() '후' 동적 import — atlas-ai.ts 가 모듈 로드
 * 시점에 API 키를 읽으므로(정적 import 는 호이스팅돼 키가 빈 값 → 401).
 *
 * 실행: NODE_OPTIONS="" npx tsx scripts/_grammar-plan-ab.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd()); // .env + .env.local (Next/prod 동일 로딩)

import fs from "node:fs";
import path from "node:path";

type Plan = "STANDARD" | "PREMIUM";

// loadEnvConfig 후 동적으로 채운다.
let runGen: (input: unknown, opts: unknown) => Promise<{
  questions: Record<string, unknown>[];
  attempts: number;
  relaxedFallback: boolean;
  rejectionSummary: Record<string, unknown>;
}>;
let validateQ: (args: unknown) => { severity: string; code: string }[];

const PASSAGES: { id: string; text: string }[] = [
  {
    id: "sunk-cost",
    text: `Few mistakes in reasoning are as common as the tendency to throw good money after bad. Economists call it the sunk cost fallacy: the belief that past investments justify future commitments, even when the future looks dim. A factory that has spent millions developing a doomed product will often keep pouring resources into it, simply because so much has already been invested. The same logic infects everyday life: people sit through bad films because they paid for the ticket, stay in unproductive relationships because of the years already invested, and persist in failing careers because turning back would feel like an admission of defeat. Rational decision-making, by contrast, requires evaluating each new choice on its own merits, asking not what has been spent but what is still to gain. The hardest lesson in economics, then, may also be the hardest lesson in life.`,
  },
  {
    id: "explanation-philosophy",
    text: `Scientific explanation, many philosophers argue, is not merely a matter of describing what happens but of showing why it must happen. A law that merely summarizes observed regularities, however reliable, does not by itself explain them; it is the underlying mechanism, connecting cause to effect, that transforms description into understanding. What distinguishes a genuine explanation from a mere correlation is the counterfactual support it provides: had the cause been absent, the effect would not have followed. Critics respond that this criterion, appealing as it sounds, is difficult to apply to the historical sciences, where the events to be explained are singular and cannot be repeated. The debate, far from being settled, continues to shape how researchers across many disciplines justify the claims they make.`,
  },
];

const PLANS: Plan[] = ["STANDARD", "PREMIUM"];
const OUT = path.join(process.cwd(), "scripts", "_grammar-plan-ab-out.jsonl");

function layout(q: Record<string, unknown> | undefined): string {
  const me =
    q && Array.isArray((q as Record<string, unknown>).markedExpressions)
      ? ((q as Record<string, unknown>).markedExpressions as Record<string, unknown>[])
      : [];
  return me.map((m) => `${m.label}:${m.isError ? "ANS" : "dec"}=${m.pointCode}`).join("  ");
}

async function runOne(passage: { id: string; text: string }, plan: Plan) {
  const started = Date.now();
  const deadlineAt = plan === "PREMIUM" ? Date.now() + 270_000 : undefined;
  const base = { passage: passage.id, plan };
  try {
    const res = await runGen(
      {
        plan: [{ subType: "GRAMMAR_ERROR", count: 1, reason: "plan A/B", targetPoints: [] }],
        schoolType: "high school",
        gradeInfo: "grade 2",
        passageContent: passage.text,
        teacherIntentBlock: "",
        analysisContext: "",
        diffLabel: "KILLER",
        diffInstruction: "top-tier exam item requiring precise passage evidence",
        generationPlan: plan,
        typeSettings: {
          GRAMMAR_ERROR: { difficulty: "KILLER", pointFocus: true, answerCount: 1, markerCount: 5 },
        },
      },
      { logPrefix: `AB-${plan}`, deadlineAt },
    );
    const q = res.questions[0] as Record<string, unknown> | undefined;
    const issues = q
      ? validateQ({
          typeId: "GRAMMAR_ERROR",
          question: q,
          passage: passage.text,
          requestedDifficulty: "KILLER",
        })
      : [];
    const errors = issues.filter((i) => i.severity === "error").map((i) => i.code);
    const warnings = issues.filter((i) => i.severity === "warning").map((i) => i.code);
    const topReject = Array.isArray(res.rejectionSummary?.topCodes)
      ? (res.rejectionSummary.topCodes as Record<string, unknown>[])
          .slice(0, 5)
          .map((c) => `${c.code}x${c.count}`)
      : [];
    return {
      ...base,
      ok: res.questions.length === 1,
      ms: Date.now() - started,
      attempts: res.attempts,
      relaxedFallback: res.relaxedFallback,
      qmode: (q?._qualityMode as string) ?? null,
      answer: (q?.correctAnswer as string) ?? null,
      layout: q ? layout(q) : null,
      errors,
      warnings,
      topReject,
    };
  } catch (e) {
    return { ...base, ok: false, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  // ── 반드시 loadEnvConfig 후 동적 import ────────────────────────────────────
  const genMod = await import(
    "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation"
  );
  const qualMod = await import("../src/lib/question-quality");
  runGen = genMod.runQuestionGenerationWithEmptyRetry as typeof runGen;
  validateQ = qualMod.validateQuestionQuality as typeof validateQ;

  if (!process.env.OPENROUTER_API_KEY && !process.env.ATLASCLOUD_API_KEY) {
    throw new Error("OPENROUTER_API_KEY or ATLASCLOUD_API_KEY required");
  }
  console.log(
    `[AB] keys: OPENROUTER=${process.env.OPENROUTER_API_KEY ? "set" : "-"} ATLASCLOUD=${process.env.ATLASCLOUD_API_KEY ? "set" : "-"} base=${process.env.OPENROUTER_BASE_URL || process.env.ATLASCLOUD_BASE_URL || "?"}`,
  );

  fs.writeFileSync(OUT, "");
  const jobs: { passage: { id: string; text: string }; plan: Plan }[] = [];
  for (const p of PASSAGES) for (const plan of PLANS) jobs.push({ passage: p, plan });

  const results: Record<string, unknown>[] = [];
  let idx = 0;
  const CONC = 2;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (idx < jobs.length) {
        const my = idx++;
        const { passage, plan } = jobs[my];
        console.log(`[AB] start ${passage.id} / ${plan}`);
        const r = await runOne(passage, plan);
        results[my] = r;
        fs.appendFileSync(OUT, JSON.stringify(r) + "\n");
        console.log(
          `[AB] done ${passage.id} / ${plan}: ok=${r.ok} ms=${r.ms} attempts=${(r as Record<string, unknown>).attempts} relaxed=${(r as Record<string, unknown>).relaxedFallback} qmode=${(r as Record<string, unknown>).qmode} ans=${(r as Record<string, unknown>).answer}`,
        );
      }
    }),
  );

  console.log("\n========== GRAMMAR KILLER — STANDARD vs PREMIUM (동일 조건, pointFocus:true) ==========");
  for (const r of results) {
    const x = r as Record<string, unknown>;
    console.log(
      `${String(x.passage).padEnd(24)} ${String(x.plan).padEnd(9)} ok=${x.ok ? "Y" : "N"} ms=${String(x.ms).padStart(6)} att=${x.attempts ?? "-"} relax=${x.relaxedFallback ?? "-"} qmode=${x.qmode ?? "-"} ans=${x.answer ?? "-"}`,
    );
    if (x.layout) console.log(`   layout: ${x.layout}`);
    if (Array.isArray(x.errors) && x.errors.length) console.log(`   E: ${(x.errors as string[]).join(", ")}`);
    if (Array.isArray(x.warnings) && x.warnings.length) console.log(`   W: ${(x.warnings as string[]).join(", ")}`);
    if (Array.isArray(x.topReject) && x.topReject.length) console.log(`   reject: ${(x.topReject as string[]).join(", ")}`);
    if (x.error) console.log(`   ERROR: ${x.error}`);
  }
  console.log(`\nsaved: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
