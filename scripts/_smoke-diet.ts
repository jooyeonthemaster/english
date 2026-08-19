// 해설 다이어트(O225) 실생성 스모크 (26-08-18) — 프로덕션 빌더·게이트 그대로.
// 팔: g-int(어법 중급 luna) · b-kill(빈칸 KILLER 3.7) · g-kill(어법 KILLER 3.7 v2)
// 지문 3개(사용자 표본 Habits 24번 포함) × 3팔 = 9콜(재시도 없음 — 1차 통과율 측정).
// 사용: node_modules/.bin/tsx scripts/_smoke-diet.ts
import { loadEnvConfig } from "@next/env";
import { writeFileSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

type Arm = "g-int" | "b-kill" | "g-kill";

async function call(a: {
  model: string;
  system?: string;
  prompt: string;
  luna: boolean;
  schema?: unknown;
  maxTokens: number;
}) {
  const key = process.env.OPENROUTER_API_KEY!;
  const body: Record<string, unknown> = {
    model: a.model,
    messages: a.system
      ? [{ role: "system", content: a.system }, { role: "user", content: a.prompt }]
      : [{ role: "user", content: a.prompt }],
    max_tokens: a.maxTokens,
    stream: true,
    usage: { include: true },
    reasoning: { enabled: true, effort: "high", exclude: false },
  };
  if (a.luna) {
    body.response_format = { type: "json_schema", json_schema: a.schema };
    body.provider = { order: ["openai"], allow_fallbacks: false };
  }
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok || !res.body) throw new Error(`upstream ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let usage: any = null;
  let finish: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      const t = l.trim();
      if (!t.startsWith("data:")) continue;
      const pl = t.slice(5).trim();
      if (pl === "[DONE]") continue;
      try {
        const j = JSON.parse(pl);
        const c = j.choices?.[0];
        if (c?.finish_reason) finish = c.finish_reason;
        const d = c?.delta?.content ?? "";
        if (d) text += d;
        if (j.usage) usage = j.usage;
      } catch {}
    }
  }
  return {
    text,
    finish,
    ms: Date.now() - t0,
    cost: usage?.cost ?? null,
    out: usage?.completion_tokens ?? 0,
    reason: usage?.completion_tokens_details?.reasoning_tokens ?? null,
  };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdGrammarPrompt, buildMdBlankPrompt, buildGrammarMdSharedSelfcheck, buildBlankMdSharedSelfcheck } = await import("../src/lib/md-qgen/prompts");
  const { buildGrammarPointGuidance } = await import("../src/lib/grammar-point-catalog");
  const { buildBlankPointGuidance } = await import("../src/lib/blank-point-catalog");
  const { LUNA_GRAMMAR_JSON_SCHEMA, LUNA_GRAMMAR_SELFCHECK, LUNA_QGEN_SYSTEM_MESSAGE, LUNA_QGEN_MODEL_ID, LUNA_QGEN_MAX_TOKENS, adaptLunaGrammarJson } = await import("../src/lib/md-qgen/luna-lane");
  const { buildGrammarKillerV2Prompt, stripGrammarKillerV2Plan, processGrammarKillerV2Quotes } = await import("../src/lib/md-qgen/grammar-killer-v2");
  const { parseMdGrammar, parseMdBlank, autoSnapGrammarMarks, autoSnapBlankExpression, gateMdQuestion } = await import("../src/lib/md-qgen/parser");
  const { renumberGrammarByAppearance } = await import("../src/lib/md-qgen/luna-lane");
  const { ATLAS_PREMIUM_QGEN_MODEL_ID } = await import("../src/lib/atlas-ai");

  const passages = await prisma.passage.findMany({
    where: { id: { in: ["cmst4y5ai001hmmqgahrrjlea", "cmst4sbjn001bmmqg5m2em8tw", "cmst52g9f001nmmqgajhf8lsw"] } },
    select: { id: true, title: true, content: true },
  });
  const arms: Arm[] = ["g-int", "b-kill", "g-kill"];
  const rows: any[] = [];
  const tasks: Array<{ arm: Arm; p: (typeof passages)[number] }> = [];
  for (const p of passages) for (const arm of arms) tasks.push({ arm, p });

  const worker = async () => {
    for (;;) {
      const t = tasks.shift();
      if (!t) return;
      const { arm, p } = t;
      const row: any = { arm, passage: p.title };
      try {
        let r: any;
        let q: any = null;
        let issues: string[] = [];
        if (arm === "g-int") {
          const prompt = [
            buildMdGrammarPrompt(p.content, "full", "INTERMEDIATE", { markerCount: 5, answerCount: 1 }),
            buildGrammarPointGuidance({ pointFocus: true, requestedDifficulty: "INTERMEDIATE", mode: "judgment", answerCount: 1 }),
            LUNA_GRAMMAR_SELFCHECK,
          ].join("\n\n");
          r = await call({ model: LUNA_QGEN_MODEL_ID, system: LUNA_QGEN_SYSTEM_MESSAGE, prompt, luna: true, schema: LUNA_GRAMMAR_JSON_SCHEMA, maxTokens: LUNA_QGEN_MAX_TOKENS });
          const ad = adaptLunaGrammarJson(r.text);
          const sn = autoSnapGrammarMarks(ad.question, p.content);
          q = sn.question;
          issues = [...ad.issues, ...gateMdQuestion(q, p.content, { markerCount: 5, answerCount: 1 })];
        } else if (arm === "b-kill") {
          const prompt = [buildMdBlankPrompt(p.content, "full", "KILLER"), buildBlankPointGuidance({ pointFocus: true }), buildBlankMdSharedSelfcheck()].join("\n\n");
          r = await call({ model: ATLAS_PREMIUM_QGEN_MODEL_ID, prompt, luna: false, maxTokens: 14_000 });
          const parsed = parseMdBlank(r.text);
          const sn = autoSnapBlankExpression(parsed, p.content);
          q = sn.question;
          issues = gateMdQuestion(q, p.content);
        } else {
          const prompt = buildGrammarKillerV2Prompt(p.content);
          r = await call({ model: ATLAS_PREMIUM_QGEN_MODEL_ID, prompt, luna: false, maxTokens: 14_000 });
          let g = parseMdGrammar(stripGrammarKillerV2Plan(r.text));
          g = renumberGrammarByAppearance(g).question;
          const sn = autoSnapGrammarMarks(g, p.content);
          const gate = gateMdQuestion(sn.question, p.content, { markerCount: 5, answerCount: 1 });
          const qp = processGrammarKillerV2Quotes(sn.question, p.content);
          q = qp.question;
          issues = [...gate, ...qp.issues];
        }
        const expLen = (q?.explanation ?? "").length;
        const wrongLens = (q?.wrong ?? []).map((w: any) => (w.text ?? "").length);
        Object.assign(row, {
          pass: issues.length === 0,
          issues,
          ms: r.ms,
          krw: r.cost ? Math.round(r.cost * 1350 * 10) / 10 : null,
          finish: r.finish,
          reason: r.reason,
          explanationLen: expLen,
          wrongLenAvg: wrongLens.length ? Math.round(wrongLens.reduce((a: number, b: number) => a + b, 0) / wrongLens.length) : 0,
          question: q,
          rawHead: r.text.slice(0, 200),
        });
        console.log(`${arm.padEnd(6)} ${p.title.slice(0, 26).padEnd(26)} pass=${row.pass ? "Y" : "N"} ${Math.round(r.ms / 1000)}s ₩${row.krw} 해설${expLen}자 오답avg${row.wrongLenAvg}자 ${issues.length ? "| " + issues.join("; ").slice(0, 120) : ""}`);
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e);
        console.log(`${arm.padEnd(6)} ${p.title.slice(0, 26)} ERROR ${row.error.slice(0, 120)}`);
      }
      rows.push(row);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const out = path.join(process.cwd(), "experiments/question-quality-20260715/luna-killer-20260817/smoke-diet.json");
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
  console.log("saved", out);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
