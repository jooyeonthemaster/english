// 신모델 벤치 생성 (26-07-22) — flash3(현행) vs 3.6-flash vs 3.5-flash-lite.
// 프로덕션 md 레인 동일 조건: v3.1 프롬프트(KILLER·full)·reasoning high·
// max_tokens 14k·파서·자동스냅·게이트. 5지문 × 2유형 × 3모델 = 30문항.
// 산출: experiments/question-quality-20260715/newmodel-bench-20260722/gen.json
import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-3.6-flash",
  "google/gemini-3.5-flash-lite",
];
const JOB_PASSAGES = [
  "cmruyansj000fmmiwcp7vdn7f",
  "cmruw88is004xmml4rzyaowkt",
  "cmrus3r6v0021mml4nlv2rl0a",
  "cmruw8gsc0055mml4j4it953t",
];
const OUT_DIR = "experiments/question-quality-20260715/newmodel-bench-20260722";
const CONCURRENCY = 6;

interface GenRow {
  model: string;
  type: "BLANK_INFERENCE" | "GRAMMAR_ERROR";
  passageId: string;
  passageTitle: string;
  durationMs: number;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  gateIssues: string[];
  corrections: string[];
  text: string;
  error?: string;
}

async function callModel(model: string, prompt: string) {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 14000,
      reasoning: { enabled: true, effort: "high", exclude: true },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as any;
  const usage = json?.usage ?? {};
  return {
    text: (json?.choices?.[0]?.message?.content ?? "") as string,
    durationMs: Date.now() - t0,
    costUsd: typeof usage.cost === "number" ? usage.cost : null,
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
  };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdBlankPrompt, buildMdGrammarPrompt } = await import("../src/lib/md-qgen/prompts");
  const { parseMdBlank, parseMdGrammar, autoSnapBlankExpression, autoSnapGrammarMarks, gateMdQuestion } =
    await import("../src/lib/md-qgen/parser");

  // 지문 5개: 실패 재현에 쓴 기출 4 + 빈칸 계열 기출 1 추가
  const passages: Array<{ id: string; title: string; content: string }> = [];
  for (const jobId of JOB_PASSAGES) {
    const job = await prisma.workbenchAiJob.findUnique({ where: { id: jobId }, select: { passageId: true } });
    if (!job?.passageId) continue;
    const p = await prisma.passage.findUnique({ where: { id: job.passageId }, select: { id: true, title: true, content: true } });
    if (p && !passages.some((x) => x.id === p.id)) passages.push({ id: p.id, title: p.title ?? "", content: p.content });
  }
  const extra = await prisma.passage.findFirst({
    where: {
      title: { contains: "33번" },
      content: { not: "" },
      id: { notIn: passages.map((p) => p.id) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, content: true },
  });
  if (extra && extra.content.length > 500) passages.push({ id: extra.id, title: extra.title ?? "", content: extra.content });
  console.log(`지문 ${passages.length}개:`);
  for (const p of passages) console.log(` - ${p.title.slice(0, 50)} (${p.content.length}자)`);

  const tasks: Array<() => Promise<GenRow>> = [];
  for (const p of passages) {
    for (const type of ["BLANK_INFERENCE", "GRAMMAR_ERROR"] as const) {
      for (const model of MODELS) {
        tasks.push(async () => {
          const prompt =
            type === "BLANK_INFERENCE"
              ? buildMdBlankPrompt(p.content, "full", "KILLER")
              : buildMdGrammarPrompt(p.content, "full", "KILLER");
          try {
            const r = await callModel(model, prompt);
            let gateIssues: string[] = [];
            let corrections: string[] = [];
            try {
              if (type === "BLANK_INFERENCE") {
                let q = parseMdBlank(r.text);
                const s = autoSnapBlankExpression(q, p.content);
                q = s.question; corrections = s.corrections;
                gateIssues = gateMdQuestion(q, p.content);
              } else {
                let q = parseMdGrammar(r.text);
                const s = autoSnapGrammarMarks(q, p.content);
                q = s.question; corrections = s.corrections;
                gateIssues = gateMdQuestion(q, p.content);
              }
            } catch (e) {
              gateIssues = [`파서 예외: ${e instanceof Error ? e.message : String(e)}`];
            }
            return { model, type, passageId: p.id, passageTitle: p.title, ...r, gateIssues, corrections };
          } catch (e) {
            return {
              model, type, passageId: p.id, passageTitle: p.title,
              durationMs: 0, costUsd: null, inputTokens: 0, outputTokens: 0,
              gateIssues: [], corrections: [], text: "",
              error: e instanceof Error ? e.message : String(e),
            };
          }
        });
      }
    }
  }

  console.log(`\n총 ${tasks.length}콜 (동시 ${CONCURRENCY})`);
  const rows: GenRow[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      const r = await tasks[i]();
      rows.push(r);
      const st = r.error ? `ERROR ${r.error.slice(0, 60)}` : r.gateIssues.length ? `REJECT(${r.gateIssues.length})` : "PASS";
      console.log(`[${rows.length}/${tasks.length}] ${r.model.split("/")[1]} ${r.type === "BLANK_INFERENCE" ? "빈칸" : "어법"} ${(r.durationMs / 1000).toFixed(0)}s $${r.costUsd ?? "?"} ${st}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, "gen.json"), JSON.stringify({ generatedAt: new Date().toISOString(), models: MODELS, rows }, null, 2));

  // 요약
  console.log("\n══ 모델별 요약 ══");
  for (const m of MODELS) {
    const rs = rows.filter((r) => r.model === m && !r.error);
    const errs = rows.filter((r) => r.model === m && r.error).length;
    const rej = rs.filter((r) => r.gateIssues.length > 0).length;
    const avgS = rs.reduce((a, r) => a + r.durationMs, 0) / Math.max(1, rs.length) / 1000;
    const avgCost = rs.reduce((a, r) => a + (r.costUsd ?? 0), 0) / Math.max(1, rs.length);
    console.log(`${m}: n=${rs.length} 평균 ${avgS.toFixed(1)}s / $${avgCost.toFixed(5)}(₩${(avgCost * 1470).toFixed(1)}) / 게이트반려 ${rej} / 콜에러 ${errs}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
