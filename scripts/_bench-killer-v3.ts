// 어법 KILLER 라운드 3 (2026-08-17): lean-plan + 인용-앵커 오답 분석 ("lean-quote")
// — 해설 날조("바로 앞의 X" 위치·단복수 허위)를 출력 구조(원문 복사 → 분석)로 원천 차단하는지 검증.
// 비교군: 라운드2 lean-plan 20문항을 gen.json 에서 복사("lean-plan-r2") — 같은 패널 재채점으로 채점자 분산 차단.
// 신설 게이트(얇은 백스톱): 오답 인용이 지문 축자 부분 문자열인지 + "바로 앞의 X" 주장 위치·단복수 대조.
// 사용: node_modules/.bin/tsx scripts/_bench-killer-v3.ts [--limit 20] [--concurrency 6]

import { loadEnvConfig } from "@next/env";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

const BENCH = path.join(process.cwd(), "experiments/question-quality-20260715/killer-bench-20260817");
const R2 = path.join(BENCH, "round2/gen.json");
const OUT_DIR = path.join(BENCH, "round3");
const OUT = path.join(OUT_DIR, "gen.json");
const G37 = "google/gemini-3.7-flash";

const args = process.argv.slice(2);
const argVal = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const LIMIT = Number(argVal("--limit") ?? "20");
const CONC = Number(argVal("--concurrency") ?? "6");
const DRY = args.includes("--dry");

interface CallResult {
  text: string; reasoningChars: number; durationMs: number; costUsd: number | null;
  inputTokens: number; outputTokens: number; provider: string | null; finishReason: string | null;
  errorChunk: string | null; usageArrived: boolean;
}

async function streamCall(prompt: string, timeoutMs = 240_000): Promise<CallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");
  const body = {
    model: G37,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 14_000, stream: true, usage: { include: true },
    reasoning: { enabled: true, effort: "high", exclude: false },
  };
  const started = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok || !res.body) throw new Error(`upstream ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ""; let text = ""; let reasoningChars = 0;
  let provider: string | null = null; let finishReason: string | null = null; let errorChunk: string | null = null;
  let usage: any = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        if (typeof j.provider === "string" && !provider) provider = j.provider;
        if (j.error && !errorChunk) errorChunk = JSON.stringify(j.error).slice(0, 300);
        const choice = j.choices?.[0]; const delta = choice?.delta ?? {};
        if (choice?.finish_reason) finishReason = String(choice.finish_reason);
        const r: string = delta.reasoning ?? delta.reasoning_content ?? ""; if (r) reasoningChars += r.length;
        const c: string = delta.content ?? ""; if (c) text += c;
        if (j.usage) usage = j.usage;
      } catch { /* partial */ }
    }
  }
  return {
    text, reasoningChars, durationMs: Date.now() - started,
    costUsd: typeof usage?.cost === "number" && usage.cost > 0 ? usage.cost : null,
    inputTokens: usage?.prompt_tokens ?? 0, outputTokens: usage?.completion_tokens ?? 0,
    provider, finishReason, errorChunk, usageArrived: usage !== null,
  };
}

function stripPlan(text: string): string {
  const i = text.indexOf("밑줄지문:");
  return i > 0 ? text.slice(i) : text;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const v2 = await import("../experiments/question-quality-20260715/killer-bench-20260817/prompts-v2");
  const { renumberGrammarByAppearance } = await import("../src/lib/md-qgen/luna-lane");
  const { parseMdGrammar, autoSnapGrammarMarks, gateMdQuestion, normalizeWs } = await import("../src/lib/md-qgen/parser");
  const { adaptMdGrammarToAiQuestion } = await import("../src/lib/md-qgen/adapter");
  const { postProcessQuestion } = await import("../src/lib/question-postprocess");
  const { validateQuestionQuality } = await import("../src/lib/question-quality");

  // ── 인용-앵커 오답 분석: 파싱·게이트·정리 ──────────────────────────────────
  // wrong.text = `원문「...」 분석: ...` → 인용 검증 후 분석부만 남긴다.
  const QUOTE_RE = /^원문\s*[「"']([\s\S]+?)[」"']\s*분석\s*[:：]\s*([\s\S]+)$/;
  const splitQuoteWrong = (
    wrong: Array<{ label: string; text: string }>,
    passage: string,
    marks: Array<{ label: string; shown: string }>,
  ) => {
    const issues: string[] = [];
    const quotes: Record<string, string> = {};
    const cleaned = wrong.map((w) => {
      const m = w.text.match(QUOTE_RE);
      if (!m) {
        issues.push(`오답 ${w.label}: 인용-분석 형식 위반(원문「…」 분석: 필요)`);
        return w;
      }
      const quote = m[1].trim();
      const analysis = m[2].trim();
      quotes[w.label] = quote;
      // (1) 인용 = 지문 축자 부분 문자열
      if (!normalizeWs(passage).includes(normalizeWs(quote))) {
        issues.push(`오답 ${w.label}: 인용이 지문 축자가 아님("${quote.slice(0, 50)}…")`);
      }
      // (2) 인용에 해당 밑줄 표현 포함
      const mk = marks.find((x) => x.label === w.label);
      if (mk && !normalizeWs(quote).includes(normalizeWs(mk.shown))) {
        issues.push(`오답 ${w.label}: 인용에 밑줄 표현("${mk.shown}")이 없음`);
      }
      // (3) "바로 앞의 X" 주장 대조 — X가 실제로 그 밑줄 직전 1~2토큰인지
      const claim = analysis.match(/바로 앞(?:의|에 있는)?\s*(?:(단수|복수)\s*)?(?:명사(?:구)?|대명사|주어)?\s*([A-Za-z][A-Za-z'-]*)/);
      if (claim && mk) {
        const claimed = claim[2].toLowerCase();
        const norm = normalizeWs(passage);
        const idx = norm.toLowerCase().indexOf(normalizeWs(mk.shown).toLowerCase());
        if (idx > 0) {
          const before = norm.slice(0, idx).trim().split(/\s+/).slice(-2)
            .map((t) => t.replace(/[^A-Za-z'-]/g, "").toLowerCase());
          if (!before.includes(claimed)) {
            issues.push(
              `오답 ${w.label}: 분석의 "바로 앞의 ${claim[2]}"가 실제 어순과 다름(직전 단어: ${before.join(" ")})`,
            );
          }
        }
      }
      return { label: w.label, text: analysis };
    });
    return { cleaned, issues, quotes };
  };

  const parseAndGate = (text: string, passage: string) => {
    try {
      let q = parseMdGrammar(stripPlan(text));
      q = renumberGrammarByAppearance(q).question;
      const snapped = autoSnapGrammarMarks(q, passage);
      q = snapped.question;
      const split = splitQuoteWrong(q.wrong, passage, q.marks);
      q = { ...q, wrong: split.cleaned };
      return {
        question: q,
        gateIssues: [
          ...gateMdQuestion(q, passage, { markerCount: 5, answerCount: 1 }),
          ...split.issues,
        ],
        corrections: snapped.corrections,
        quotes: split.quotes,
      };
    } catch (e) {
      return { question: null as any, gateIssues: [`md 파싱 실패: ${e instanceof Error ? e.message : String(e)}`], corrections: [] as string[], quotes: {} };
    }
  };

  const r2 = JSON.parse(readFileSync(R2, "utf-8")) as { rows: any[] };
  const planRows = r2.rows.filter((r) => r.arm === "lean-plan").slice(0, LIMIT);
  const passageIds = planRows.map((r) => r.passageId as string);
  const passages = await prisma.passage.findMany({ where: { id: { in: passageIds } }, select: { id: true, title: true, content: true } });
  const byId = new Map(passages.map((p) => [p.id, p]));
  const ordered = passageIds.map((id) => byId.get(id)!).filter(Boolean);
  console.log(`passages ${ordered.length}, dry=${DRY}`);

  const rows: any[] = planRows.map((r) => ({ ...r, arm: "lean-plan-r2" }));
  let idx = 0;
  const worker = async () => {
    for (;;) {
      const p = ordered[idx++]; if (!p) return;
      const row: any = { arm: "lean-quote", model: G37, passageId: p.id, passageTitle: p.title, attempts: [] as any[] };
      const started = Date.now();
      try {
        const prompt = v2.buildLeanKillerPrompt(p.content, { plan: true, quoteWrong: true });
        if (DRY) { row.promptChars = prompt.length; rows.push(row); console.log(`[dry] ${p.title.slice(0, 30)} prompt=${prompt.length}`); continue; }
        let call = await streamCall(prompt);
        if (!call.text.trim()) { row.attempts.push({ kind: "empty-body", ...call, text: undefined }); call = await streamCall(prompt); }
        let parsed = parseAndGate(call.text, p.content);
        row.attempts.push({ kind: "first", ...call, gateIssues: parsed.gateIssues, corrections: parsed.corrections });
        if (parsed.gateIssues.length > 0) {
          const retry = await streamCall(`${prompt}\n\n[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${parsed.gateIssues.join(", ")}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라. 인용 관련 사유는 지문에서 그대로 복사하지 않았다는 뜻이다 — 해당 밑줄 주변을 지문에서 다시 찾아 한 글자도 바꾸지 말고 옮겨 적어라.`);
          const rp = parseAndGate(retry.text, p.content);
          row.attempts.push({ kind: "gate-retry", ...retry, gateIssues: rp.gateIssues, corrections: rp.corrections });
          if (rp.gateIssues.length <= parsed.gateIssues.length) { call = retry; parsed = rp; }
        }
        row.finalPass = parsed.gateIssues.length === 0;
        row.finalGateIssues = parsed.gateIssues;
        row.rawText = call.text;
        row.quotes = parsed.quotes;
        if (row.finalPass && parsed.question) {
          row.parsed = parsed.question;
          const adapt = adaptMdGrammarToAiQuestion(parsed.question, p.content, "KILLER");
          if (adapt.ok && adapt.aiQuestion) {
            const pp = postProcessQuestion("GRAMMAR_ERROR", p.content, adapt.aiQuestion);
            const q = (pp.success && pp.data ? pp.data : adapt.aiQuestion) as Record<string, unknown>;
            row.aiQuestion = q;
            const issues = validateQuestionQuality({ typeId: "GRAMMAR_ERROR", question: q, passage: p.content, requestedDifficulty: "KILLER", grammarMarkerCount: 5, grammarAnswerCount: 1 });
            row.qualityIssues = issues.filter((i) => i.severity === "error").map((i) => i.code);
            row.qualityWarnings = issues.filter((i) => i.severity !== "error").map((i) => i.code);
          } else row.adaptError = adapt.error ?? "adapt failed";
        }
        row.totalDurationMs = Date.now() - started;
        row.totalCostUsd = row.attempts.reduce((s: number, a: any) => s + (a.costUsd ?? 0), 0);
        rows.push(row);
        console.log(`lean-quote ${p.title.slice(0, 26).padEnd(26)} pass=${row.finalPass ? "Y" : "N"} att=${row.attempts.length} ${Math.round(row.totalDurationMs / 1000)}s $${row.totalCostUsd.toFixed(4)} flags=${JSON.stringify(row.qualityIssues ?? [])} ${row.finalPass ? "" : "| " + row.finalGateIssues.join("; ").slice(0, 120)}`);
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e); row.totalDurationMs = Date.now() - started; rows.push(row);
        console.log(`lean-quote ${p.title.slice(0, 26).padEnd(26)} ERROR ${row.error.slice(0, 160)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), arms: ["lean-plan-r2", "lean-quote"], rows }, null, 2));
  console.log(`saved ${OUT} rows=${rows.length}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
