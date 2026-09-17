// 중급(INTERMEDIATE) 티어 결정 벤치 (2026-08-19): luna 레인 vs gemini-3.7-flash md 레인
// — "3.7 로 통일해도 되나"의 미측정 축(3.7 중급 원가·품질)을 paired 로 잰다.
//
// md-stream/route.ts 의 프롬프트 조립·콜 옵션·파서·게이트·어댑터·후처리·재생성 1회
// 정책을 그대로 재현한다(다양성·교사포인트·커스텀 지시는 양팔 공통 부재).
//   어법 5·1(pointFocus ON) · 빈칸 단일(빈칸 변형 ON) · 함축 · 지칭 — 각 20지문 × 2팔.
//
// 사용: node_modules/.bin/tsx scripts/_bench-int-tier.ts [--arms luna,g37] [--types GRAMMAR_ERROR,BLANK_INFERENCE,IMPLIED_MEANING,REFERENCE] [--limit 20] [--concurrency 6] [--dry] [--resume]
// 출력: experiments/question-quality-20260715/int-tier-bench-20260819/gen.json
//
// 발사 전 잔액 확인(GET /api/v1/credits) — 캠페인 규칙.

import { loadEnvConfig } from "@next/env";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

type Arm = "luna" | "g37";
type SubType = "GRAMMAR_ERROR" | "BLANK_INFERENCE" | "IMPLIED_MEANING" | "REFERENCE" | "TOPIC" | "MAIN_IDEA" | "TITLE";

const OUT_DIR = path.join(process.cwd(), "experiments/question-quality-20260715/int-tier-bench-20260819");
const R3 = path.join(process.cwd(), "experiments/question-quality-20260715/luna-bench-20260814/gen-r3.json");

const args = process.argv.slice(2);
const argVal = (k: string): string | undefined => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const splitList = (v: string | undefined, d: string[]) => (v ? v.split(/[\s,]+/).filter(Boolean) : d);
const ARMS = splitList(argVal("--arms"), ["luna", "g37"]) as Arm[];
const TYPES = splitList(argVal("--types"), ["GRAMMAR_ERROR", "BLANK_INFERENCE", "IMPLIED_MEANING", "REFERENCE"]) as SubType[];
const LIMIT = Number(argVal("--limit") ?? "20");
const CONC = Number(argVal("--concurrency") ?? "6");
const DRY = args.includes("--dry");
const RESUME = args.includes("--resume");
// --out gen2.json : 출력 파일명(기본 gen.json) — 재확인 런이 본 벤치를 덮지 않게.
// --passages id1,id2 : R3 세트 대신/추가로 쓸 지문 id(--limit 와 병행 시 앞에 붙음).
// --difficulty KILLER : 난이도 오버라이드(기본 INTERMEDIATE).
const OUT = path.join(OUT_DIR, argVal("--out") ?? "gen.json");
const EXTRA_PASSAGES = splitList(argVal("--passages"), []);
const DIFficultyArg = (argVal("--difficulty") ?? "INTERMEDIATE").toUpperCase();
const G37 = "google/gemini-3.7-flash";
const KRW = 1350;

// 실사용 설정(26-08-19 00:14+ 잡 config 실측) — 빈칸은 변형 ON(킬러 연동 기본·공예 상한).
const TYPE_SETTINGS: Record<SubType, unknown> = {
  GRAMMAR_ERROR: { pointFocus: true, answerCount: 1, markerCount: 5, stemLanguage: "ko", optionLanguage: "ko" },
  BLANK_INFERENCE: { blankCount: 1, stemLanguage: "ko", doubleNegative: false, optionLanguage: "en", paraphraseAnswer: true },
  IMPLIED_MEANING: null,
  REFERENCE: null,
  TOPIC: null,
  MAIN_IDEA: null,
  TITLE: null,
};

interface CallResult {
  text: string;
  durationMs: number;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number | null;
  provider: string | null;
  finishReason: string | null;
  errorChunk: string | null;
}

async function streamCall(a: {
  model: string;
  prompt: string;
  luna: { system: string; jsonSchema: unknown; maxTokens: number } | null;
  timeoutMs: number;
}): Promise<CallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");
  const body: Record<string, unknown> = {
    model: a.model,
    messages: a.luna
      ? [
          { role: "system", content: a.luna.system },
          { role: "user", content: a.prompt },
        ]
      : [{ role: "user", content: a.prompt }],
    max_tokens: a.luna ? a.luna.maxTokens : 14_000,
    stream: true,
    usage: { include: true },
    reasoning: { enabled: true, effort: "high", exclude: false },
  };
  if (a.luna) {
    body.response_format = { type: "json_schema", json_schema: a.luna.jsonSchema };
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
        if (choice?.finish_reason) finishReason = String(choice.finish_reason);
        const c: string = choice?.delta?.content ?? "";
        if (c) text += c;
        if (j.usage) usage = j.usage;
      } catch {
        /* partial */
      }
    }
  }
  const u = usage as Record<string, any> | null;
  if (!text.trim()) throw new Error(`EMPTY_BODY finish=${finishReason} err=${errorChunk ?? "-"}`);
  return {
    text,
    durationMs: Date.now() - started,
    costUsd: typeof u?.cost === "number" && u.cost > 0 ? u.cost : null,
    inputTokens: u?.prompt_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
    reasoningTokens: u?.completion_tokens_details?.reasoning_tokens ?? null,
    provider,
    finishReason,
    errorChunk,
  };
}

// route.ts 의 반려 피드백 블록(동일 문안).
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
  // 26-08-19 옵트인 반전 이후에도 luna 팔 벤치가 동작하게 — 벤치 프로세스 한정.
  if (ARMS.includes("luna")) process.env.QGEN_LUNA_LANE = "on";
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdGrammarPrompt, buildMdBlankPrompt, buildGrammarMdSharedSelfcheck, buildBlankMdSharedSelfcheck } = await import("../src/lib/md-qgen/prompts");
  const { buildGrammarPointGuidance } = await import("../src/lib/grammar-point-catalog");
  const { buildBlankPointGuidance } = await import("../src/lib/blank-point-catalog");
  const luna = await import("../src/lib/md-qgen/luna-lane");
  const { parseMdGrammar, parseMdBlank, autoSnapGrammarMarks, autoSnapBlankExpression, gateMdQuestion } = await import("../src/lib/md-qgen/parser");
  const { adaptMdBlankToAiQuestion, adaptMdGrammarToAiQuestion } = await import("../src/lib/md-qgen/adapter");
  const { getMdLane } = await import("../src/lib/md-qgen/lane-registry");
  const { getLunaExt, getLunaExtForSelfcheck } = await import("../src/lib/md-qgen/luna-ext-registry");
  const { resolveQuestionTypeGenerationSettings } = await import("../src/lib/question-type-generation-settings/dispatchers");
  const { postProcessQuestion } = await import("../src/lib/question-postprocess");
  const { validateQuestionQuality } = await import("../src/lib/question-quality");
  const { shuffleQuestionOptionsForDiversity } = await import("../src/lib/question-diversity");
  type MdLaneContext = import("../src/lib/md-qgen/lane-types").MdLaneContext;

  // 지문 20개 — O217 R3 세트(O219·LK 와 동일).
  const r3 = JSON.parse(readFileSync(R3, "utf-8")) as { rows: Array<{ arm: string; passageId: string }> };
  const passageIds = [...new Set([...EXTRA_PASSAGES, ...r3.rows.filter((r) => r.arm.startsWith("luna")).map((r) => r.passageId)])].slice(0, Math.max(LIMIT, EXTRA_PASSAGES.length));
  const passages = await prisma.passage.findMany({ where: { id: { in: passageIds } }, select: { id: true, title: true, content: true } });
  const byId = new Map(passages.map((p) => [p.id, p]));
  const ordered = passageIds.map((id) => byId.get(id)!).filter(Boolean);
  console.log(`passages=${ordered.length} arms=${ARMS.join(",")} types=${TYPES.join(",")} dry=${DRY} resume=${RESUME}`);

  const DIFF = (DIFficultyArg === "KILLER" || DIFficultyArg === "BASIC" ? DIFficultyArg : "INTERMEDIATE") as "BASIC" | "INTERMEDIATE" | "KILLER";

  type Plan = {
    prompt: (feedback: string | null) => string;
    call: { model: string; luna: { system: string; jsonSchema: unknown; maxTokens: number } | null };
    parseAndGate: (text: string) => { question: unknown; gateIssues: string[]; corrections: string[] };
    finish: (question: unknown) => { aiQuestion: Record<string, unknown>; qualityIssues: string[]; qualityWarnings: string[] };
    retryEligible: boolean;
  };

  const planFor = (arm: Arm, subType: SubType, passage: string): Plan => {
    const isLuna = arm === "luna";
    const resolved = resolveQuestionTypeGenerationSettings(subType, TYPE_SETTINGS[subType], DIFF) as unknown as Record<string, unknown>;
    const mdLane = getMdLane(subType);
    const lunaExt = isLuna ? getLunaExt(subType) : null;
    const laneCtx: MdLaneContext | null = mdLane
      ? { passage, difficulty: DIFF, rawDifficulty: DIFF, resolved, rawTypeSettings: TYPE_SETTINGS[subType], teacherPoints: [], variantIndex: 0, variantCount: 1 }
      : null;
    const markerCount = 5;
    const answerCount = 1;
    const blankParaphrase = Boolean(resolved.blankInferenceParaphraseAnswer);
    const blankPointFocus = Boolean(resolved.blankPointFocus);
    const grammarPointFocus = Boolean(resolved.grammarPointFocus);
    if (subType === "GRAMMAR_ERROR" && !grammarPointFocus) throw new Error("expected pointFocus ON");

    const prompt = (feedback: string | null): string => {
      const base =
        laneCtx && mdLane
          ? mdLane.buildBasePrompt(laneCtx)
          : subType === "BLANK_INFERENCE"
            ? buildMdBlankPrompt(passage, "full", DIFF)
            : buildMdGrammarPrompt(passage, "full", DIFF, { markerCount, answerCount });
      const extras: string[] = [];
      if (laneCtx && mdLane) {
        extras.push(...mdLane.buildExtras(laneCtx));
      } else if (subType === "BLANK_INFERENCE") {
        if (!blankParaphrase) {
          extras.push(`## 정답 형식 (필수 — 위의 '추상 패러프레이즈' 지시보다 우선한다)\n- '빈칸 변형' 미사용 설정이다: 정답 선지는 빈칸원문을 **한 글자도 바꾸지 말고 그대로** 써라.\n- 오답 4개는 정답과 같은 문법 형식·길이·추상 층위로 설계해, 원문 축자 정답이 형식만으로 표나지 않게 하라. 오답 기제 4종 규칙은 그대로 적용한다.`);
        }
        if (blankPointFocus) {
          const g = buildBlankPointGuidance({ pointFocus: true });
          if (g) extras.push(g);
        }
      } else if (grammarPointFocus) {
        const g = buildGrammarPointGuidance({ pointFocus: true, requestedDifficulty: DIFF, mode: "judgment", answerCount });
        if (g) extras.push(g);
      }
      // 검산 블록 — route.ts 분기 순서 그대로.
      if (isLuna && laneCtx && lunaExt) {
        extras.push(lunaExt.buildSelfcheck(laneCtx));
      } else if (!isLuna && laneCtx && mdLane) {
        const ext = getLunaExtForSelfcheck(subType);
        if (ext) extras.push(ext.buildSelfcheck(laneCtx));
      } else if (isLuna) {
        extras.push(subType === "GRAMMAR_ERROR" ? luna.LUNA_GRAMMAR_SELFCHECK : luna.LUNA_BLANK_SELFCHECK);
      } else if (subType === "GRAMMAR_ERROR") {
        extras.push(buildGrammarMdSharedSelfcheck(markerCount));
      } else {
        extras.push(buildBlankMdSharedSelfcheck());
      }
      if (feedback) extras.push(feedbackBlock(feedback));
      return `${base}\n\n${extras.join("\n\n")}`;
    };

    const call = isLuna
      ? {
          model: luna.LUNA_QGEN_MODEL_ID,
          luna: {
            system: luna.LUNA_QGEN_SYSTEM_MESSAGE,
            jsonSchema:
              laneCtx && lunaExt
                ? lunaExt.buildJsonSchema(laneCtx)
                : subType === "GRAMMAR_ERROR"
                  ? luna.LUNA_GRAMMAR_JSON_SCHEMA
                  : luna.LUNA_BLANK_JSON_SCHEMA,
            maxTokens: (laneCtx && lunaExt ? lunaExt.maxTokens : undefined) ?? luna.LUNA_QGEN_MAX_TOKENS,
          },
        }
      : { model: G37, luna: null };

    const parseAndGate = (text: string) => {
      try {
        if (laneCtx && mdLane) {
          if (isLuna && lunaExt) return lunaExt.parseAndGate(text, laneCtx);
          return mdLane.parseAndGate(text, laneCtx);
        }
        if (subType === "GRAMMAR_ERROR") {
          if (isLuna) {
            const adapted = luna.adaptLunaGrammarJson(text);
            const snapped = autoSnapGrammarMarks(adapted.question, passage);
            return {
              question: snapped.question,
              gateIssues: [...adapted.issues, ...gateMdQuestion(snapped.question, passage, { markerCount, answerCount })],
              corrections: [...snapped.corrections, ...(adapted.renumbered ? ["luna: 라벨 등장순 재번호"] : []), ...adapted.markerInserted.map((l) => `luna: ${l} 마커 자동삽입`)],
            };
          }
          let q = parseMdGrammar(text);
          q = luna.renumberGrammarByAppearance(q).question;
          const snapped = autoSnapGrammarMarks(q, passage);
          return { question: snapped.question, gateIssues: gateMdQuestion(snapped.question, passage, { markerCount, answerCount }), corrections: snapped.corrections };
        }
        // 빈칸 단일
        const q0 = isLuna ? luna.adaptLunaBlankJson(text).question : parseMdBlank(text);
        const snapped = autoSnapBlankExpression(q0, passage);
        return { question: snapped.question, gateIssues: gateMdQuestion(snapped.question, passage), corrections: snapped.corrections };
      } catch (e) {
        return { question: null, gateIssues: [`${isLuna ? "luna JSON" : "md"} 파싱 실패: ${e instanceof Error ? e.message : String(e)}`], corrections: [] };
      }
    };

    const finish = (question: unknown) => {
      const adapt =
        laneCtx && mdLane
          ? mdLane.adapt({ question, gateIssues: [], corrections: [] }, laneCtx)
          : subType === "BLANK_INFERENCE"
            ? adaptMdBlankToAiQuestion(question as never, passage, DIFF, blankParaphrase ? "PARAPHRASE" : "SOURCE_EXACT")
            : adaptMdGrammarToAiQuestion(question as never, passage, DIFF);
      if (!adapt.ok || !adapt.aiQuestion) throw new Error(`adapt failed: ${adapt.error ?? "unknown"}`);
      const pp = postProcessQuestion(subType, passage, adapt.aiQuestion);
      if (!pp.success || !pp.data) throw new Error(`postprocess failed: ${pp.error ?? "unknown"}`);
      const mapped: Record<string, unknown> = { ...(pp.data as Record<string, unknown>), _typeId: subType, difficulty: DIFF };
      const finalQ = shuffleQuestionOptionsForDiversity(mapped, subType);
      const issues = validateQuestionQuality({
        typeId: subType,
        question: finalQ,
        passage,
        requestedDifficulty: DIFF,
        ...(laneCtx && mdLane
          ? mdLane.qualityArgs(laneCtx)
          : subType === "GRAMMAR_ERROR"
            ? { grammarMarkerCount: markerCount, grammarAnswerCount: answerCount }
            : { blankCount: 1, blankParaphraseAnswer: blankParaphrase }),
      } as never);
      const codes = issues.filter((i) => i.severity === "error").map((i) => i.code);
      const filtered = laneCtx && mdLane?.filterQualityIssues ? mdLane.filterQualityIssues(codes, laneCtx) : codes;
      return { aiQuestion: finalQ, qualityIssues: filtered, qualityWarnings: issues.filter((i) => i.severity !== "error").map((i) => i.code) };
    };

    return { prompt, call, parseAndGate, finish, retryEligible: mdLane ? mdLane.retryEligible : true };
  };

  // 태스크 · resume
  const tasks: Array<{ arm: Arm; subType: SubType; p: { id: string; title: string; content: string } }> = [];
  for (const p of ordered) for (const subType of TYPES) for (const arm of ARMS) tasks.push({ arm, subType, p });
  let rows: any[] = [];
  if (RESUME && existsSync(OUT)) {
    rows = (JSON.parse(readFileSync(OUT, "utf-8")) as { rows: any[] }).rows;
    const done = new Set(rows.filter((r) => !r.error).map((r) => `${r.arm}|${r.subType}|${r.passageId}`));
    rows = rows.filter((r) => !r.error);
    const before = tasks.length;
    for (let i = tasks.length - 1; i >= 0; i--) if (done.has(`${tasks[i].arm}|${tasks[i].subType}|${tasks[i].p.id}`)) tasks.splice(i, 1);
    console.log(`resume: ${before - tasks.length} done, ${tasks.length} remaining`);
  }
  const save = () => {
    if (DRY) return;
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), arms: ARMS, types: TYPES, difficulty: DIFF, settings: TYPE_SETTINGS, rows }, null, 2));
  };

  let idx = 0;
  const worker = async () => {
    for (;;) {
      const t = tasks[idx++];
      if (!t) return;
      const tag = `${t.arm.padEnd(4)} ${t.subType.slice(0, 9).padEnd(9)} ${t.p.title.slice(0, 24).padEnd(24)}`;
      const row: any = { arm: t.arm, subType: t.subType, passageId: t.p.id, passageTitle: t.p.title, attempts: [] as any[] };
      const started = Date.now();
      try {
        const plan = planFor(t.arm, t.subType, t.p.content);
        row.model = plan.call.model;
        if (DRY) {
          row.promptChars = plan.prompt(null).length;
          console.log(`[dry] ${tag} prompt=${row.promptChars} model=${row.model}`);
          rows.push(row);
          continue;
        }
        const doCall = async (prompt: string) => {
          try {
            return await streamCall({ model: plan.call.model, prompt, luna: plan.call.luna, timeoutMs: 240_000 });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.startsWith("EMPTY_BODY")) throw e;
            row.attempts.push({ kind: "empty-body", error: msg });
            return await streamCall({ model: plan.call.model, prompt, luna: plan.call.luna, timeoutMs: 240_000 });
          }
        };
        let call = await doCall(plan.prompt(null));
        let parsed = plan.parseAndGate(call.text);
        row.attempts.push({ kind: "first", ...call, text: undefined, gateIssues: parsed.gateIssues, corrections: parsed.corrections });
        if (parsed.gateIssues.length > 0 && plan.retryEligible) {
          const fb = parsed.gateIssues.join(", ");
          const retry = await doCall(plan.prompt(fb));
          const rp = plan.parseAndGate(retry.text);
          row.attempts.push({ kind: "retry", ...retry, text: undefined, gateIssues: rp.gateIssues, corrections: rp.corrections });
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
          try {
            const fin = plan.finish(parsed.question);
            row.aiQuestion = fin.aiQuestion;
            row.qualityIssues = fin.qualityIssues;
            row.qualityWarnings = fin.qualityWarnings;
          } catch (e) {
            row.adaptError = e instanceof Error ? e.message : String(e);
          }
        }
        row.totalDurationMs = Date.now() - started;
        row.totalCostUsd = row.attempts.reduce((s: number, a: any) => s + (a.costUsd ?? 0), 0);
        row.finishReasons = row.attempts.map((a: any) => a.finishReason ?? null);
        rows.push(row);
        console.log(
          `${tag} pass=${row.finalPass ? "Y" : "N"} att=${row.attempts.length} ${Math.round(row.totalDurationMs / 1000)}s ₩${(row.totalCostUsd * KRW).toFixed(1)} fin=${row.finishReasons.join("/")} flags=${JSON.stringify(row.qualityIssues ?? [])}${row.adaptError ? " ADAPT:" + row.adaptError.slice(0, 80) : ""}${row.finalPass ? "" : " | " + row.finalGateIssues.join("; ").slice(0, 140)}`,
        );
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e);
        row.totalDurationMs = Date.now() - started;
        rows.push(row);
        console.log(`${tag} ERROR ${row.error.slice(0, 160)}`);
      }
      save();
    }
  };
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  save();

  // 요약
  const med = (xs: number[]) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  console.log("\n=== SUMMARY (per item, retries included) ===");
  for (const subType of TYPES) {
    for (const arm of ARMS) {
      const rs = rows.filter((r) => r.arm === arm && r.subType === subType && !r.error);
      const krw = rs.map((r) => r.totalCostUsd * KRW);
      const sec = rs.map((r) => r.totalDurationMs / 1000);
      const firstPass = rs.filter((r) => r.attempts[0]?.gateIssues?.length === 0).length;
      const finalPass = rs.filter((r) => r.finalPass).length;
      const flagged = rs.filter((r) => (r.qualityIssues ?? []).length > 0).length;
      const lengthCut = rs.filter((r) => r.finishReasons?.includes("length")).length;
      console.log(`${subType.padEnd(16)} ${arm.padEnd(4)} n=${rs.length} 1차통과=${firstPass} 최종통과=${finalPass} ₩med=${med(krw).toFixed(1)} ₩mean=${mean(krw).toFixed(1)} ₩max=${krw.length ? Math.max(...krw).toFixed(0) : "-"} s_med=${med(sec).toFixed(0)} s_p90=${sec.length ? [...sec].sort((a, b) => a - b)[Math.floor(sec.length * 0.9)].toFixed(0) : "-"} 검증플래그=${flagged} 절단=${lengthCut} err=${rows.filter((r) => r.arm === arm && r.subType === subType && r.error).length}`);
    }
  }
  console.log(`saved ${OUT} rows=${rows.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
