// 어법 KILLER v2 최종 확인 스모크 (26-08-19, O227) — 3.7 + 짧은지문 완화 + 마커 창 봉합.
// 지문 5: 23번(2문장 절단본·원큐 성공 검증) + 34번(that-that 트랩) + R3 3개. 재시도 1회(프로덕션 정책).
import { loadEnvConfig } from "@next/env";
import { writeFileSync } from "node:fs";
loadEnvConfig(process.cwd());

const IDS = [
  "cmst4sbjn001bmmqg5m2em8tw", // 23번 절단본
  "cmsqwfxdq000di304fmy2p2s5", // 34번 that-that 트랩
  "cmruw7blz004hmml4hsnulpff",
  "cmruw7b2m0049mml48s8e5p2h",
  "cmsip7u35000dl804iqxz1gmx",
];

async function call(prompt: string) {
  const key = process.env.OPENROUTER_API_KEY!;
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 14_000, stream: true, usage: { include: true },
      reasoning: { enabled: true, effort: "high", exclude: false },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok || !res.body) throw new Error(`upstream ${res.status}`);
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = ""; let text = ""; let usage: any = null; let finish: string | null = null;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const l of lines) {
      const t = l.trim(); if (!t.startsWith("data:")) continue;
      const pl = t.slice(5).trim(); if (pl === "[DONE]") continue;
      try { const j = JSON.parse(pl); const c = j.choices?.[0];
        if (c?.finish_reason) finish = c.finish_reason;
        if (c?.delta?.content) text += c.delta.content;
        if (j.usage) usage = j.usage; } catch {}
    }
  }
  return { text, finish, ms: Date.now() - t0, cost: usage?.cost ?? null };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildGrammarKillerV2Prompt, stripGrammarKillerV2Plan, processGrammarKillerV2Quotes } = await import("../src/lib/md-qgen/grammar-killer-v2");
  const { parseMdGrammar, autoSnapGrammarMarks, gateMdQuestion } = await import("../src/lib/md-qgen/parser");
  const { renumberGrammarByAppearance } = await import("../src/lib/md-qgen/luna-lane");
  const { adaptMdGrammarToAiQuestion } = await import("../src/lib/md-qgen/adapter");
  const { postProcessQuestion } = await import("../src/lib/question-postprocess");
  const passages = await prisma.passage.findMany({ where: { id: { in: IDS } }, select: { id: true, title: true, content: true } });
  const rows: any[] = [];
  const feedback = (fb: string) => `\n\n[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${fb}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라.`;
  const runOne = async (p: (typeof passages)[number]) => {
    const row: any = { passage: p.title, id: p.id };
    try {
      const gate = (text: string) => {
        let g = parseMdGrammar(stripGrammarKillerV2Plan(text));
        g = renumberGrammarByAppearance(g).question;
        const sn = autoSnapGrammarMarks(g, p.content);
        const issues = gateMdQuestion(sn.question, p.content, { markerCount: 5, answerCount: 1 });
        const qp = processGrammarKillerV2Quotes(sn.question, p.content);
        return { q: qp.question, issues: [...issues, ...qp.issues] };
      };
      let r = await call(buildGrammarKillerV2Prompt(p.content));
      let g = gate(r.text);
      row.attempts = [{ ms: r.ms, cost: r.cost, finish: r.finish, issues: g.issues }];
      if (g.issues.length) {
        const r2 = await call(buildGrammarKillerV2Prompt(p.content) + feedback(g.issues.join(", ")));
        const g2 = gate(r2.text);
        row.attempts.push({ ms: r2.ms, cost: r2.cost, finish: r2.finish, issues: g2.issues });
        if (g2.issues.length <= g.issues.length) { r = r2; g = g2; }
      }
      row.pass = g.issues.length === 0;
      row.issues = g.issues;
      if (row.pass) {
        const ad = adaptMdGrammarToAiQuestion(g.q, p.content, "KILLER");
        if (ad.ok && ad.aiQuestion) {
          const pp = postProcessQuestion("GRAMMAR_ERROR", p.content, ad.aiQuestion);
          row.aiQuestion = pp.success && pp.data ? pp.data : ad.aiQuestion;
        } else row.adaptError = ad.error;
      }
      row.krw = row.attempts.reduce((s: number, a: any) => s + (a.cost ?? 0), 0) * 1350;
      console.log(`${p.title.slice(0, 30).padEnd(30)} pass=${row.pass ? "Y" : "N"} att=${row.attempts.length} ₩${row.krw.toFixed(1)} ${row.issues.join("; ").slice(0, 120)}`);
    } catch (e) { row.error = String(e); console.log(p.title.slice(0, 30), "ERROR", row.error.slice(0, 100)); }
    rows.push(row);
  };
  await Promise.all(passages.map((p) => runOne(p)));
  writeFileSync("experiments/question-quality-20260715/int-tier-bench-20260819/killer-recheck.json", JSON.stringify({ at: "2026-08-19", rows }, null, 1));
  console.log("saved killer-recheck.json");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
