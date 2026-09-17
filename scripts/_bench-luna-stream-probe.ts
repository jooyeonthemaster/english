// luna 스트리밍 실현성 프로브 (26-08-14) — 학습지 캠페인 인사이트의 문제생성 이식 1단계.
// 질문 3개를 실측으로 확정한다:
//  ① json_schema strict + reasoning high 를 stream:true 로 돌리면 **사고 델타가 흐르는가**
//     (md-stream SSE UX 의 "사고 타이핑" 유지 가능 여부 — exclude:false)
//  ② provider 고정(order:["openai"], allow_fallbacks:false)이 스트리밍에서도 유효한가
//     (O214 공급자 이중가격: OpenAI $0.10/0.60 vs Azure ~10배)
//  ③ 스트리밍 경로의 게이트 통과·시간·원가가 비스트리밍 벤치(O215 8/8·44s·₩5.9)와 동일한가
// + 빈칸(BLANK_INFERENCE) JSON 스키마 최초 시험(luna 빈칸은 사상 첫 실측).
// + 라벨 등장순 재번호 코어스(O215 잔여 과제) 첫 구현 검증.
// 산출: experiments/question-quality-20260715/luna-bench-20260814/probe.json
import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DIR = "experiments/question-quality-20260715/luna-bench-20260814";
const MODEL = "openai/gpt-5.6-luna";

// 어법: O215 json-arm SCHEMA 동일(검증된 형태).
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

// 빈칸: MdBlankQuestion 동형 — 파서 산출물과 같은 모양이라 게이트 무수정 재사용.
const BLANK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["originalExpression", "options", "answer", "explanation", "wrong"],
  properties: {
    originalExpression: {
      type: "string",
      description: "빈칸으로 뚫을 지문 원문 구간 — 지문에서 한 글자도 바꾸지 말고 축자 복사",
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

const SYSTEM_MSG =
  "출제 지시문 안의 출력 형식(마크다운 섹션 규격)은 무시하고, 내용 요구사항(문항 설계·품질 기준·해설 요건)만 전부 따르라. 출력은 반드시 지정된 JSON 스키마 하나다.";

interface StreamProbeResult {
  text: string;
  ttfbMs: number | null; // 업스트림 첫 SSE 바이트
  firstReasoningMs: number | null;
  firstContentMs: number | null;
  reasoningChars: number;
  reasoningSample: string;
  durationMs: number;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  provider: string | null;
  finishReason: string | null;
}

async function streamCall(args: {
  prompt: string;
  schema: unknown;
  schemaName: string;
}): Promise<StreamProbeResult> {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_MSG },
        { role: "user", content: args.prompt },
      ],
      // 사고+출력 공유 상한 — O216 절단 가드 20k.
      max_tokens: 20_000,
      stream: true,
      usage: { include: true },
      reasoning: { enabled: true, effort: "high", exclude: false },
      response_format: {
        type: "json_schema",
        json_schema: { name: args.schemaName, strict: true, schema: args.schema },
      },
      provider: { order: ["openai"], allow_fallbacks: false },
    }),
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
  let reasoningSample = "";
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
          if (reasoningSample.length < 400) reasoningSample += r;
        }
        const c: string = delta.content ?? "";
        if (c) {
          if (firstContentMs === null) firstContentMs = Date.now() - t0;
          text += c;
        }
        if (j.usage) usage = j.usage;
      } catch {
        /* partial line */
      }
    }
  }
  return {
    text,
    ttfbMs,
    firstReasoningMs,
    firstContentMs,
    reasoningChars,
    reasoningSample: reasoningSample.slice(0, 400),
    durationMs: Date.now() - t0,
    costUsd: typeof usage?.cost === "number" ? usage.cost : null,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    provider,
    finishReason,
  };
}

/** 라벨 등장순 재번호(0원 결정형, O215 잔여 과제) — markedPassage 의 [[X: 등장
 * 순서대로 marks 를 정렬해 A→E 로 다시 붙이고, answer/answers/fixes/wrong 의
 * 라벨을 동기 치환한다. 이미 등장순이면 무변화. */
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
  const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  const relabel = new Map<string, string>(); // old "(X)" -> new "(Y)"
  sorted.forEach((p, i) => relabel.set(String(p.mark.label), `(${LETTERS[i]})`));
  let mp = String(q.markedPassage);
  // 마커 문자를 충돌 없이 치환하기 위해 2단계(임시 토큰 경유).
  for (const [oldL] of relabel) {
    const letter = oldL.replace(/[()]/g, "");
    mp = mp.replace(new RegExp(`\\[\\[${letter}:`, "g"), `[[TMP_${letter}:`);
  }
  for (const [oldL, newL] of relabel) {
    const oldLetter = oldL.replace(/[()]/g, "");
    const newLetter = newL.replace(/[()]/g, "");
    mp = mp.replace(new RegExp(`\\[\\[TMP_${oldLetter}:`, "g"), `[[${newLetter}:`);
  }
  const newMarks = sorted.map((p, i) => ({ ...p.mark, label: `(${LETTERS[i]})` }));
  const mapLabel = (l: string) => relabel.get(l) ?? l;
  const newAnswers = (q.answers ?? [q.answer]).map(mapLabel);
  const newFixes: Record<string, string> = {};
  for (const [k, v] of Object.entries(q.fixes ?? {})) newFixes[mapLabel(k)] = v as string;
  return {
    question: {
      ...q,
      markedPassage: mp,
      marks: newMarks,
      answer: mapLabel(q.answer),
      answers: newAnswers,
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
  const { autoSnapGrammarMarks, autoSnapBlankExpression, gateMdQuestion } = await import(
    "../src/lib/md-qgen/parser"
  );

  const PASSAGE_IDS = [
    "cmruw7blz004hmml4hsnulpff", // 고3 10월 39번 (1110자)
    "cmsilz13z0015kn0a1rasa25b", // 2027 6월 모평 33번 (868자)
  ];
  const passages: Array<{ id: string; title: string; content: string }> = [];
  for (const id of PASSAGE_IDS) {
    const p = await prisma.passage.findUnique({
      where: { id },
      select: { id: true, title: true, content: true },
    });
    if (p) passages.push({ id: p.id, title: p.title ?? "", content: p.content });
  }
  console.log(`프로브 지문 ${passages.length}개`);

  const rows: any[] = [];
  for (const p of passages) {
    for (const kind of ["grammar", "blank"] as const) {
      const prompt =
        kind === "grammar"
          ? buildMdGrammarPrompt(p.content, "full", "KILLER")
          : buildMdBlankPrompt(p.content, "full", "KILLER");
      const schema = kind === "grammar" ? GRAMMAR_SCHEMA : BLANK_SCHEMA;
      try {
        const r = await streamCall({
          prompt,
          schema,
          schemaName: kind === "grammar" ? "grammar_killer_item" : "blank_killer_item",
        });
        let gateIssues: string[] = [];
        let corrections: string[] = [];
        let renumbered = false;
        try {
          const raw = JSON.parse(r.text);
          if (kind === "grammar") {
            let q: any = {
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
            const s = autoSnapGrammarMarks(q, p.content);
            q = s.question;
            corrections = s.corrections;
            gateIssues = gateMdQuestion(q, p.content);
          } else {
            let q: any = {
              kind: "blank",
              originalExpression: raw.originalExpression,
              options: raw.options,
              answer: raw.answer,
              explanation: raw.explanation,
              wrong: raw.wrong,
            };
            const s = autoSnapBlankExpression(q, p.content);
            q = s.question;
            corrections = s.corrections;
            gateIssues = gateMdQuestion(q, p.content);
          }
        } catch (e) {
          gateIssues = [`파싱 예외: ${e instanceof Error ? e.message : String(e)}`];
        }
        const row = {
          kind,
          passageId: p.id,
          passageTitle: p.title,
          ...r,
          text: r.text.slice(0, 6000),
          gateIssues,
          corrections,
          renumbered,
        };
        rows.push(row);
        console.log(
          `[${kind}] ${p.title.slice(0, 24)} — ${(r.durationMs / 1000).toFixed(1)}s | TTFB ${r.ttfbMs}ms | 첫사고 ${r.firstReasoningMs}ms(${r.reasoningChars}자) | 첫본문 ${r.firstContentMs}ms | ${r.provider} | $${r.costUsd} | ${gateIssues.length ? "REJECT: " + gateIssues[0].slice(0, 70) : "PASS"}${renumbered ? " (재번호)" : ""}`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        rows.push({ kind, passageId: p.id, passageTitle: p.title, error: msg });
        console.log(`[${kind}] ${p.title.slice(0, 24)} — ERROR ${msg.slice(0, 160)}`);
      }
    }
  }
  writeFileSync(
    resolve(DIR, "probe.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), model: MODEL, rows }, null, 2),
  );
  console.log(`\n저장: ${DIR}/probe.json`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
