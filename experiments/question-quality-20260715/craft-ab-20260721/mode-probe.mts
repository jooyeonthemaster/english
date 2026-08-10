// 해설 모드별 축자 위반율 프로브 — 사용자 관찰("정답 해설만에서 축자 실패 폭증") 검증.
// grok-4.5@high, 어법, 지문 2개 × 모드 2 × 3회 = 12콜. 현행 md-lab 프롬프트 그대로.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KEY = process.env.OPENROUTER_API_KEY;

import prompts from "@/lib/md-lab/prompts";
import parser from "@/lib/md-lab/parser";
const { buildMdGrammarPrompt } = prompts as any;
const { parseMdGrammar, gateMdQuestion, autoSnapGrammarMarks } = parser as any;

const corpus = JSON.parse(fs.readFileSync(path.join(HERE, "..", "hg5-standard-spec", "hg3-corpus.json"), "utf8"));
const passages = corpus.filter((p: { idx: number }) => [1, 12].includes(p.idx));

async function call(prompt: string) {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "x-ai/grok-4.5",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 6000, stream: false, usage: { include: true },
      reasoning: { enabled: true, effort: "high", exclude: true },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const json: any = await res.json().catch(() => null);
  const ms = Date.now() - t0;
  if (!res.ok || !json || json.error) return { ok: false as const, ms };
  return {
    ok: true as const, ms,
    rsn: json.usage?.completion_tokens_details?.reasoning_tokens ?? null,
    out: json.usage?.completion_tokens ?? null,
    text: json.choices?.[0]?.message?.content ?? "",
  };
}

interface Row {
  mode: string; p: number; rep: number; sec: number; rsn: number | null;
  rawViol: string[]; snapFixed: number; postSnapViol: string[];
}
const rows: Row[] = [];
const tasks: Array<{ p: any; mode: "full" | "answer-only"; rep: number }> = [];
for (const p of passages) for (const mode of ["full", "answer-only"] as const) for (let rep = 1; rep <= 3; rep++) tasks.push({ p, mode, rep });

await Promise.all(Array.from({ length: 4 }, async () => {
  while (tasks.length) {
    const t = tasks.shift(); if (!t) break;
    const r = await call(buildMdGrammarPrompt(t.p.content, t.mode));
    if (!r.ok) { console.log(JSON.stringify({ mode: t.mode, p: t.p.idx, rep: t.rep, fail: true })); continue; }
    const q = parseMdGrammar(r.text);
    const rawViol = gateMdQuestion(q, t.p.content, { requireWrong: t.mode !== "answer-only" })
      .filter((v: string) => v.includes("축자") || v.includes("모호") || v.includes("앵커"));
    const snapped = autoSnapGrammarMarks(q, t.p.content);
    const postSnapViol = gateMdQuestion(snapped.question, t.p.content, { requireWrong: t.mode !== "answer-only" })
      .filter((v: string) => v.includes("축자") || v.includes("모호") || v.includes("앵커"));
    const row: Row = {
      mode: t.mode, p: t.p.idx, rep: t.rep, sec: Math.round(r.ms / 1000), rsn: r.rsn,
      rawViol, snapFixed: snapped.corrections.length, postSnapViol,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}));
fs.writeFileSync(path.join(HERE, "mode-probe-results.json"), JSON.stringify(rows, null, 1));
for (const mode of ["full", "answer-only"]) {
  const set = rows.filter((r) => r.mode === mode);
  const viol = set.filter((r) => r.rawViol.length > 0).length;
  const post = set.filter((r) => r.postSnapViol.length > 0).length;
  const rsn = set.map((r) => r.rsn ?? 0);
  console.log(`${mode}: n=${set.length} 원시위반 ${viol}건 | 스냅 후 잔존 ${post}건 | 사고토큰 중앙 ${rsn.sort((a, b) => a - b)[Math.floor(rsn.length / 2)]} | 시간 ${set.map((r) => r.sec).sort((a, b) => a - b).join("/")}s`);
}
