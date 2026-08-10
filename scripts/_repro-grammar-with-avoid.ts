// 어법 반려 재현 v2 (26-07-22) — 프로덕션 조건 완전 재현: 표적 회피 목록 주입.
// 가설: 맨몸 프롬프트는 9/9 통과인데 프로덕션이 21% 반려 → 회피 압박이 변수.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const JOBS = [
  "cmruyansj000fmmiwcp7vdn7f",
  "cmruw88is004xmml4rzyaowkt",
  "cmrus3r6v0021mml4nlv2rl0a",
];
const RUNS = 3;

async function callFlash3(prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 14000,
      reasoning: { enabled: true, effort: "high", exclude: true },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  return ((await res.json()) as any)?.choices?.[0]?.message?.content ?? "";
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdGrammarPrompt } = await import("../src/lib/md-qgen/prompts");
  const { parseMdGrammar, autoSnapGrammarMarks, gateMdQuestion } = await import("../src/lib/md-qgen/parser");

  const tally: Record<string, number> = {};
  let total = 0, rejected = 0;
  for (const jobId of JOBS) {
    const job = await prisma.workbenchAiJob.findUnique({ where: { id: jobId }, select: { passageId: true } });
    if (!job?.passageId) continue;
    const passage = await prisma.passage.findUnique({ where: { id: job.passageId }, select: { id: true, title: true, content: true } });
    if (!passage) continue;
    // 프로덕션과 동일한 회피 목록 구성(같은 지문의 기존 문항 표적)
    const qs = await prisma.question.findMany({
      where: { passageId: passage.id, deletedAt: null, subType: { in: ["BLANK_INFERENCE", "GRAMMAR_ERROR"] } },
      orderBy: { createdAt: "desc" }, take: 8, select: { structuredData: true },
    });
    const targets: string[] = [];
    for (const q of qs) {
      try {
        const d = (typeof q.structuredData === "string" ? JSON.parse(q.structuredData) : q.structuredData) as Record<string, any>;
        if (typeof d?.originalExpression === "string" && d.originalExpression.trim()) targets.push(d.originalExpression.trim().slice(0, 90));
        if (Array.isArray(d?.markedExpressions)) {
          const err = d.markedExpressions.find((m: any) => m?.isError === true);
          if (typeof err?.expression === "string") targets.push(err.expression.trim().slice(0, 90));
        }
      } catch {}
    }
    const unique = [...new Set(targets)].slice(0, 8);
    const avoid = unique.length
      ? `\n\n## 표적 회피 — 이 지문에서 이미 출제된 자리(정답·빈칸이 겹치지 않게 하라)\n${unique.map((t) => `- ${t}`).join("\n")}`
      : "";
    console.log(`\n═══ ${passage.title?.slice(0, 40)} — 회피 표적 ${unique.length}개 ═══`);

    const runs = Array.from({ length: RUNS }, async (_, i) => {
      const prompt = buildMdGrammarPrompt(passage.content, "full", "KILLER") + avoid;
      const t0 = Date.now();
      const text = await callFlash3(prompt);
      let issues: string[] = [];
      try {
        let q = parseMdGrammar(text);
        q = autoSnapGrammarMarks(q, passage.content).question;
        issues = gateMdQuestion(q, passage.content);
      } catch (e) { issues = [`파서 예외: ${e instanceof Error ? e.message : String(e)}`]; }
      return { i, sec: ((Date.now() - t0) / 1000).toFixed(0), issues };
    });
    for (const r of await Promise.all(runs)) {
      total += 1;
      if (r.issues.length) rejected += 1;
      console.log(`  run${r.i + 1} ${r.sec}s ${r.issues.length ? "REJECT" : "PASS"}`);
      for (const it of r.issues) { console.log(`    ✗ ${it.slice(0, 160)}`); tally[it.slice(0, 50)] = (tally[it.slice(0, 50)] ?? 0) + 1; }
    }
  }
  console.log(`\n══ 회피목록 포함 총계: ${total}회 중 반려 ${rejected}회 (${((rejected / Math.max(1, total)) * 100).toFixed(0)}%) ══`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${v}회: ${k}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
