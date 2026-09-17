// luna 반려/에러 지문 동일조건 재시도 1회 (26-08-08) — 일시 장애 vs 결정적 실패 구분.
// 산출: experiments/question-quality-20260715/luna-bench-20260808/retry.json
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync, writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DIR = "experiments/question-quality-20260715/luna-bench-20260808";
const MODEL = "openai/gpt-5.6-luna";

async function callModel(prompt: string) {
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
      max_tokens: 14000,
      reasoning: { enabled: true, effort: "high", exclude: true },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as any;
  const usage = json?.usage ?? {};
  return {
    text: (json?.choices?.[0]?.message?.content ?? "") as string,
    durationMs: Date.now() - t0,
    costUsd: typeof usage.cost === "number" ? usage.cost : null,
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    finishReason: (json?.choices?.[0]?.finish_reason ?? null) as string | null,
  };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdGrammarPrompt } = await import("../src/lib/md-qgen/prompts");
  const { parseMdGrammar, autoSnapGrammarMarks, gateMdQuestion } = await import(
    "../src/lib/md-qgen/parser"
  );
  const gen = JSON.parse(readFileSync(resolve(DIR, "gen.json"), "utf8"));
  const failed = gen.rows.filter(
    (r: any) => r.model === MODEL && (r.error || r.gateIssues.length > 0),
  );
  console.log(`luna 재시도 대상 ${failed.length}건`);
  const rows: any[] = [];
  await Promise.all(
    failed.map(async (f: any) => {
      const p = await prisma.passage.findUnique({
        where: { id: f.passageId },
        select: { id: true, title: true, content: true },
      });
      if (!p) return;
      const prompt = buildMdGrammarPrompt(p.content, "full", "KILLER");
      try {
        const r = await callModel(prompt);
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
        rows.push({
          model: MODEL, attempt: 2, passageId: p.id, passageTitle: p.title ?? "",
          firstFailure: f.error ? `error:${f.error.slice(0, 60)}` : f.gateIssues.join(" | ").slice(0, 120),
          ...r, gateIssues, corrections, parsed,
        });
        console.log(
          `${p.title?.slice(0, 30)} ${(r.durationMs / 1000).toFixed(0)}s $${r.costUsd} ${r.finishReason} ${gateIssues.length ? `REJECT(${gateIssues.length}): ${gateIssues[0].slice(0, 80)}` : "PASS"}`,
        );
      } catch (e) {
        rows.push({
          model: MODEL, attempt: 2, passageId: p.id, passageTitle: p.title ?? "",
          firstFailure: f.error ?? f.gateIssues.join(" | "),
          durationMs: 0, costUsd: null, inputTokens: 0, outputTokens: 0, reasoningTokens: 0,
          finishReason: null, gateIssues: [], corrections: [], parsed: null, text: "",
          error: e instanceof Error ? e.message : String(e),
        });
        console.log(`${p.title?.slice(0, 30)} ERROR ${e instanceof Error ? e.message.slice(0, 80) : e}`);
      }
    }),
  );
  writeFileSync(resolve(DIR, "retry.json"), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
