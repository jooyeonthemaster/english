// luna 구제 변형 벤치 (26-08-08) — 사고수준·토큰예산 축 3팔 × 지문 8.
// 실패모드 대응: length절단→max_tokens 30k, 사고 과대→medium, 사용자 지시→xhigh.
// 빈응답 진단용으로 provider/native_finish_reason/choice.error 를 함께 기록.
// 산출: experiments/question-quality-20260715/luna-bench-20260808/variants.json
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync, writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DIR = "experiments/question-quality-20260715/luna-bench-20260808";
const MODEL = "openai/gpt-5.6-luna";
const ARMS = [
  { arm: "xhigh30k", effort: "xhigh", maxTokens: 30000 },
  { arm: "high30k", effort: "high", maxTokens: 30000 },
  { arm: "med14k", effort: "medium", maxTokens: 14000 },
] as const;
const CONCURRENCY = 6;

async function callModel(prompt: string, effort: string, maxTokens: number) {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      reasoning: { enabled: true, effort, exclude: true },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as any;
  const usage = json?.usage ?? {};
  const choice = json?.choices?.[0] ?? {};
  return {
    text: (choice?.message?.content ?? "") as string,
    durationMs: Date.now() - t0,
    costUsd: typeof usage.cost === "number" ? usage.cost : null,
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    finishReason: (choice?.finish_reason ?? null) as string | null,
    nativeFinishReason: (choice?.native_finish_reason ?? null) as string | null,
    provider: (json?.provider ?? null) as string | null,
    choiceError: choice?.error ? JSON.stringify(choice.error).slice(0, 200) : null,
  };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdGrammarPrompt } = await import("../src/lib/md-qgen/prompts");
  const { parseMdGrammar, autoSnapGrammarMarks, gateMdQuestion } = await import(
    "../src/lib/md-qgen/parser"
  );
  const gen = JSON.parse(readFileSync(resolve(DIR, "gen.json"), "utf8"));
  const passageIds: string[] = gen.passages.map((p: any) => p.id);
  const passages: Array<{ id: string; title: string; content: string }> = [];
  for (const id of passageIds) {
    const p = await prisma.passage.findUnique({ where: { id }, select: { id: true, title: true, content: true } });
    if (p) passages.push({ id: p.id, title: p.title ?? "", content: p.content });
  }
  console.log(`지문 ${passages.length}개 × ${ARMS.length}팔 = ${passages.length * ARMS.length}콜`);

  const tasks: Array<() => Promise<any>> = [];
  for (const p of passages) {
    for (const a of ARMS) {
      tasks.push(async () => {
        const prompt = buildMdGrammarPrompt(p.content, "full", "KILLER");
        try {
          const r = await callModel(prompt, a.effort, a.maxTokens);
          let gateIssues: string[] = [];
          let corrections: string[] = [];
          let parsed: unknown | null = null;
          try {
            let q = parseMdGrammar(r.text);
            const s = autoSnapGrammarMarks(q, p.content);
            q = s.question;
            corrections = s.corrections;
            gateIssues = gateMdQuestion(q, p.content);
            parsed = q;
          } catch (e) {
            gateIssues = [`파서 예외: ${e instanceof Error ? e.message : String(e)}`];
          }
          return { arm: a.arm, model: MODEL, passageId: p.id, passageTitle: p.title, ...r, gateIssues, corrections, parsed };
        } catch (e) {
          return {
            arm: a.arm, model: MODEL, passageId: p.id, passageTitle: p.title,
            durationMs: 0, costUsd: null, inputTokens: 0, outputTokens: 0, reasoningTokens: 0,
            finishReason: null, nativeFinishReason: null, provider: null, choiceError: null,
            gateIssues: [], corrections: [], parsed: null, text: "",
            error: e instanceof Error ? e.message : String(e),
          };
        }
      });
    }
  }

  const rows: any[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      const r = await tasks[i]();
      rows.push(r);
      const st = r.error ? `ERROR ${r.error.slice(0, 50)}` : r.gateIssues.length ? `REJECT: ${r.gateIssues[0]?.slice(0, 50)}` : "PASS";
      console.log(`[${rows.length}/${tasks.length}] ${r.arm} ${r.passageTitle.slice(0, 20)} ${(r.durationMs / 1000).toFixed(0)}s $${r.costUsd ?? "?"} ${r.finishReason ?? ""}${r.choiceError ? " choiceErr" : ""} ${st}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeFileSync(resolve(DIR, "variants.json"), JSON.stringify({ generatedAt: new Date().toISOString(), arms: ARMS, rows }, null, 2));

  console.log("\n══ 팔별 요약 ══");
  for (const a of ARMS) {
    const rs = rows.filter((r) => r.arm === a.arm);
    const ok = rs.filter((r) => !r.error && r.gateIssues.length === 0);
    const empty = rs.filter((r) => r.finishReason === "error" || (r.error && !r.text));
    const live = rs.filter((r) => r.costUsd != null);
    const avgS = live.reduce((x, r) => x + r.durationMs, 0) / Math.max(1, live.length) / 1000;
    const avgCost = live.reduce((x, r) => x + (r.costUsd ?? 0), 0) / Math.max(1, live.length);
    console.log(`${a.arm}: 통과 ${ok.length}/8 | 빈응답 ${empty.length} | 평균 ${avgS.toFixed(1)}s | 콜당 ₩${(avgCost * 1470).toFixed(1)}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
