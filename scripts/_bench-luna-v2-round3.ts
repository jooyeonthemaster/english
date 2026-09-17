// 확증런 v2 — 3라운드 (26-08-14): 어법 paired 재확증 (§5-13 채점자 분산 소거).
// 같은 20지문에서 luna(검산 v2 + 마커 게이트 + 재번호 코어스) vs gemini-3.6-flash(md
// 프로덕션 복제)를 **같은 라운드**에 생성 → 같은 패널이 은닉 채점.
// 산출: luna-bench-20260814/gen-r3.json
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, readFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DIR = "experiments/question-quality-20260715/luna-bench-20260814";
const LUNA = "openai/gpt-5.6-luna";
const G36 = "google/gemini-3.6-flash";
const CONCURRENCY = 4;
const MAX_TOKENS = 14_000;

const GRAMMAR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["markedPassage", "marks", "answer", "fix", "explanation", "wrong"],
  properties: {
    markedPassage: {
      type: "string",
      description:
        "지문 전체를 원문 그대로 복사하되, 밑줄 5곳을 [[A:표현]] [[B:표현]] [[C:표현]] [[D:표현]] [[E:표현]] 인라인 마커로 감싼 것. 마커 밖 텍스트는 원문과 한 글자도 달라선 안 되고, 마커는 반드시 5개 전부 본문 안에 있어야 한다. 마커는 지문 등장 순서대로 A→E.",
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

const LUNA_SYSTEM =
  "출제 지시문 안의 출력 형식(마크다운 섹션 규격)은 무시하고, 내용 요구사항(문항 설계·품질 기준·해설 요건)만 전부 따르라. 출력은 반드시 지정된 JSON 스키마 하나다.";

const GRAMMAR_SELFCHECK_V2 = [
  "## 밑줄 표적 선정 금지 규칙 (필수)",
  "- 표준 학교문법 기준으로 옳고 그름 판정이 **확정적인 지점만** 밑줄로 써라(정답·오답 밑줄 모두).",
  "- 금지: 고어체·문어체 잔존형(예: 'whatever source it be derived' 같은 가정법 잔존), 대시/삽입구·등위 접속(and)으로 주어 해석이 갈려 수일치 판정이 논쟁이 되는 지점, 관계절 선행사가 중의적이어서 단·복수 판단이 갈리는 지점, 학자·교재마다 견해가 갈리는 지점.",
  "- 자기 검사: 각 밑줄에 대해 '상위권 학생이나 동료 교사가 이 판정에 이의를 제기할 수 있는가?'를 물어라. 이의 여지가 있으면 그 자리를 버리고 확정적인 다른 지점으로 교체하라.",
  "",
  "## 해설 사실성 검산 (필수)",
  "- 해설·오답 해설에서 지문 구조(선행사 위치, 주어의 핵, 수식 관계)를 서술할 때는 실제 지문을 다시 읽고 **사실만** 써라.",
  "- '바로 앞의 명사가 아니라 멀리 있는 선행사 X' 같은 상투 문구를 실제 위치 확인 없이 쓰지 마라 — 선행사가 바로 앞이면 '바로 앞의 X'라고 써라. 지문에 없는 구조를 지어내면 반려된다.",
  "",
  "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
  "- markedPassage 안에 [[A: [[B: [[C: [[D: [[E: 마커가 **5개 전부** 있는지 세어라 — marks 배열에만 있고 본문에 마커가 빠지면 반려된다.",
  "- markedPassage 에서 마커 5개를 각 밑줄의 원형(original)으로 되돌려 이어 붙이면 소스 지문과 한 글자도 다르지 않아야 한다(공백·따옴표·구두점 포함). 출력 직전 실제로 재구성해 대조하라.",
  "- 마커 라벨은 지문 등장 순서대로 (A)→(E) 다.",
  "- 정답 밑줄 1개만 shown≠original(틀린 형태로 변형), 나머지 4개는 shown 과 original 이 완전히 동일해야 한다.",
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
  json?: boolean;
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
  if (args.json) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "grammar_killer_item", strict: true, schema: GRAMMAR_SCHEMA },
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
  if (!text.trim()) throw new Error("빈 본문");
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

function ensureMarkersPresent(
  q: any,
  wordBoundaryRegex: (expr: string) => RegExp,
): { question: any; issues: string[]; inserted: string[] } {
  const issues: string[] = [];
  const inserted: string[] = [];
  let mp = String(q.markedPassage ?? "");
  const letters = ["A", "B", "C", "D", "E"];
  const missing = q.marks.filter(
    (m: any) => !mp.includes(`[[${String(m.label).replace(/[()]/g, "")}:`),
  );
  for (const m of missing) {
    const letter = String(m.label).replace(/[()]/g, "");
    if (String(m.shown) !== String(m.original)) {
      issues.push(`${m.label} 마커가 markedPassage에 없음(정답 밑줄 — 자동수리 불가)`);
      continue;
    }
    const idxOf = (l: string) => mp.indexOf(`[[${l}:`);
    const li = letters.indexOf(letter);
    const prev = letters
      .slice(0, li)
      .map(idxOf)
      .filter((i) => i >= 0)
      .pop();
    let next: number | undefined;
    for (const l of letters.slice(li + 1)) {
      const i = idxOf(l);
      if (i >= 0) {
        next = i;
        break;
      }
    }
    const lo = prev != null ? prev : 0;
    const hi = next != null ? next : mp.length;
    const segment = mp.slice(lo, hi);
    const re = wordBoundaryRegex(String(m.original));
    const matches = [...segment.matchAll(re)].filter(
      (mm) => !segment.slice(Math.max(0, (mm.index ?? 0) - 12), mm.index ?? 0).includes("[["),
    );
    if (matches.length !== 1) {
      issues.push(
        `${m.label} 마커가 markedPassage에 없음(자동삽입 위치 ${matches.length}곳 — 유일 확정 실패)`,
      );
      continue;
    }
    const at = lo + (matches[0].index ?? 0);
    const len = matches[0][0].length;
    mp = `${mp.slice(0, at)}[[${letter}:${mp.slice(at, at + len)}]]${mp.slice(at + len)}`;
    inserted.push(m.label);
  }
  return { question: { ...q, markedPassage: mp }, issues, inserted };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdGrammarPrompt } = await import("../src/lib/md-qgen/prompts");
  const { autoSnapGrammarMarks, gateMdQuestion, parseMdGrammar, wordBoundaryRegex } =
    await import("../src/lib/md-qgen/parser");

  const gen = JSON.parse(readFileSync(resolve(DIR, "gen-v2.json"), "utf8"));
  const passages: Array<{ id: string; title: string; content: string }> = [];
  for (const meta of gen.passages) {
    const p = await prisma.passage.findUnique({
      where: { id: meta.id },
      select: { id: true, title: true, content: true },
    });
    if (p) passages.push({ id: p.id, title: p.title ?? "", content: p.content });
  }
  console.log(`3라운드(paired): luna 검산v2 + g36 × ${passages.length}지문`);

  type Arm = { arm: string; model: string; luna: boolean };
  const arms: Arm[] = [
    { arm: "luna-g3", model: LUNA, luna: true },
    { arm: "g36-g3", model: G36, luna: false },
  ];

  const parseAndGate = (a: Arm, text: string, passage: string) => {
    let q: any;
    let renumbered = false;
    let markerInserted: string[] = [];
    let extraIssues: string[] = [];
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
      const em = ensureMarkersPresent(q, wordBoundaryRegex);
      q = em.question;
      extraIssues = em.issues;
      markerInserted = em.inserted;
    } else {
      q = parseMdGrammar(text);
    }
    const s = autoSnapGrammarMarks(q, passage);
    q = s.question;
    return {
      question: q,
      gateIssues: [...extraIssues, ...gateMdQuestion(q, passage)],
      corrections: s.corrections,
      renumbered,
      markerInserted,
    };
  };

  const buildPrompt = (a: Arm, content: string, feedback: string | null): string => {
    const base = buildMdGrammarPrompt(content, "full", "KILLER");
    const extras: string[] = [];
    if (a.luna) extras.push(GRAMMAR_SELFCHECK_V2);
    if (feedback) {
      extras.push(
        `[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${feedback}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라.`,
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
            json: a.luna,
            pinOpenAI: a.luna,
          });
          try {
            return { r, ...parseAndGate(a, r.text, p.content) };
          } catch (e) {
            return {
              r,
              question: null as any,
              gateIssues: [`파싱 예외: ${e instanceof Error ? e.message : String(e)}`],
              corrections: [] as string[],
              renumbered: false,
              markerInserted: [] as string[],
            };
          }
        };
        try {
          const a1 = await callOnce(null);
          let chosen = a1;
          let attempts = 1;
          let firstGateIssues: string[] | null = null;
          if (a1.gateIssues.length > 0) {
            firstGateIssues = a1.gateIssues;
            attempts = 2;
            try {
              const a2 = await callOnce(a1.gateIssues.join(", "));
              if (a2.gateIssues.length <= a1.gateIssues.length) chosen = a2;
            } catch {
              /* keep a1 */
            }
          }
          return {
            arm: a.arm,
            model: a.model,
            kind: "grammar",
            passageId: p.id,
            passageTitle: p.title,
            attempts,
            firstGateIssues,
            gateIssues: chosen.gateIssues,
            corrections: chosen.corrections,
            renumbered: chosen.renumbered,
            markerInserted: chosen.markerInserted,
            parsed: chosen.question,
            ttfbMs: chosen.r.ttfbMs,
            firstReasoningMs: chosen.r.firstReasoningMs,
            firstContentMs: chosen.r.firstContentMs,
            durationMs: chosen.r.durationMs,
            totalDurationMs:
              chosen === a1 ? a1.r.durationMs : a1.r.durationMs + chosen.r.durationMs,
            costUsd: chosen.r.costUsd,
            totalCostUsd: (a1.r.costUsd ?? 0) + (chosen === a1 ? 0 : chosen.r.costUsd ?? 0),
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
            kind: "grammar",
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
        `[${rows.length}/${tasks.length}] ${r.arm} ${String(r.passageTitle).slice(0, 22)} ${((r.totalDurationMs ?? 0) / 1000).toFixed(0)}s att${r.attempts}${(r.markerInserted?.length ?? 0) > 0 ? ` 마커삽입${r.markerInserted.join("")}` : ""} ${st}`,
      );
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeFileSync(
    resolve(DIR, "gen-r3.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2),
  );
  for (const a of arms) {
    const rs = rows.filter((r) => r.arm === a.arm);
    const ok = rs.filter((r) => !r.error && r.gateIssues.length === 0);
    const live = rs.filter((r) => !r.error);
    console.log(
      `${a.arm}: 최종통과 ${ok.length}/${rs.length} | 평균 ${(live.reduce((x, r) => x + (r.totalDurationMs ?? 0), 0) / Math.max(1, live.length) / 1000).toFixed(1)}s | 문항당 ₩${((live.reduce((x, r) => x + (r.totalCostUsd ?? 0), 0) / Math.max(1, live.length)) * 1470).toFixed(1)}`,
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
