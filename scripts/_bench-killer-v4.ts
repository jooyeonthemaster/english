// 어법 KILLER 라운드 4 (2026-08-17): 인용-앵커 전면 확장 ("lean-quote-full" = 해설+오답 모두)
// 비교군: round3 의 lean-plan-r2·lean-quote 행을 복사해 3팔 60문항을 같은 패널에서 동시 채점.
// 게이트: 오답 인용 3종(라운드3과 동일) + 해설 인용 2종(표시 지문 축자·정답 표현 포함) +
//        해설 "바로 앞의 X" 대조(정답 마커 기준, 표시 지문 어순).
// 사용: node_modules/.bin/tsx scripts/_bench-killer-v4.ts [--limit 20] [--concurrency 6]

import { loadEnvConfig } from "@next/env";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

const BENCH = path.join(process.cwd(), "experiments/question-quality-20260715/killer-bench-20260817");
const R3 = path.join(BENCH, "round3/gen.json");
const OUT_DIR = path.join(BENCH, "round4");
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
    model: G37, messages: [{ role: "user", content: prompt }],
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

const QUOTE_RE = /^원문\s*[「"']([\s\S]+?)[」"']\s*분석\s*[:：]\s*([\s\S]+)$/;

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const v2 = await import("../experiments/question-quality-20260715/killer-bench-20260817/prompts-v2");
  const { renumberGrammarByAppearance } = await import("../src/lib/md-qgen/luna-lane");
  const { parseMdGrammar, autoSnapGrammarMarks, gateMdQuestion, normalizeWs } = await import("../src/lib/md-qgen/parser");
  const { adaptMdGrammarToAiQuestion } = await import("../src/lib/md-qgen/adapter");
  const { postProcessQuestion } = await import("../src/lib/question-postprocess");
  const { validateQuestionQuality } = await import("../src/lib/question-quality");

  const stripMarkers = (marked: string) => marked.replace(/\[\[([A-J]):([\s\S]*?)\]\]/g, "$2");

  // "바로 앞의 X" 주장 대조 — reference(대조 지문)에서 target 직전 1~2토큰 확인
  const checkImmediatelyBefore = (
    analysis: string, target: string, reference: string, where: string,
  ): string | null => {
    const claim = analysis.match(/바로 앞(?:의|에 있는)?\s*(?:(단수|복수)\s*)?(?:명사(?:구)?|대명사|주어)?\s*([A-Za-z][A-Za-z'-]*)/);
    if (!claim) return null;
    const claimed = claim[2].toLowerCase();
    const norm = normalizeWs(reference);
    const idx = norm.toLowerCase().indexOf(normalizeWs(target).toLowerCase());
    if (idx <= 0) return null;
    const before = norm.slice(0, idx).trim().split(/\s+/).slice(-2)
      .map((t) => t.replace(/[^A-Za-z'-]/g, "").toLowerCase());
    if (!before.includes(claimed)) {
      return `${where}: 분석의 "바로 앞의 ${claim[2]}"가 실제 어순과 다름(직전: ${before.join(" ")})`;
    }
    return null;
  };

  const parseAndGate = (text: string, passage: string) => {
    try {
      let q = parseMdGrammar(stripPlan(text));
      q = renumberGrammarByAppearance(q).question;
      const snapped = autoSnapGrammarMarks(q, passage);
      q = snapped.question;
      const displayed = stripMarkers(q.markedPassage);
      const issues: string[] = [];
      const quotes: Record<string, string> = {};
      // ── 오답 인용(라운드3 동일: 원지문 기준 — 미끼는 shown==original) ──
      const cleanedWrong = q.wrong.map((w) => {
        const m = w.text.match(QUOTE_RE);
        if (!m) { issues.push(`오답 ${w.label}: 인용-분석 형식 위반`); return w; }
        const quote = m[1].trim(); const analysis = m[2].trim();
        quotes[w.label] = quote;
        if (!normalizeWs(passage).includes(normalizeWs(quote)) && !normalizeWs(displayed).includes(normalizeWs(quote))) {
          issues.push(`오답 ${w.label}: 인용이 지문 축자가 아님("${quote.slice(0, 50)}…")`);
        }
        const mk = q.marks.find((x) => x.label === w.label);
        if (mk && !normalizeWs(quote).includes(normalizeWs(mk.shown))) {
          issues.push(`오답 ${w.label}: 인용에 밑줄 표현("${mk.shown}")이 없음`);
        }
        if (mk) {
          const posIssue = checkImmediatelyBefore(analysis, mk.shown, displayed, `오답 ${w.label}`);
          if (posIssue) issues.push(posIssue);
        }
        return { label: w.label, text: analysis };
      });
      // ── 해설 인용(신설: 표시 지문 기준 — 정답 자리는 오형) ──
      let explanation = q.explanation;
      const em = explanation.match(QUOTE_RE);
      if (!em) {
        issues.push("해설: 인용-분석 형식 위반(원문「…」 분석: 필요)");
      } else {
        const quote = em[1].trim(); const analysis = em[2].trim();
        quotes["해설"] = quote;
        if (!normalizeWs(displayed).includes(normalizeWs(quote))) {
          issues.push(`해설: 인용이 표시 지문 축자가 아님("${quote.slice(0, 50)}…")`);
        }
        const ansMark = q.marks.find((x) => x.label === (q.answer ?? q.answers?.[0]));
        if (ansMark && !normalizeWs(quote).includes(normalizeWs(ansMark.shown))) {
          issues.push(`해설: 인용에 정답 밑줄 표현("${ansMark.shown}")이 없음`);
        }
        if (ansMark) {
          const posIssue = checkImmediatelyBefore(analysis, ansMark.shown, displayed, "해설");
          if (posIssue) issues.push(posIssue);
        }
        explanation = analysis;
      }
      q = { ...q, wrong: cleanedWrong, explanation };
      return {
        question: q,
        gateIssues: [...gateMdQuestion(q, passage, { markerCount: 5, answerCount: 1 }), ...issues],
        corrections: snapped.corrections,
        quotes,
      };
    } catch (e) {
      return { question: null as any, gateIssues: [`md 파싱 실패: ${e instanceof Error ? e.message : String(e)}`], corrections: [] as string[], quotes: {} };
    }
  };

  const r3 = JSON.parse(readFileSync(R3, "utf-8")) as { rows: any[] };
  const carried = r3.rows
    .filter((r) => r.arm === "lean-plan-r2" || r.arm === "lean-quote")
    .map((r) => ({ ...r, arm: r.arm === "lean-quote" ? "lean-quote-r3" : r.arm }));
  const passageIds = [...new Set(r3.rows.filter((r) => r.arm === "lean-quote").map((r) => r.passageId as string))].slice(0, LIMIT);
  const passages = await prisma.passage.findMany({ where: { id: { in: passageIds } }, select: { id: true, title: true, content: true } });
  const byId = new Map(passages.map((p) => [p.id, p]));
  const ordered = passageIds.map((id) => byId.get(id)!).filter(Boolean);
  console.log(`passages ${ordered.length}, carried ${carried.length}, dry=${DRY}`);

  const rows: any[] = [...carried];
  let idx = 0;
  const worker = async () => {
    for (;;) {
      const p = ordered[idx++]; if (!p) return;
      const row: any = { arm: "lean-quote-full", model: G37, passageId: p.id, passageTitle: p.title, attempts: [] as any[] };
      const started = Date.now();
      try {
        const prompt = v2.buildLeanKillerPromptFull(p.content);
        if (DRY) { row.promptChars = prompt.length; rows.push(row); console.log(`[dry] ${p.title.slice(0, 30)} prompt=${prompt.length}`); continue; }
        let call = await streamCall(prompt);
        if (!call.text.trim()) { row.attempts.push({ kind: "empty-body", ...call, text: undefined }); call = await streamCall(prompt); }
        let parsed = parseAndGate(call.text, p.content);
        row.attempts.push({ kind: "first", ...call, gateIssues: parsed.gateIssues, corrections: parsed.corrections });
        if (parsed.gateIssues.length > 0) {
          const retry = await streamCall(`${prompt}\n\n[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${parsed.gateIssues.join(", ")}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라. 인용 사유는 지문(해설은 화면 표시 형태)에서 그대로 복사하지 않았다는 뜻이고, "바로 앞" 사유는 위치 서술이 실제 어순과 다르다는 뜻이다 — 인용을 다시 복사하고 인용에 보이는 사실만 서술하라.`);
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
        console.log(`full ${p.title.slice(0, 26).padEnd(26)} pass=${row.finalPass ? "Y" : "N"} att=${row.attempts.length} ${Math.round(row.totalDurationMs / 1000)}s $${row.totalCostUsd.toFixed(4)} flags=${JSON.stringify(row.qualityIssues ?? [])} ${row.finalPass ? "" : "| " + row.finalGateIssues.join("; ").slice(0, 130)}`);
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e); row.totalDurationMs = Date.now() - started; rows.push(row);
        console.log(`full ${p.title.slice(0, 26).padEnd(26)} ERROR ${row.error.slice(0, 160)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), arms: ["lean-plan-r2", "lean-quote-r3", "lean-quote-full"], rows }, null, 2));
  console.log(`saved ${OUT} rows=${rows.length}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
