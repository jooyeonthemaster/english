// 어법 KILLER 결정 벤치 (2026-08-17): luna(P0) vs gemini-3.7-flash(P0) vs 3.7 현행(대조)
// — 프로덕션 md-stream 과 동일 빌더·게이트·재생성 정책(반려 1회 재생성)·콜 옵션으로
// 20 기출 지문 × 3팔 = 60문항 생성. 채점(블라인드 솔버·루브릭)은 별도 에이전트 패널.
//
// 사용: node_modules/.bin/tsx scripts/_bench-killer-37-vs-luna.ts [--arms luna-p0,g37-p0,g37-asis] [--limit N] [--concurrency 6]
// 출력: experiments/question-quality-20260715/killer-bench-20260817/gen.json
//
// 발사 전 잔액 확인(GET /api/v1/credits) — 캠페인 규칙.

import { loadEnvConfig } from "@next/env";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

type Arm = "luna-p0" | "g37-p0" | "g37-asis";
const OUT_DIR = path.join(
  process.cwd(),
  "experiments/question-quality-20260715/killer-bench-20260817",
);
const OUT = path.join(OUT_DIR, "gen.json");
const R3 = path.join(
  process.cwd(),
  "experiments/question-quality-20260715/luna-bench-20260814/gen-r3.json",
);

const args = process.argv.slice(2);
const argVal = (k: string): string | undefined => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const ARMS = (argVal("--arms") ?? "luna-p0,g37-p0,g37-asis").split(",") as Arm[];
const LIMIT = Number(argVal("--limit") ?? "20");
const CONC = Number(argVal("--concurrency") ?? "6");
const DRY = args.includes("--dry");

interface CallResult {
  text: string;
  reasoningChars: number;
  durationMs: number;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number | null;
  provider: string | null;
  finishReason: string | null;
  errorChunk: string | null;
  usageArrived: boolean;
}

async function streamCall(a: {
  model: string;
  prompt: string;
  luna: boolean;
  timeoutMs: number;
}): Promise<CallResult> {
  const {
    LUNA_QGEN_SYSTEM_MESSAGE,
    LUNA_GRAMMAR_JSON_SCHEMA,
    LUNA_QGEN_MAX_TOKENS,
  } = await import("../src/lib/md-qgen/luna-lane");
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");
  const body: Record<string, unknown> = {
    model: a.model,
    messages: a.luna
      ? [
          { role: "system", content: LUNA_QGEN_SYSTEM_MESSAGE },
          { role: "user", content: a.prompt },
        ]
      : [{ role: "user", content: a.prompt }],
    max_tokens: a.luna ? LUNA_QGEN_MAX_TOKENS : 14_000,
    stream: true,
    usage: { include: true },
    reasoning: { enabled: true, effort: "high", exclude: false },
  };
  if (a.luna) {
    body.response_format = { type: "json_schema", json_schema: LUNA_GRAMMAR_JSON_SCHEMA };
    body.provider = { order: ["openai"], allow_fallbacks: false };
  }
  const started = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(a.timeoutMs),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`upstream ${res.status}: ${detail.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let reasoningChars = 0;
  let provider: string | null = null;
  let finishReason: string | null = null;
  let errorChunk: string | null = null;
  let usage: Record<string, unknown> | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        if (typeof j.provider === "string" && !provider) provider = j.provider;
        if (j.error && !errorChunk) errorChunk = JSON.stringify(j.error).slice(0, 300);
        const choice = j.choices?.[0];
        const delta = choice?.delta ?? {};
        if (choice?.finish_reason) finishReason = String(choice.finish_reason);
        const r: string = delta.reasoning ?? delta.reasoning_content ?? "";
        if (r) reasoningChars += r.length;
        const c: string = delta.content ?? "";
        if (c) text += c;
        if (j.usage) usage = j.usage;
      } catch {
        /* partial */
      }
    }
  }
  const u = usage as Record<string, any> | null;
  return {
    text,
    reasoningChars,
    durationMs: Date.now() - started,
    costUsd: typeof u?.cost === "number" && u.cost > 0 ? u.cost : null,
    inputTokens: u?.prompt_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
    reasoningTokens: u?.completion_tokens_details?.reasoning_tokens ?? null,
    provider,
    finishReason,
    errorChunk,
    usageArrived: usage !== null,
  };
}

function feedbackBlock(feedback: string): string {
  const needsRelocation = /누설|정답 시비|네모 밖|밑줄 밖|그대로 남아/.test(feedback);
  const needsSpread = /인접/.test(feedback);
  const needsNarrow = /구·절/.test(feedback);
  return `[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${feedback}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라.${
    needsRelocation
      ? " 누설·정답 시비 사유는 지문 원문이 그 표현을 이미 포함하고 있다는 뜻이다 — 같은 자리·같은 후보쌍으로는 절대 해소되지 않으니, 지적된 표적을 버리고 **다른 문장의 다른 포인트로 교체**해 설계하라(지문 본문 수정은 금지)."
      : ""
  }${
    needsSpread
      ? " 인접 사유는 밑줄 배치 문제다 — 붙어 있는 두 밑줄 중 하나를 지문의 떨어진 다른 부분의 확정적 포인트로 옮겨라. 포인트 다양성(코드 종류)을 줄이는 한이 있어도 위치 분산이 우선이다(같은 코드 2회까지 허용)."
      : ""
  }${
    needsNarrow
      ? " 구·절 사유는 밑줄 범위 문제다 — 포인트를 교체할 필요 없이, 판정을 결정짓는 핵심 단어 1개(불가피하면 2단어)로 밑줄을 좁혀 다시 그어라."
      : ""
  }`;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdGrammarPrompt, buildGrammarMdSharedSelfcheck } = await import(
    "../src/lib/md-qgen/prompts"
  );
  const { buildGrammarPointGuidance } = await import("../src/lib/grammar-point-catalog");
  const {
    LUNA_GRAMMAR_SELFCHECK,
    LUNA_QGEN_MODEL_ID,
    adaptLunaGrammarJson,
    renumberGrammarByAppearance,
  } = await import("../src/lib/md-qgen/luna-lane");
  const { parseMdGrammar, autoSnapGrammarMarks, gateMdQuestion } = await import(
    "../src/lib/md-qgen/parser"
  );
  const { adaptMdGrammarToAiQuestion } = await import("../src/lib/md-qgen/adapter");
  const { postProcessQuestion } = await import("../src/lib/question-postprocess");
  const { validateQuestionQuality } = await import("../src/lib/question-quality");

  // 지문 20개 — O217 R3 세트 재사용(luna 팔 행의 passageId).
  const r3 = JSON.parse(readFileSync(R3, "utf-8")) as { rows: Array<{ arm: string; passageId: string; passageTitle: string }> };
  const passageIds = [...new Set(r3.rows.filter((r) => r.arm.startsWith("luna")).map((r) => r.passageId))].slice(0, LIMIT);
  const passages = await prisma.passage.findMany({
    where: { id: { in: passageIds } },
    select: { id: true, title: true, content: true },
  });
  const byId = new Map(passages.map((p) => [p.id, p]));
  const ordered = passageIds.map((id) => byId.get(id)!).filter(Boolean);
  console.log(`passages: ${ordered.length}, arms: ${ARMS.join(",")}, dry=${DRY}`);

  const G37 = "google/gemini-3.7-flash";
  const buildPrompt = (arm: Arm, passage: string, feedback: string | null): string => {
    const base = buildMdGrammarPrompt(passage, "full", "KILLER", { markerCount: 5, answerCount: 1 });
    const extras: string[] = [];
    if (arm === "g37-asis") {
      // 현행(P0 이전) 프로덕션: pointFocus 가이드 난이도 미전달 + 검산 블록 없음.
      extras.push(buildGrammarPointGuidance({ pointFocus: true }));
    } else {
      extras.push(
        buildGrammarPointGuidance({
          pointFocus: true,
          requestedDifficulty: "KILLER",
          mode: "judgment",
          answerCount: 1,
        }),
      );
      extras.push(arm === "luna-p0" ? LUNA_GRAMMAR_SELFCHECK : buildGrammarMdSharedSelfcheck(5));
    }
    if (feedback) extras.push(feedbackBlock(feedback));
    return `${base}\n\n${extras.join("\n\n")}`;
  };

  const parseAndGate = (arm: Arm, text: string, passage: string) => {
    try {
      if (arm === "luna-p0") {
        const adapted = adaptLunaGrammarJson(text);
        const snapped = autoSnapGrammarMarks(adapted.question, passage);
        return {
          question: snapped.question,
          gateIssues: [
            ...adapted.issues,
            ...gateMdQuestion(snapped.question, passage, { markerCount: 5, answerCount: 1 }),
          ],
          corrections: [
            ...snapped.corrections,
            ...(adapted.renumbered ? ["luna: 라벨 등장순 재번호"] : []),
            ...adapted.markerInserted.map((l) => `luna: ${l} 마커 자동삽입`),
          ],
        };
      }
      let q = parseMdGrammar(text);
      q = renumberGrammarByAppearance(q).question;
      const snapped = autoSnapGrammarMarks(q, passage);
      return {
        question: snapped.question,
        gateIssues: gateMdQuestion(snapped.question, passage, { markerCount: 5, answerCount: 1 }),
        corrections: snapped.corrections,
      };
    } catch (e) {
      return {
        question: null as any,
        gateIssues: [`${arm === "luna-p0" ? "luna JSON" : "md"} 파싱 실패: ${e instanceof Error ? e.message : String(e)}`],
        corrections: [] as string[],
      };
    }
  };

  const tasks: Array<{ arm: Arm; p: { id: string; title: string; content: string } }> = [];
  for (const p of ordered) for (const arm of ARMS) tasks.push({ arm, p });

  const rows: any[] = [];
  let idx = 0;
  const worker = async () => {
    for (;;) {
      const t = tasks[idx++];
      if (!t) return;
      const model = t.arm === "luna-p0" ? LUNA_QGEN_MODEL_ID : G37;
      const luna = t.arm === "luna-p0";
      const row: any = { arm: t.arm, model, passageId: t.p.id, passageTitle: t.p.title, attempts: [] as any[] };
      const started = Date.now();
      try {
        if (DRY) {
          row.promptChars = buildPrompt(t.arm, t.p.content, null).length;
          rows.push(row);
          console.log(`[dry] ${t.arm} ${t.p.title.slice(0, 30)} prompt=${row.promptChars}`);
          continue;
        }
        let call = await streamCall({ model, prompt: buildPrompt(t.arm, t.p.content, null), luna, timeoutMs: 240_000 });
        // 전송 계층 재시도(EMPTY_BODY) — 프로덕션 동일
        if (!call.text.trim()) {
          row.attempts.push({ kind: "empty-body", ...call, text: undefined });
          call = await streamCall({ model, prompt: buildPrompt(t.arm, t.p.content, null), luna, timeoutMs: 240_000 });
        }
        let parsed = parseAndGate(t.arm, call.text, t.p.content);
        row.attempts.push({ kind: "first", ...call, gateIssues: parsed.gateIssues, corrections: parsed.corrections });
        if (parsed.gateIssues.length > 0) {
          const fb = parsed.gateIssues.join(", ");
          const retry = await streamCall({ model, prompt: buildPrompt(t.arm, t.p.content, fb), luna, timeoutMs: 240_000 });
          const rp = parseAndGate(t.arm, retry.text, t.p.content);
          row.attempts.push({ kind: "retry", ...retry, gateIssues: rp.gateIssues, corrections: rp.corrections });
          if (rp.gateIssues.length <= parsed.gateIssues.length) {
            call = retry;
            parsed = rp;
          }
        }
        row.finalPass = parsed.gateIssues.length === 0;
        row.finalGateIssues = parsed.gateIssues;
        row.rawText = call.text;
        if (row.finalPass && parsed.question) {
          row.parsed = parsed.question;
          const adapt = adaptMdGrammarToAiQuestion(parsed.question, t.p.content, "KILLER");
          if (adapt.ok && adapt.aiQuestion) {
            const pp = postProcessQuestion("GRAMMAR_ERROR", t.p.content, adapt.aiQuestion);
            const q = (pp.success && pp.data ? pp.data : adapt.aiQuestion) as Record<string, unknown>;
            row.aiQuestion = q;
            const issues = validateQuestionQuality({
              typeId: "GRAMMAR_ERROR",
              question: q,
              passage: t.p.content,
              requestedDifficulty: "KILLER",
              grammarMarkerCount: 5,
              grammarAnswerCount: 1,
            });
            row.qualityIssues = issues.filter((i) => i.severity === "error").map((i) => i.code);
            row.qualityWarnings = issues.filter((i) => i.severity !== "error").map((i) => i.code);
          } else {
            row.adaptError = adapt.error ?? "adapt failed";
          }
        }
        row.totalDurationMs = Date.now() - started;
        row.totalCostUsd = row.attempts.reduce((s: number, a: any) => s + (a.costUsd ?? 0), 0);
        rows.push(row);
        console.log(
          `${t.arm.padEnd(9)} ${t.p.title.slice(0, 28).padEnd(28)} pass=${row.finalPass ? "Y" : "N"} att=${row.attempts.length} ${Math.round(row.totalDurationMs / 1000)}s $${row.totalCostUsd.toFixed(4)} flags=${JSON.stringify(row.qualityIssues ?? [])} ${row.finalPass ? "" : "| " + row.finalGateIssues.join("; ").slice(0, 120)}`,
        );
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e);
        row.totalDurationMs = Date.now() - started;
        rows.push(row);
        console.log(`${t.arm.padEnd(9)} ${t.p.title.slice(0, 28).padEnd(28)} ERROR ${row.error.slice(0, 160)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), arms: ARMS, rows }, null, 2));
  console.log(`saved ${OUT} rows=${rows.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
