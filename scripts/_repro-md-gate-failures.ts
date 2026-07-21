// md 게이트 반려 재현 (26-07-22) — 실패 4잡의 실제 지문으로 동일 프롬프트·파서·
// 게이트를 각 3회 재실행해 반려 사유 분포를 실측한다. 프로덕션과 동일 조건:
// flash3 + reasoning high + max_tokens 14k + v2 full 해설 + autosnap 후 게이트.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const FAILED_JOBS = [
  { jobId: "cmruyansj000fmmiwcp7vdn7f", type: "GRAMMAR_ERROR" },
  { jobId: "cmruw88is004xmml4rzyaowkt", type: "GRAMMAR_ERROR" },
  { jobId: "cmrus3r6v0021mml4nlv2rl0a", type: "GRAMMAR_ERROR" },
  { jobId: "cmruw8gsc0055mml4j4it953t", type: "BLANK_INFERENCE" },
];
const RUNS_PER_PASSAGE = 3;

async function callFlash3(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 14000,
      reasoning: { enabled: true, effort: "high", exclude: true },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as any;
  return json?.choices?.[0]?.message?.content ?? "";
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const {
    buildMdBlankPrompt, buildMdGrammarPrompt,
  } = await import("../src/lib/md-qgen/prompts");
  const {
    parseMdBlank, parseMdGrammar, autoSnapGrammarMarks, gateMdQuestion,
  } = await import("../src/lib/md-qgen/parser");

  const tally: Record<string, number> = {};
  let total = 0, rejected = 0;

  for (const f of FAILED_JOBS) {
    const job = await prisma.workbenchAiJob.findUnique({
      where: { id: f.jobId }, select: { passageId: true, title: true },
    });
    if (!job?.passageId) { console.log(`${f.jobId}: passage 없음`); continue; }
    const passage = await prisma.passage.findUnique({
      where: { id: job.passageId }, select: { content: true, title: true },
    });
    if (!passage) { console.log(`${f.jobId}: passage 행 없음`); continue; }
    console.log(`\n═══ ${f.type} · ${passage.title?.slice(0, 40)} (${passage.content.length}자) ═══`);

    const runs = Array.from({ length: RUNS_PER_PASSAGE }, async (_, i) => {
      const prompt = f.type === "BLANK_INFERENCE"
        ? buildMdBlankPrompt(passage.content, "full", "KILLER")
        : buildMdGrammarPrompt(passage.content, "full", "KILLER");
      const t0 = Date.now();
      const text = await callFlash3(prompt);
      let issues: string[] = [];
      let corrections: string[] = [];
      try {
        if (f.type === "BLANK_INFERENCE") {
          const q = parseMdBlank(text);
          issues = gateMdQuestion(q, passage.content);
        } else {
          let q = parseMdGrammar(text);
          const snapped = autoSnapGrammarMarks(q, passage.content);
          q = snapped.question;
          corrections = snapped.corrections;
          issues = gateMdQuestion(q, passage.content);
        }
      } catch (e) {
        issues = [`파서 예외: ${e instanceof Error ? e.message : String(e)}`];
      }
      return { i, sec: ((Date.now() - t0) / 1000).toFixed(0), issues, corrections, tail: text.slice(-120) };
    });
    for (const r of await Promise.all(runs)) {
      total += 1;
      if (r.issues.length > 0) rejected += 1;
      const label = r.issues.length === 0 ? "PASS" : "REJECT";
      console.log(`  run${r.i + 1} ${r.sec}s ${label}${r.corrections.length ? ` (자동보정 ${r.corrections.length}건)` : ""}`);
      for (const issue of r.issues) {
        console.log(`    ✗ ${issue.slice(0, 180)}`);
        const key = issue.slice(0, 60);
        tally[key] = (tally[key] ?? 0) + 1;
      }
    }
  }

  console.log(`\n══ 총계: ${total}회 중 반려 ${rejected}회 (${((rejected / Math.max(1, total)) * 100).toFixed(0)}%) ══`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${v}회: ${k}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
