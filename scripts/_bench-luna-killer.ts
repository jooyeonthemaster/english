// luna 어법 KILLER 개선 벤치 LK 라운드1 (2026-08-18)
// — 팔: lk(설계메모+인용앵커 전면 JSON), lk-nq(인용 제거 대조), lk-x(lk + 해설 전담 재작성 콜)
// — 대조군 L-base 는 O219 gen.json luna-p0 를 패킷 단계에서 캐리(재생성 없음, 같은 패널 재채점).
// — 지문 20개는 O219 와 동일(O217 R3 세트). 게이트·재생성 1회 정책은 프로덕션 동일.
//
// 사용:
//   node_modules/.bin/tsx scripts/_bench-luna-killer.ts --arms lk,lk-nq [--limit 20] [--concurrency 6] [--dry]
//   node_modules/.bin/tsx scripts/_bench-luna-killer.ts --repair          # lk 통과분에 해설 재작성(lk-x) 팬아웃
// 출력: experiments/question-quality-20260715/luna-killer-20260817/gen.json (팔 추가 병합)
//
// 발사 전 잔액 확인(GET /api/v1/credits) — 캠페인 규칙.

import { loadEnvConfig } from "@next/env";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

// 다이어트 팔(라운드4): d1 = lite−P0(pointFocus 뺄셈, 14k), d2 = lite@12k, d3 = lite−P0@12k
type Arm = "lk" | "lk-nq" | "lk-lite" | "lk-mid" | "lk-d1" | "lk-d2" | "lk-d3";
const OUT_DIR = path.join(
  process.cwd(),
  "experiments/question-quality-20260715/luna-killer-20260817",
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
// PowerShell 이 콤마 인자를 공백 결합으로 넘기는 사고 대비 — 콤마·공백 모두 구분자.
const ARMS = (argVal("--arms") ?? "lk,lk-nq").split(/[\s,]+/).filter(Boolean) as Arm[];
const LIMIT = Number(argVal("--limit") ?? "20");
const CONC = Number(argVal("--concurrency") ?? "6");
const DRY = args.includes("--dry");
const REPAIR = args.includes("--repair");
// LK 는 설계메모+인용+지문 복사가 붙은 "무거운 과제" — 14k 는 사고 잠식 절단(스모크
// 실측 finish=length 계통). O218 네모 전례(22k 훅으로 8/8 회복)를 따른다.
const MAX_TOKENS = Number(argVal("--max-tokens") ?? "22000");

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
}

async function lunaCall(a: {
  system: string;
  prompt: string;
  schema: unknown;
  timeoutMs: number;
  maxTokens?: number;
}): Promise<CallResult> {
  const { LUNA_QGEN_MODEL_ID } = await import("../src/lib/md-qgen/luna-lane");
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");
  const body = {
    model: LUNA_QGEN_MODEL_ID,
    messages: [
      { role: "system", content: a.system },
      { role: "user", content: a.prompt },
    ],
    max_tokens: a.maxTokens ?? MAX_TOKENS,
    stream: true,
    usage: { include: true },
    reasoning: { enabled: true, effort: "high", exclude: false },
    response_format: { type: "json_schema", json_schema: a.schema },
    provider: { order: ["openai"], allow_fallbacks: false },
  };
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
  let usage: Record<string, any> | null = null;
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
        if (choice?.finish_reason) finishReason = String(choice.finish_reason);
        const delta = choice?.delta ?? {};
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
  return {
    text,
    reasoningChars,
    durationMs: Date.now() - started,
    costUsd: typeof usage?.cost === "number" && usage.cost > 0 ? usage.cost : null,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? null,
    provider,
    finishReason,
    errorChunk,
  };
}

const quoteLine = (quote: string, analysis: string) =>
  `원문「${quote}」 분석: ${analysis}`;

function feedbackBlock(feedback: string): string {
  const needsRelocation = /누설|정답 시비|밑줄 밖|그대로 남아/.test(feedback);
  const needsSpread = /인접|앞 20%/.test(feedback);
  const needsNarrow = /구·절/.test(feedback);
  const needsQuote = /인용|바로 앞|축자|형식 위반/.test(feedback);
  return `[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${feedback}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라.${
    needsRelocation
      ? " 누설·정답 시비 사유는 같은 자리·같은 후보쌍으로는 절대 해소되지 않는다 — 지적된 표적을 버리고 다른 문장의 다른 포인트로 교체하라(지문 본문 수정은 금지)."
      : ""
  }${
    needsSpread
      ? " 배치 사유는 밑줄 위치 문제다 — 몰린 밑줄 중 하나를 지문의 떨어진 다른 부분의 확정적 포인트로 옮겨라."
      : ""
  }${
    needsNarrow
      ? " 구·절 사유는 밑줄 범위 문제다 — 판정을 결정짓는 핵심 단어 1개로 밑줄을 좁혀 다시 그어라."
      : ""
  }${
    needsQuote
      ? " 인용 사유는 quote 필드 문제다 — 분석을 쓰기 전에 지문에서 해당 구간을 다시 찾아 한 글자도 바꾸지 말고 복사하고(해설 quote 는 오형이 표시된 화면 형태), 위치·단복수 서술은 그 인용 안에 보이는 것만 써라."
      : ""
  }`;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const {
    LK_JSON_SCHEMA,
    LK_NQ_JSON_SCHEMA,
    LK_LITE_JSON_SCHEMA,
    LK_REPAIR_JSON_SCHEMA,
    LK_SYSTEM_MESSAGE,
    LK_SELFCHECK,
    LK_QUOTE_RULES,
    buildLunaKillerPrompt,
    buildLkRepairPrompt,
  } = await import(
    "../experiments/question-quality-20260715/luna-killer-20260817/prompts-lk"
  );
  const { buildMdGrammarPrompt } = await import("../src/lib/md-qgen/prompts");
  const { KILLER_SITES } = await import(
    "../experiments/question-quality-20260715/killer-bench-20260817/prompts-v2"
  );
  const { buildGrammarPointGuidance } = await import("../src/lib/grammar-point-catalog");
  const {
    LUNA_QGEN_SYSTEM_MESSAGE,
    renumberGrammarByAppearance,
    ensureGrammarMarkersPresent,
  } = await import("../src/lib/md-qgen/luna-lane");
  const { autoSnapGrammarMarks, gateMdQuestion } = await import("../src/lib/md-qgen/parser");
  const { processGrammarKillerV2Quotes } = await import(
    "../src/lib/md-qgen/grammar-killer-v2"
  );
  const { adaptMdGrammarToAiQuestion } = await import("../src/lib/md-qgen/adapter");
  const { postProcessQuestion } = await import("../src/lib/question-postprocess");
  const { validateQuestionQuality } = await import("../src/lib/question-quality");

  type MdQ = import("../src/lib/md-qgen/parser").MdGrammarQuestion;

  // ── LK JSON → MdGrammarQuestion (+인용 합성) ──
  const adaptLk = (
    text: string,
    quoted: boolean,
  ): { question: MdQ; issues: string[]; designNotes: string; corrections: string[] } => {
    const raw = JSON.parse(text) as {
      designNotes: string;
      markedPassage: string;
      marks: Array<{ label: string; shown: string; original: string; code: string }>;
      answer: string;
      fix: string;
      explanation: string | { quote: string; analysis: string };
      wrong: Array<{ label: string; text?: string; quote?: string; analysis?: string }>;
    };
    const explanation =
      typeof raw.explanation === "string"
        ? raw.explanation
        : quoteLine(raw.explanation.quote, raw.explanation.analysis);
    const wrong = [...raw.wrong]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((w) => ({
        label: w.label,
        text: quoted ? quoteLine(w.quote ?? "", w.analysis ?? "") : (w.text ?? ""),
      }));
    let q: MdQ = {
      kind: "grammar",
      marks: raw.marks.map((m) => ({ ...m, anchor: undefined })),
      markedPassage: raw.markedPassage,
      answer: raw.answer,
      answers: [raw.answer],
      fix: raw.fix,
      fixes: { [raw.answer]: raw.fix },
      explanation,
      wrong,
    };
    const corrections: string[] = [];
    const rn = renumberGrammarByAppearance(q);
    if (rn.renumbered) corrections.push("라벨 등장순 재번호");
    q = rn.question;
    const em = ensureGrammarMarkersPresent(q);
    corrections.push(...em.inserted.map((l) => `${l} 마커 자동삽입`));
    return { question: em.question, issues: em.issues, designNotes: raw.designNotes, corrections };
  };

  const parseAndGate = (arm: Arm, text: string, passage: string) => {
    try {
      const quoted = arm !== "lk-nq";
      const adapted = adaptLk(text, quoted);
      const snapped = autoSnapGrammarMarks(adapted.question, passage);
      let question = snapped.question;
      const gateIssues = [
        ...adapted.issues,
        ...gateMdQuestion(question, passage, { markerCount: 5, answerCount: 1 }),
      ];
      let quotes: Record<string, string> | undefined;
      if (quoted) {
        const qp = processGrammarKillerV2Quotes(question, passage);
        gateIssues.push(...qp.issues);
        question = qp.question;
        quotes = qp.quotes;
      }
      return {
        question,
        gateIssues,
        corrections: [...snapped.corrections, ...adapted.corrections],
        designNotes: adapted.designNotes,
        quotes,
      };
    } catch (e) {
      return {
        question: null as unknown as MdQ,
        gateIssues: [`luna JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`],
        corrections: [] as string[],
        designNotes: "",
        quotes: undefined,
      };
    }
  };

  const finalizeRow = (row: any, question: MdQ, passage: string) => {
    row.parsed = question;
    const adapt = adaptMdGrammarToAiQuestion(question, passage, "KILLER");
    if (adapt.ok && adapt.aiQuestion) {
      const pp = postProcessQuestion("GRAMMAR_ERROR", passage, adapt.aiQuestion);
      const q = (pp.success && pp.data ? pp.data : adapt.aiQuestion) as Record<string, unknown>;
      row.aiQuestion = q;
      const issues = validateQuestionQuality({
        typeId: "GRAMMAR_ERROR",
        question: q,
        passage,
        requestedDifficulty: "KILLER",
        grammarMarkerCount: 5,
        grammarAnswerCount: 1,
      });
      row.qualityIssues = issues.filter((i) => i.severity === "error").map((i) => i.code);
      row.qualityWarnings = issues.filter((i) => i.severity !== "error").map((i) => i.code);
    } else {
      row.adaptError = adapt.error ?? "adapt failed";
    }
  };

  const loadOut = (): { rows: any[] } =>
    existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf-8")) as { rows: any[] }) : { rows: [] };

  // ── 해설 재작성 팬아웃 (lk-x) ──
  if (REPAIR) {
    const data = loadOut();
    const lkRows = data.rows.filter((r) => r.arm === "lk" && r.finalPass && r.parsed);
    const existing = new Set(
      data.rows.filter((r) => r.arm === "lk-x").map((r) => r.passageId as string),
    );
    const targets = lkRows.filter((r) => !existing.has(r.passageId));
    console.log(`lk-x repair 대상: ${targets.length}/${lkRows.length} (기존 ${existing.size} 스킵)`);
    const passages = await prisma.passage.findMany({
      where: { id: { in: targets.map((r) => r.passageId as string) } },
      select: { id: true, content: true },
    });
    const contentById = new Map(passages.map((p) => [p.id, p.content]));
    let idx = 0;
    const rows: any[] = [];
    const worker = async () => {
      for (;;) {
        const src = targets[idx++];
        if (!src) return;
        const passage = contentById.get(src.passageId) ?? "";
        const base = src.parsed as MdQ;
        const row: any = {
          arm: "lk-x",
          model: "openai/gpt-5.6-luna",
          passageId: src.passageId,
          passageTitle: src.passageTitle,
          sourceArm: "lk",
          attempts: [] as any[],
        };
        const started = Date.now();
        try {
          const prompt = buildLkRepairPrompt({
            passage,
            markedPassage: base.markedPassage ?? "",
            marks: base.marks.map((m: any) => ({
              label: m.label,
              shown: m.shown,
              original: m.original,
              code: m.code ?? "?",
            })),
            answer: base.answer,
            fix: base.fix ?? "",
          });
          const applyRewrite = (text: string) => {
            const raw = JSON.parse(text) as {
              explanation: { quote: string; analysis: string };
              wrong: Array<{ label: string; quote: string; analysis: string }>;
            };
            const q2: MdQ = {
              ...base,
              explanation: quoteLine(raw.explanation.quote, raw.explanation.analysis),
              wrong: [...raw.wrong]
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((w) => ({ label: w.label, text: quoteLine(w.quote, w.analysis) })),
            };
            const qp = processGrammarKillerV2Quotes(q2, passage);
            return { question: qp.question, issues: qp.issues, quotes: qp.quotes };
          };
          let call = await lunaCall({
            system: "출력은 반드시 지정된 JSON 스키마 하나다.",
            prompt,
            schema: LK_REPAIR_JSON_SCHEMA,
            timeoutMs: 240_000,
          });
          let applied = applyRewrite(call.text);
          row.attempts.push({ kind: "first", ...call, text: undefined, gateIssues: applied.issues });
          if (applied.issues.length > 0) {
            const retry = await lunaCall({
              system: "출력은 반드시 지정된 JSON 스키마 하나다.",
              prompt: `${prompt}\n\n${feedbackBlock(applied.issues.join(", "))}`,
              schema: LK_REPAIR_JSON_SCHEMA,
              timeoutMs: 240_000,
            });
            const rp = applyRewrite(retry.text);
            row.attempts.push({ kind: "retry", ...retry, text: undefined, gateIssues: rp.issues });
            if (rp.issues.length <= applied.issues.length) {
              call = retry;
              applied = rp;
            }
          }
          row.finalPass = applied.issues.length === 0;
          row.finalGateIssues = applied.issues;
          if (row.finalPass) finalizeRow(row, applied.question, passage);
          row.totalDurationMs = Date.now() - started;
          row.totalCostUsd = row.attempts.reduce((s: number, a: any) => s + (a.costUsd ?? 0), 0);
          rows.push(row);
          console.log(
            `lk-x ${String(src.passageTitle).slice(0, 28).padEnd(28)} pass=${row.finalPass ? "Y" : "N"} att=${row.attempts.length} ${Math.round(row.totalDurationMs / 1000)}s $${row.totalCostUsd.toFixed(4)}${row.finalPass ? "" : " | " + row.finalGateIssues.join("; ").slice(0, 120)}`,
          );
        } catch (e) {
          row.error = e instanceof Error ? e.message : String(e);
          row.totalDurationMs = Date.now() - started;
          rows.push(row);
          console.log(`lk-x ${String(src.passageTitle).slice(0, 28)} ERROR ${row.error.slice(0, 160)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: CONC }, () => worker()));
    const merged = loadOut();
    merged.rows.push(...rows);
    writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), rows: merged.rows }, null, 2));
    console.log(`saved ${OUT} (+${rows.length} lk-x rows, total ${merged.rows.length})`);
    await prisma.$disconnect();
    return;
  }

  // ── 본 생성 (lk / lk-nq) ──
  const r3 = JSON.parse(readFileSync(R3, "utf-8")) as {
    rows: Array<{ arm: string; passageId: string }>;
  };
  const passageIds = [
    ...new Set(r3.rows.filter((r) => r.arm.startsWith("luna")).map((r) => r.passageId)),
  ].slice(0, LIMIT);
  const passages = await prisma.passage.findMany({
    where: { id: { in: passageIds } },
    select: { id: true, title: true, content: true },
  });
  const byId = new Map(passages.map((p) => [p.id, p]));
  const ordered = passageIds.map((id) => byId.get(id)!).filter(Boolean);
  console.log(`passages: ${ordered.length}, arms: ${ARMS.join(",")}, dry=${DRY}`);

  // 재개: 이미 성공(finalPass)한 (팔·지문) 조합은 스킵 — 실패·에러 행은 재실행 대상.
  // 재실행 전 기존 실패 행은 gen.json 에서 지워진다(중복 방지).
  const prior = loadOut();
  const doneKeys = new Set(
    prior.rows.filter((r) => r.finalPass).map((r) => `${r.arm}|${r.passageId}`),
  );
  prior.rows = prior.rows.filter(
    (r) => r.finalPass || !ARMS.includes(r.arm as Arm),
  );
  if (!DRY && existsSync(OUT))
    writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), rows: prior.rows }, null, 2));

  const tasks: Array<{ arm: Arm; p: { id: string; title: string; content: string } }> = [];
  for (const p of ordered)
    for (const arm of ARMS)
      if (!doneKeys.has(`${arm}|${p.id}`)) tasks.push({ arm, p });
  if (doneKeys.size > 0) console.log(`재개: 기성공 ${doneKeys.size}건 스킵, 실행 ${tasks.length}건`);

  const rows: any[] = [];
  let idx = 0;
  const worker = async () => {
    for (;;) {
      const t = tasks[idx++];
      if (!t) return;
      const isLite = ["lk-lite", "lk-mid", "lk-d1", "lk-d2", "lk-d3"].includes(t.arm);
      const noP0 = t.arm === "lk-d1" || t.arm === "lk-d3";
      const schema =
        t.arm === "lk" ? LK_JSON_SCHEMA : isLite ? LK_LITE_JSON_SCHEMA : LK_NQ_JSON_SCHEMA;
      // lk-lite: 프로덕션 형상(md 베이스+P0 pointFocus) + 수술 검산·인용 규칙만. 14k 유지.
      const litePrompt = () =>
        [
          buildMdGrammarPrompt(t.p.content, "full", "KILLER", { markerCount: 5, answerCount: 1 }),
          ...(noP0
            ? []
            : [
                buildGrammarPointGuidance({
                  pointFocus: true,
                  requestedDifficulty: "KILLER",
                  mode: "judgment",
                  answerCount: 1,
                }),
              ]),
          // lk-mid: lite + 킬러 자리 카탈로그 + 후보 비교·얕음 검산 절차(설계메모 없이 사고 안에서)
          ...(t.arm === "lk-mid"
            ? [
                KILLER_SITES,
                "## 정답 자리 선택 절차 (사고 안에서 수행)\n- 위 카탈로그 구조를 지문에서 문장마다 찾아 후보 2개 이상을 놓고, 판정 단서가 더 멀고 오형이 로컬로 더 자연스러운 쪽을 정답으로 골라라.\n- 고른 자리가 인접 단서만으로 즉답되는지 스스로 검산하라 — 동사 직전 명사가 정답 방향의 수 신호를 주거나, 문장 안에 반대 수의 명사가 아예 없으면 그 자리는 얕다. 버리고 다른 후보로 가라.",
              ]
            : []),
          LK_QUOTE_RULES,
          LK_SELFCHECK,
        ].join("\n\n");
      const mkPrompt = (feedback: string | null) =>
        (isLite ? litePrompt() : buildLunaKillerPrompt(t.p.content, { quote: t.arm === "lk" })) +
        (feedback ? `\n\n${feedbackBlock(feedback)}` : "");
      const sysMsg = isLite ? LUNA_QGEN_SYSTEM_MESSAGE : LK_SYSTEM_MESSAGE;
      const armMaxTokens =
        t.arm === "lk-lite" || t.arm === "lk-d1"
          ? 14_000
          : t.arm === "lk-mid"
            ? 16_000
            : t.arm === "lk-d2" || t.arm === "lk-d3"
              ? 12_000
              : undefined;
      const row: any = {
        arm: t.arm,
        model: "openai/gpt-5.6-luna",
        passageId: t.p.id,
        passageTitle: t.p.title,
        attempts: [] as any[],
      };
      const started = Date.now();
      try {
        if (DRY) {
          row.promptChars = mkPrompt(null).length;
          rows.push(row);
          console.log(`[dry] ${t.arm} ${t.p.title.slice(0, 30)} prompt=${row.promptChars}`);
          continue;
        }
        let call = await lunaCall({
          system: sysMsg,
          prompt: mkPrompt(null),
          schema,
          timeoutMs: 240_000,
          maxTokens: armMaxTokens,
        });
        if (!call.text.trim()) {
          row.attempts.push({ kind: "empty-body", ...call, text: undefined });
          call = await lunaCall({
            system: sysMsg,
            prompt: mkPrompt(null),
            schema,
            timeoutMs: 240_000,
            maxTokens: armMaxTokens,
          });
        }
        let parsed = parseAndGate(t.arm, call.text, t.p.content);
        row.attempts.push({
          kind: "first",
          ...call,
          text: undefined,
          gateIssues: parsed.gateIssues,
          corrections: parsed.corrections,
        });
        if (parsed.gateIssues.length > 0) {
          const fb = parsed.gateIssues.join(", ");
          const retry = await lunaCall({
            system: sysMsg,
            prompt: mkPrompt(fb),
            schema,
            timeoutMs: 240_000,
            maxTokens: armMaxTokens,
          });
          const rp = parseAndGate(t.arm, retry.text, t.p.content);
          row.attempts.push({
            kind: "retry",
            ...retry,
            text: undefined,
            gateIssues: rp.gateIssues,
            corrections: rp.corrections,
          });
          if (rp.gateIssues.length <= parsed.gateIssues.length) {
            call = retry;
            parsed = rp;
          }
        }
        row.finalPass = parsed.gateIssues.length === 0;
        row.finalGateIssues = parsed.gateIssues;
        row.designNotes = parsed.designNotes;
        row.quotes = parsed.quotes;
        row.rawText = call.text;
        if (row.finalPass && parsed.question) finalizeRow(row, parsed.question, t.p.content);
        row.totalDurationMs = Date.now() - started;
        row.totalCostUsd = row.attempts.reduce((s: number, a: any) => s + (a.costUsd ?? 0), 0);
        rows.push(row);
        console.log(
          `${t.arm.padEnd(6)} ${t.p.title.slice(0, 28).padEnd(28)} pass=${row.finalPass ? "Y" : "N"} att=${row.attempts.length} ${Math.round(row.totalDurationMs / 1000)}s $${row.totalCostUsd.toFixed(4)} flags=${JSON.stringify(row.qualityIssues ?? [])} ${row.finalPass ? "" : "| " + row.finalGateIssues.join("; ").slice(0, 140)}`,
        );
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e);
        row.totalDurationMs = Date.now() - started;
        rows.push(row);
        console.log(`${t.arm.padEnd(6)} ${t.p.title.slice(0, 28)} ERROR ${row.error.slice(0, 160)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  if (DRY) {
    console.log("dry 완료 — 저장 생략");
    await prisma.$disconnect();
    return;
  }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const merged = loadOut();
  merged.rows.push(...rows);
  writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), rows: merged.rows }, null, 2),
  );
  console.log(`saved ${OUT} rows total=${merged.rows.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
