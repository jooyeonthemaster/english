// 어법 KILLER 개선 라운드 2 (2026-08-17): gemini-3.7-flash 프롬프트 v2 변형 4종 vs 오늘 기준선(g37-p0)
//   lean       : 재설계 린 프롬프트(실물 해부 + 킬러 자리 목록 + 설계 절차), 규칙 목록·pointFocus 블록 제거
//   lean-plan  : lean + 출력 최상단 설계메모(후보 3개·선택) 가시화
//   lean-regen : lean + 검증기 KILLER 반려 플래그 → 표적 재생성 1회
//   lean-2stage: 자리 지도 콜 → 작성 콜 (2콜)
// 기준선 base-p0 는 round1 gen.json 의 g37-p0 행을 그대로 복사(재생성 없음, 같은 패널에서 재채점).
// 사용: node_modules/.bin/tsx scripts/_bench-killer-v2.ts [--arms lean,lean-plan,lean-regen,lean-2stage] [--limit 20] [--concurrency 6]

import { loadEnvConfig } from "@next/env";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

type Arm = "lean" | "lean-plan" | "lean-regen" | "lean-2stage";
const BENCH = path.join(process.cwd(), "experiments/question-quality-20260715/killer-bench-20260817");
const R1 = path.join(BENCH, "gen.json");
const OUT_DIR = path.join(BENCH, "round2");
const OUT = path.join(OUT_DIR, "gen.json");
const G37 = "google/gemini-3.7-flash";

const args = process.argv.slice(2);
const argVal = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const ARMS = (argVal("--arms") ?? "lean,lean-plan,lean-regen,lean-2stage").split(",") as Arm[];
const LIMIT = Number(argVal("--limit") ?? "20");
const CONC = Number(argVal("--concurrency") ?? "6");
const DRY = args.includes("--dry");

const KILLER_FLAGS = new Set([
  "grammar-killer-overdrilled-answer",
  "grammar-obvious-adjacent-sv-agreement",
  "grammar-killer-thin-answer",
  "grammar-too-basic-decoys",
  "grammar-weak-filler-decoys",
  "grammar-decoy-filler-span",
  "grammar-shallow-participle-adjective-answer",
  "grammar-obvious-noun-what-relative",
  "grammar-killer-generic-answer-point",
  "grammar-obvious-local-agreement",
]);

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
    max_tokens: 14_000,
    stream: true,
    usage: { include: true },
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

function gateFeedback(issues: string[]): string {
  const fb = issues.join(", ");
  const needsSpread = /인접/.test(fb); const needsNarrow = /구·절/.test(fb);
  return `[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${fb}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라.${
    needsSpread ? " 인접 사유는 밑줄 배치 문제다 — 붙어 있는 두 밑줄 중 하나를 지문의 떨어진 다른 부분으로 옮겨라." : ""
  }${needsNarrow ? " 구·절 사유는 밑줄 범위 문제다 — 판정을 결정짓는 핵심 단어 1개로 밑줄을 좁혀 다시 그어라." : ""}`;
}

function stripPlan(text: string): string {
  const i = text.indexOf("밑줄지문:");
  return i > 0 ? text.slice(i) : text;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const v2 = await import("../experiments/question-quality-20260715/killer-bench-20260817/prompts-v2");
  const { renumberGrammarByAppearance } = await import("../src/lib/md-qgen/luna-lane");
  const { parseMdGrammar, autoSnapGrammarMarks, gateMdQuestion } = await import("../src/lib/md-qgen/parser");
  const { adaptMdGrammarToAiQuestion } = await import("../src/lib/md-qgen/adapter");
  const { postProcessQuestion } = await import("../src/lib/question-postprocess");
  const { validateQuestionQuality } = await import("../src/lib/question-quality");

  const r1 = JSON.parse(readFileSync(R1, "utf-8")) as { rows: any[] };
  const baseRows = r1.rows.filter((r) => r.arm === "g37-p0").slice(0, LIMIT);
  const passageIds = baseRows.map((r) => r.passageId as string);
  const passages = await prisma.passage.findMany({ where: { id: { in: passageIds } }, select: { id: true, title: true, content: true } });
  const byId = new Map(passages.map((p) => [p.id, p]));
  const ordered = passageIds.map((id) => byId.get(id)!).filter(Boolean);
  console.log(`passages ${ordered.length}, arms ${ARMS.join(",")}, dry=${DRY}`);

  const parseAndGate = (text: string, passage: string) => {
    try {
      let q = parseMdGrammar(stripPlan(text));
      q = renumberGrammarByAppearance(q).question;
      const snapped = autoSnapGrammarMarks(q, passage);
      return { question: snapped.question, gateIssues: gateMdQuestion(snapped.question, passage, { markerCount: 5, answerCount: 1 }), corrections: snapped.corrections };
    } catch (e) {
      return { question: null as any, gateIssues: [`md 파싱 실패: ${e instanceof Error ? e.message : String(e)}`], corrections: [] as string[] };
    }
  };
  const evaluate = (question: any, passage: string) => {
    const adapt = adaptMdGrammarToAiQuestion(question, passage, "KILLER");
    if (!adapt.ok || !adapt.aiQuestion) return { aiQuestion: null, issues: [] as string[], warnings: [] as string[], messages: [] as string[], adaptError: adapt.error ?? "adapt failed" };
    const pp = postProcessQuestion("GRAMMAR_ERROR", passage, adapt.aiQuestion);
    const q = (pp.success && pp.data ? pp.data : adapt.aiQuestion) as Record<string, unknown>;
    const all = validateQuestionQuality({ typeId: "GRAMMAR_ERROR", question: q, passage, requestedDifficulty: "KILLER", grammarMarkerCount: 5, grammarAnswerCount: 1 });
    const errs = all.filter((i) => i.severity === "error");
    return {
      aiQuestion: q,
      issues: errs.map((i) => i.code),
      warnings: all.filter((i) => i.severity !== "error").map((i) => i.code),
      messages: errs.filter((i) => KILLER_FLAGS.has(i.code)).map((i) => `${i.code}: ${i.message}`),
      adaptError: null as string | null,
    };
  };

  const tasks: Array<{ arm: Arm; p: { id: string; title: string; content: string } }> = [];
  for (const p of ordered) for (const arm of ARMS) tasks.push({ arm, p });
  const rows: any[] = baseRows.map((r) => ({ ...r, arm: "base-p0" }));
  let idx = 0;
  const worker = async () => {
    for (;;) {
      const t = tasks[idx++]; if (!t) return;
      const row: any = { arm: t.arm, model: G37, passageId: t.p.id, passageTitle: t.p.title, attempts: [] as any[] };
      const started = Date.now();
      try {
        const passage = t.p.content;
        if (DRY) {
          row.promptChars = t.arm === "lean-2stage" ? v2.buildSlotMapPrompt(passage).length : v2.buildLeanKillerPrompt(passage, { plan: t.arm === "lean-plan" }).length;
          rows.push(row); console.log(`[dry] ${t.arm} ${t.p.title.slice(0, 30)} prompt=${row.promptChars}`); continue;
        }
        let planText: string | null = null;
        const buildFirst = async (): Promise<string> => {
          if (t.arm === "lean-2stage") {
            const plan = await streamCall(v2.buildSlotMapPrompt(passage));
            row.attempts.push({ kind: "plan", ...plan });
            planText = plan.text;
            return v2.buildWriteFromPlanPrompt(passage, planText);
          }
          return v2.buildLeanKillerPrompt(passage, { plan: t.arm === "lean-plan" });
        };
        const firstPrompt = await buildFirst();
        let call = await streamCall(firstPrompt);
        if (!call.text.trim()) { row.attempts.push({ kind: "empty-body", ...call, text: undefined }); call = await streamCall(firstPrompt); }
        let parsed = parseAndGate(call.text, passage);
        row.attempts.push({ kind: "first", ...call, gateIssues: parsed.gateIssues, corrections: parsed.corrections });
        // 게이트 반려 → 1회 재생성 (프로덕션 정책)
        if (parsed.gateIssues.length > 0) {
          const retryPrompt = `${firstPrompt}\n\n${gateFeedback(parsed.gateIssues)}`;
          const retry = await streamCall(retryPrompt);
          const rp = parseAndGate(retry.text, passage);
          row.attempts.push({ kind: "gate-retry", ...retry, gateIssues: rp.gateIssues, corrections: rp.corrections });
          if (rp.gateIssues.length <= parsed.gateIssues.length) { call = retry; parsed = rp; }
        }
        let evalRes = parsed.gateIssues.length === 0 && parsed.question ? evaluate(parsed.question, passage) : null;
        // lean-regen: KILLER 플래그 → 표적 재생성 1회
        if (t.arm === "lean-regen" && evalRes && evalRes.messages.length > 0) {
          const fb = `[품질 재설계] 직전 문항이 KILLER 품질 검사에서 다음 사유로 반려되었다:\n${evalRes.messages.map((m) => `- ${m}`).join("\n")}\n지적된 자리(정답 또는 미끼)를 버리고, 위 "킬러 정답이 사는 자리" 목록에서 판정 단서가 더 먼 다른 문장의 자리로 옮겨 처음부터 다시 설계하라. 같은 자리·같은 표현을 고집하지 마라.`;
          const regen = await streamCall(`${firstPrompt}\n\n${fb}`);
          const rp = parseAndGate(regen.text, passage);
          const re = rp.gateIssues.length === 0 && rp.question ? evaluate(rp.question, passage) : null;
          row.attempts.push({ kind: "quality-regen", ...regen, gateIssues: rp.gateIssues, corrections: rp.corrections, qualityIssues: re?.issues ?? null });
          const before = evalRes.messages.length; const after = re ? re.messages.length : Infinity;
          if (rp.gateIssues.length === 0 && re && after < before) { call = regen; parsed = rp; evalRes = re; row.regenAdopted = true; }
          else row.regenAdopted = false;
        }
        row.finalPass = parsed.gateIssues.length === 0;
        row.finalGateIssues = parsed.gateIssues;
        row.rawText = call.text;
        row.planText = planText;
        if (row.finalPass && parsed.question) {
          row.parsed = parsed.question;
          if (evalRes) { row.aiQuestion = evalRes.aiQuestion; row.qualityIssues = evalRes.issues; row.qualityWarnings = evalRes.warnings; row.adaptError = evalRes.adaptError; }
        }
        row.totalDurationMs = Date.now() - started;
        row.totalCostUsd = row.attempts.reduce((s: number, a: any) => s + (a.costUsd ?? 0), 0);
        rows.push(row);
        console.log(`${t.arm.padEnd(11)} ${t.p.title.slice(0, 26).padEnd(26)} pass=${row.finalPass ? "Y" : "N"} att=${row.attempts.length}${row.regenAdopted !== undefined ? (row.regenAdopted ? " regen✓" : " regen✗") : ""} ${Math.round(row.totalDurationMs / 1000)}s $${row.totalCostUsd.toFixed(4)} flags=${JSON.stringify(row.qualityIssues ?? [])} ${row.finalPass ? "" : "| " + row.finalGateIssues.join("; ").slice(0, 100)}`);
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e); row.totalDurationMs = Date.now() - started; rows.push(row);
        console.log(`${t.arm.padEnd(11)} ${t.p.title.slice(0, 26).padEnd(26)} ERROR ${row.error.slice(0, 160)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), arms: ["base-p0", ...ARMS], rows }, null, 2));
  console.log(`saved ${OUT} rows=${rows.length}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
