// luna 문제생성 확증런 v2 (26-08-14) — 학습지 캠페인 인사이트의 문제생성 이식 2단계.
// §5-14(소표본 금지) 충족: n=20 지문 paired, 어법 KILLER + 빈칸 KILLER,
// luna(JSON+high+OpenAI핀+검산규칙+재번호 코어스) vs gemini-3.6-flash(현행 md 프로덕션 복제).
// 전 콜 스트리밍(프로덕션 경로 동형) — 사고/본문 TTFT 를 UX 계측으로 함께 기록.
// 재시도: 게이트 반려 시 1회 피드백 재생성(프로덕션 md-stream 정책 복제, 채택 규칙 동일).
// 산출: experiments/question-quality-20260715/luna-bench-20260814/gen-v2.json
import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DIR = "experiments/question-quality-20260715/luna-bench-20260814";
const LUNA = "openai/gpt-5.6-luna";
const G36 = "google/gemini-3.6-flash";
const CONCURRENCY = 4;
const MAX_TOKENS = 14_000; // O215 검증 상한 — 20k 는 사고 10k+ 팽창으로 2배 지연(probe 실측)
const N_PASSAGES = 20;

// 오염 확정·의심 지문(O202·O215·O216) — 벤치 모집단에서 제외.
const EXCLUDED_PASSAGE_PREFIXES = [
  "cmsip7ubh000hl104kwehk3m3", // No.159 오염 확정
  "cmsip7vv60001i504wlm02be4", // No.160 오염 의심
  "cmrs251gp", // 6월모평 41-42 오염(수정됐어도 벤치 연속성 위해 제외)
  "cmrs0c609", // 오염 수정본
];

// ── luna JSON 스키마 (어법 = O215 검증형 · 빈칸 = 프로브 반려 교훈 반영 강화판) ──
const GRAMMAR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["markedPassage", "marks", "answer", "fix", "explanation", "wrong"],
  properties: {
    markedPassage: {
      type: "string",
      description:
        "지문 전체를 원문 그대로 복사하되, 밑줄 5곳을 [[A:표현]] [[B:표현]] [[C:표현]] [[D:표현]] [[E:표현]] 인라인 마커로 감싼 것. 마커 밖 텍스트는 원문과 한 글자도 달라선 안 된다. 마커는 지문 등장 순서대로 A→E.",
    },
    marks: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "shown", "original", "code"],
        properties: {
          label: { type: "string", enum: ["(A)", "(B)", "(C)", "(D)", "(E)"] },
          shown: { type: "string", description: "지문에 표시된 형태(정답 밑줄은 틀린 형태)" },
          original: { type: "string", description: "어법상 옳은 원형(정답이 아닌 밑줄은 shown 과 동일)" },
          code: { type: "string", description: "포인트 코드 a~m 한 글자" },
        },
      },
    },
    answer: { type: "string", enum: ["(A)", "(B)", "(C)", "(D)", "(E)"], description: "어법상 틀린 밑줄" },
    fix: { type: "string", description: "정답 밑줄의 고침(옳은 형태)" },
    explanation: { type: "string", description: "정답 해설(한국어) — 왜 틀렸고 어떻게 고치는지" },
    wrong: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "text"],
        properties: {
          label: { type: "string", enum: ["(A)", "(B)", "(C)", "(D)", "(E)"] },
          text: { type: "string", description: "이 밑줄이 어법상 옳은 이유 + 학생이 무엇과 헷갈리도록 설계했는지(한국어)" },
        },
      },
    },
  },
} as const;

const BLANK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["originalExpression", "options", "answer", "explanation", "wrong"],
  properties: {
    originalExpression: {
      type: "string",
      description:
        "빈칸으로 뚫을 지문 원문 구간 — 지문에서 복사-붙여넣기한 **연속 축자 부분 문자열**. '[빈칸]' 같은 플레이스홀더·대괄호·말줄임·문장 틀 절대 금지. 지문에 이 문자열이 그대로(따옴표·구두점 포함) 존재해야 한다.",
    },
    options: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "text"],
        properties: {
          label: { type: "string", enum: ["①", "②", "③", "④", "⑤"] },
          text: { type: "string", description: "선지 영어 표현" },
        },
      },
    },
    answer: { type: "string", enum: ["①", "②", "③", "④", "⑤"] },
    explanation: { type: "string", description: "정답 해설(한국어)" },
    wrong: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "text"],
        properties: {
          label: { type: "string", enum: ["①", "②", "③", "④", "⑤"] },
          text: { type: "string", description: "이 오답이 왜 틀렸는지 + 어떤 함정 기제로 설계했는지(한국어)" },
        },
      },
    },
  },
} as const;

const LUNA_SYSTEM =
  "출제 지시문 안의 출력 형식(마크다운 섹션 규격)은 무시하고, 내용 요구사항(문항 설계·품질 기준·해설 요건)만 전부 따르라. 출력은 반드시 지정된 JSON 스키마 하나다.";

// 학습지 캠페인 검증 기법(워크북 탈락 원인을 검산 규칙 2종으로 소멸) 이식 —
// 게이트가 반려하는 계약 위반을 모델이 출력 직전 스스로 검산하게 한다.
const GRAMMAR_SELFCHECK = [
  "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
  "- markedPassage 에서 [[X:...]] 마커 5개를 각 밑줄의 원형(original)으로 되돌려 이어 붙이면 소스 지문과 한 글자도 다르지 않아야 한다(공백·따옴표·구두점 포함). 출력 직전 실제로 재구성해 대조하라.",
  "- 마커 라벨은 지문 등장 순서대로 (A)→(E) 다.",
  "- 정답 밑줄 1개만 shown≠original(틀린 형태로 변형), 나머지 4개는 shown 과 original 이 완전히 동일해야 한다.",
  "- 각 밑줄 표현은 지문의 해당 위치에서 축자로 가져온다 — 지문에 없는 표현을 만들지 마라.",
].join("\n");

const BLANK_SELFCHECK = [
  "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
  "- originalExpression 은 지문에서 복사-붙여넣기한 연속 축자 부분 문자열이어야 한다. '[빈칸]'·대괄호·말줄임·문장 틀을 절대 넣지 마라. 출력 직전, 그 문자열을 지문에서 그대로 검색해 존재를 확인하라(따옴표·구두점까지 원문 그대로).",
  "- 정답 선지를 빈칸 자리에 끼운 완성문이 자연스럽고 원문과 논리 등가(축소·과장·반전 없음)인지 소리 내어 검산하라.",
  "- 오답 4개는 정답과 형식·길이·추상 층위가 평행하되 논리적으로 성립하지 않아야 한다 — 오답이 문맥상 성립 가능하면 정답 시비가 난다.",
].join("\n");

interface CallMetrics {
  text: string;
  ttfbMs: number | null;
  firstReasoningMs: number | null;
  firstContentMs: number | null;
  reasoningChars: number;
  durationMs: number;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  provider: string | null;
  finishReason: string | null;
}

async function streamCall(args: {
  model: string;
  system?: string;
  prompt: string;
  schema?: unknown;
  schemaName?: string;
  pinOpenAI?: boolean;
}): Promise<CallMetrics> {
  const t0 = Date.now();
  const messages: Array<{ role: string; content: string }> = [];
  if (args.system) messages.push({ role: "system", content: args.system });
  messages.push({ role: "user", content: args.prompt });
  const body: Record<string, unknown> = {
    model: args.model,
    messages,
    max_tokens: MAX_TOKENS,
    stream: true,
    usage: { include: true },
    reasoning: { enabled: true, effort: "high", exclude: false },
  };
  if (args.schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: args.schemaName ?? "item", strict: true, schema: args.schema },
    };
  }
  if (args.pinOpenAI) body.provider = { order: ["openai"], allow_fallbacks: false };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok || !res.body) {
    throw new Error(`${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let ttfbMs: number | null = null;
  let firstReasoningMs: number | null = null;
  let firstContentMs: number | null = null;
  let reasoningChars = 0;
  let provider: string | null = null;
  let finishReason: string | null = null;
  let usage: any = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (ttfbMs === null) ttfbMs = Date.now() - t0;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        if (j.provider && !provider) provider = j.provider;
        const choice = j.choices?.[0] ?? {};
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta ?? {};
        const r: string = delta.reasoning ?? delta.reasoning_content ?? "";
        if (r) {
          if (firstReasoningMs === null) firstReasoningMs = Date.now() - t0;
          reasoningChars += r.length;
        }
        const c: string = delta.content ?? "";
        if (c) {
          if (firstContentMs === null) firstContentMs = Date.now() - t0;
          text += c;
        }
        if (j.usage) usage = j.usage;
      } catch {
        /* partial */
      }
    }
  }
  if (!text.trim()) throw new Error("빈 본문(스트림 종료까지 content 델타 0)");
  return {
    text,
    ttfbMs,
    firstReasoningMs,
    firstContentMs,
    reasoningChars,
    durationMs: Date.now() - t0,
    costUsd: typeof usage?.cost === "number" ? usage.cost : null,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    provider,
    finishReason,
  };
}

/** 라벨 등장순 재번호(0원 결정형) — probe 와 동일 구현. */
function renumberGrammarByAppearance(q: any): { question: any; renumbered: boolean } {
  if (!q.markedPassage || !Array.isArray(q.marks)) return { question: q, renumbered: false };
  const positions = q.marks.map((m: any) => ({
    mark: m,
    pos: String(q.markedPassage).indexOf(`[[${String(m.label).replace(/[()]/g, "")}:`),
  }));
  if (positions.some((p: any) => p.pos < 0)) return { question: q, renumbered: false };
  const sorted = [...positions].sort((a, b) => a.pos - b.pos);
  const already = sorted.every((p, i) => p.mark === positions[i].mark);
  if (already) return { question: q, renumbered: false };
  const LETTERS = ["A", "B", "C", "D", "E"];
  const relabel = new Map<string, string>();
  sorted.forEach((p, i) => relabel.set(String(p.mark.label), `(${LETTERS[i]})`));
  let mp = String(q.markedPassage);
  for (const [oldL] of relabel) {
    const letter = oldL.replace(/[()]/g, "");
    mp = mp.replace(new RegExp(`\\[\\[${letter}:`, "g"), `[[TMP_${letter}:`);
  }
  for (const [oldL, newL] of relabel) {
    mp = mp.replace(
      new RegExp(`\\[\\[TMP_${oldL.replace(/[()]/g, "")}:`, "g"),
      `[[${newL.replace(/[()]/g, "")}:`,
    );
  }
  const mapLabel = (l: string) => relabel.get(l) ?? l;
  const newFixes: Record<string, string> = {};
  for (const [k, v] of Object.entries(q.fixes ?? {})) newFixes[mapLabel(k)] = v as string;
  return {
    question: {
      ...q,
      markedPassage: mp,
      marks: sorted.map((p, i) => ({ ...p.mark, label: `(${LETTERS[i]})` })),
      answer: mapLabel(q.answer),
      answers: (q.answers ?? [q.answer]).map(mapLabel),
      fixes: newFixes,
      wrong: (q.wrong ?? []).map((w: any) => ({ ...w, label: mapLabel(w.label) })),
    },
    renumbered: true,
  };
}

async function main() {
  mkdirSync(resolve(DIR), { recursive: true });
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdGrammarPrompt, buildMdBlankPrompt } = await import("../src/lib/md-qgen/prompts");
  const {
    autoSnapGrammarMarks,
    autoSnapBlankExpression,
    gateMdQuestion,
    parseMdGrammar,
    parseMdBlank,
  } = await import("../src/lib/md-qgen/parser");

  // ── 지문 선정: 이전 벤치 클린 지문 우선 + DB 충원(기출·800~1250자·오염 제외) ──
  const seedIds = [
    "cmruw7blz004hmml4hsnulpff",
    "cmruw7b2m0049mml48s8e5p2h",
    "cmru74muj0009l404v0897dx5",
    "cmruw7asy0045mml4rrfzmf77",
    "cmsilz13z0015kn0a1rasa25b",
    "cmsip7u35000dl804iqxz1gmx",
  ];
  const passages: Array<{ id: string; title: string; content: string }> = [];
  for (const id of seedIds) {
    const p = await prisma.passage.findUnique({
      where: { id },
      select: { id: true, title: true, content: true },
    });
    if (p) passages.push({ id: p.id, title: p.title ?? "", content: p.content });
  }
  const pool = await prisma.passage.findMany({
    orderBy: { createdAt: "desc" },
    take: 600,
    select: { id: true, title: true, content: true, subject: true },
  });
  const seen = new Set(passages.map((p) => p.id));
  const seenTitle = new Set(passages.map((p) => p.title));
  for (const p of pool) {
    if (passages.length >= N_PASSAGES) break;
    if (seen.has(p.id) || seenTitle.has(p.title ?? "")) continue;
    if (EXCLUDED_PASSAGE_PREFIXES.some((pre) => p.id.startsWith(pre))) continue;
    const len = p.content?.length ?? 0;
    if (len < 800 || len > 1250) continue;
    const title = p.title ?? "";
    if (!/학년도|모평|학평|모의|고[123]|기출|No\.\d/.test(title)) continue;
    if (p.subject && /KOREAN|국어/i.test(String(p.subject))) continue;
    // 어법 KILLER 지문 적합성(O172 교훈): 순수 서사·대화체 배제까지는 못 하지만
    // 최소한 영문 비중이 높은지 검사.
    const asciiRatio = (p.content.match(/[A-Za-z]/g)?.length ?? 0) / len;
    if (asciiRatio < 0.6) continue;
    passages.push({ id: p.id, title, content: p.content });
    seen.add(p.id);
    seenTitle.add(title);
  }
  console.log(`지문 ${passages.length}개 확정`);
  for (const p of passages) console.log(` - ${p.title.slice(0, 50)} (${p.content.length}자)`);

  type Arm = { arm: string; model: string; kind: "grammar" | "blank"; luna: boolean };
  const arms: Arm[] = [
    { arm: "luna-g", model: LUNA, kind: "grammar", luna: true },
    { arm: "g36-g", model: G36, kind: "grammar", luna: false },
    { arm: "luna-b", model: LUNA, kind: "blank", luna: true },
    { arm: "g36-b", model: G36, kind: "blank", luna: false },
  ];

  const parseAndGate = (
    a: Arm,
    text: string,
    passage: string,
  ): { question: any; gateIssues: string[]; corrections: string[]; renumbered: boolean } => {
    let renumbered = false;
    let q: any;
    if (a.kind === "grammar") {
      if (a.luna) {
        const raw = JSON.parse(text);
        q = {
          kind: "grammar",
          marks: raw.marks.map((m: any) => ({ ...m, anchor: undefined })),
          markedPassage: raw.markedPassage,
          answer: raw.answer,
          answers: [raw.answer],
          fix: raw.fix,
          fixes: { [raw.answer]: raw.fix },
          explanation: raw.explanation,
          wrong: raw.wrong,
        };
        const rn = renumberGrammarByAppearance(q);
        q = rn.question;
        renumbered = rn.renumbered;
      } else {
        q = parseMdGrammar(text);
      }
      const s = autoSnapGrammarMarks(q, passage);
      return {
        question: s.question,
        gateIssues: gateMdQuestion(s.question, passage),
        corrections: s.corrections,
        renumbered,
      };
    }
    if (a.luna) {
      const raw = JSON.parse(text);
      q = {
        kind: "blank",
        originalExpression: raw.originalExpression,
        options: raw.options,
        answer: raw.answer,
        explanation: raw.explanation,
        wrong: raw.wrong,
      };
    } else {
      q = parseMdBlank(text);
    }
    const s = autoSnapBlankExpression(q, passage);
    return {
      question: s.question,
      gateIssues: gateMdQuestion(s.question, passage),
      corrections: s.corrections,
      renumbered,
    };
  };

  const buildPrompt = (a: Arm, content: string, feedback: string | null): string => {
    const base =
      a.kind === "grammar"
        ? buildMdGrammarPrompt(content, "full", "KILLER")
        : buildMdBlankPrompt(content, "full", "KILLER");
    const extras: string[] = [];
    if (a.luna) extras.push(a.kind === "grammar" ? GRAMMAR_SELFCHECK : BLANK_SELFCHECK);
    if (feedback) {
      const needsRelocation = /누설|정답 시비|네모 밖|밑줄 밖|그대로 남아/.test(feedback);
      extras.push(
        `[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${feedback}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라.${
          needsRelocation
            ? " 누설·정답 시비 사유는 지문 원문이 그 표현을 이미 포함하고 있다는 뜻이다 — 같은 자리·같은 후보쌍으로는 절대 해소되지 않으니, 지적된 표적을 버리고 다른 문장의 다른 포인트로 교체해 설계하라(지문 본문 수정은 금지)."
            : ""
        }`,
      );
    }
    return extras.length > 0 ? `${base}\n\n${extras.join("\n\n")}` : base;
  };

  const tasks: Array<() => Promise<any>> = [];
  for (const p of passages) {
    for (const a of arms) {
      tasks.push(async () => {
        const callOnce = async (feedback: string | null) => {
          const r = await streamCall({
            model: a.model,
            system: a.luna ? LUNA_SYSTEM : undefined,
            prompt: buildPrompt(a, p.content, feedback),
            schema: a.luna ? (a.kind === "grammar" ? GRAMMAR_SCHEMA : BLANK_SCHEMA) : undefined,
            schemaName: a.kind === "grammar" ? "grammar_killer_item" : "blank_killer_item",
            pinOpenAI: a.luna,
          });
          let parsed: any = null;
          let gateIssues: string[] = [];
          let corrections: string[] = [];
          let renumbered = false;
          try {
            const pr = parseAndGate(a, r.text, p.content);
            parsed = pr.question;
            gateIssues = pr.gateIssues;
            corrections = pr.corrections;
            renumbered = pr.renumbered;
          } catch (e) {
            gateIssues = [`파싱 예외: ${e instanceof Error ? e.message : String(e)}`];
          }
          return { r, parsed, gateIssues, corrections, renumbered };
        };
        try {
          let attempt1 = await callOnce(null);
          let chosen = attempt1;
          let attempts = 1;
          let firstGateIssues: string[] | null = null;
          if (attempt1.gateIssues.length > 0) {
            firstGateIssues = attempt1.gateIssues;
            attempts = 2;
            try {
              const attempt2 = await callOnce(attempt1.gateIssues.join(", "));
              if (attempt2.gateIssues.length <= attempt1.gateIssues.length) chosen = attempt2;
            } catch (e) {
              /* 재시도 전송 실패 — 1차 결과 유지 */
            }
          }
          return {
            arm: a.arm,
            model: a.model,
            kind: a.kind,
            passageId: p.id,
            passageTitle: p.title,
            attempts,
            firstGateIssues,
            gateIssues: chosen.gateIssues,
            corrections: chosen.corrections,
            renumbered: chosen.renumbered,
            parsed: chosen.parsed,
            ttfbMs: chosen.r.ttfbMs,
            firstReasoningMs: chosen.r.firstReasoningMs,
            firstContentMs: chosen.r.firstContentMs,
            reasoningChars: chosen.r.reasoningChars,
            durationMs: chosen.r.durationMs,
            totalDurationMs: chosen === attempt1 ? attempt1.r.durationMs : attempt1.r.durationMs + chosen.r.durationMs,
            costUsd: chosen.r.costUsd,
            totalCostUsd:
              (attempt1.r.costUsd ?? 0) + (chosen === attempt1 ? 0 : chosen.r.costUsd ?? 0),
            inputTokens: chosen.r.inputTokens,
            outputTokens: chosen.r.outputTokens,
            reasoningTokens: chosen.r.reasoningTokens,
            provider: chosen.r.provider,
            finishReason: chosen.r.finishReason,
            rawText: chosen.r.text.slice(0, 9000),
          };
        } catch (e) {
          return {
            arm: a.arm,
            model: a.model,
            kind: a.kind,
            passageId: p.id,
            passageTitle: p.title,
            attempts: 1,
            error: e instanceof Error ? e.message : String(e),
            gateIssues: [],
            parsed: null,
          };
        }
      });
    }
  }

  const rows: any[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      const r = await tasks[i]();
      rows.push(r);
      const st = r.error
        ? `ERROR ${r.error.slice(0, 60)}`
        : r.gateIssues.length
          ? `REJECT: ${r.gateIssues[0]?.slice(0, 60)}`
          : "PASS";
      console.log(
        `[${rows.length}/${tasks.length}] ${r.arm} ${String(r.passageTitle).slice(0, 22)} ${((r.totalDurationMs ?? r.durationMs ?? 0) / 1000).toFixed(0)}s $${r.totalCostUsd?.toFixed?.(4) ?? "?"} ${r.provider ?? ""} att${r.attempts} ${st}`,
      );
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeFileSync(
    resolve(DIR, "gen-v2.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        maxTokens: MAX_TOKENS,
        passages: passages.map((p) => ({ id: p.id, title: p.title, length: p.content.length })),
        rows,
      },
      null,
      2,
    ),
  );

  console.log("\n══ 팔별 요약 ══");
  for (const a of arms) {
    const rs = rows.filter((r) => r.arm === a.arm);
    const ok = rs.filter((r) => !r.error && r.gateIssues.length === 0);
    const firstPass = rs.filter((r) => !r.error && !r.firstGateIssues);
    const err = rs.filter((r) => r.error);
    const live = rs.filter((r) => r.totalCostUsd != null && !r.error);
    const avgS =
      live.reduce((x, r) => x + (r.totalDurationMs ?? 0), 0) / Math.max(1, live.length) / 1000;
    const avgCost = live.reduce((x, r) => x + (r.totalCostUsd ?? 0), 0) / Math.max(1, live.length);
    console.log(
      `${a.arm}: 최종통과 ${ok.length}/${rs.length} (1차통과 ${firstPass.length}) | 오류 ${err.length} | 평균 ${avgS.toFixed(1)}s | 문항당 ₩${(avgCost * 1470).toFixed(1)}`,
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
