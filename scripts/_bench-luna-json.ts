// luna 재대결 O215 (26-08-08) — "제미나이 홈그라운드" 교란 제거.
// 같은 과제(v3 어법 KILLER 프롬프트 전문)·같은 게이트, 출력만 json_schema strict
// (vocab 캠페인에서 luna 검증된 모드). JSON → MdGrammarQuestion 어댑트 후
// autoSnapGrammarMarks + gateMdQuestion 동일 적용.
// 팔: J-med(사고 medium·안정존) / J-high(사고 high — 502 리스크 재확인용).
// 산출: experiments/question-quality-20260715/luna-bench-20260808/json-arm.json
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync, writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DIR = "experiments/question-quality-20260715/luna-bench-20260808";
const MODEL = "openai/gpt-5.6-luna";
const ARMS = [
  { arm: "J-med", effort: "medium" },
  { arm: "J-high", effort: "high" },
] as const;
const CONCURRENCY = 6;

// md 규격 필드를 그대로 JSON 으로 — 파서 산출물과 동형이라 게이트 무수정 재사용.
const SCHEMA = {
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

async function callModel(prompt: string, effort: string) {
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
        {
          role: "system",
          content:
            "출제 지시문 안의 출력 형식(마크다운 섹션 규격)은 무시하고, 내용 요구사항(문항 설계·품질 기준·해설 요건)만 전부 따르라. 출력은 반드시 지정된 JSON 스키마 하나다.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 14000,
      reasoning: { enabled: true, effort, exclude: true },
      response_format: {
        type: "json_schema",
        json_schema: { name: "grammar_killer_item", strict: true, schema: SCHEMA },
      },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as any;
  const usage = json?.usage ?? {};
  const choice = json?.choices?.[0] ?? {};
  return {
    text: (choice?.message?.content ?? "") as string,
    durationMs: Date.now() - t0,
    costUsd: typeof usage.cost === "number" ? usage.cost : null,
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    finishReason: (choice?.finish_reason ?? null) as string | null,
    provider: (json?.provider ?? null) as string | null,
    choiceError: choice?.error ? JSON.stringify(choice.error).slice(0, 200) : null,
  };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdGrammarPrompt } = await import("../src/lib/md-qgen/prompts");
  const { autoSnapGrammarMarks, gateMdQuestion } = await import("../src/lib/md-qgen/parser");

  const gen = JSON.parse(readFileSync(resolve(DIR, "gen.json"), "utf8"));
  const passages: Array<{ id: string; title: string; content: string }> = [];
  for (const meta of gen.passages) {
    const p = await prisma.passage.findUnique({ where: { id: meta.id }, select: { id: true, title: true, content: true } });
    if (p) passages.push({ id: p.id, title: p.title ?? "", content: p.content });
  }
  console.log(`지문 ${passages.length}개 × ${ARMS.length}팔`);

  const tasks: Array<() => Promise<any>> = [];
  for (const p of passages) {
    for (const a of ARMS) {
      tasks.push(async () => {
        const prompt = buildMdGrammarPrompt(p.content, "full", "KILLER");
        try {
          const r = await callModel(prompt, a.effort);
          let gateIssues: string[] = [];
          let corrections: string[] = [];
          let parsed: any = null;
          try {
            const raw = JSON.parse(r.text);
            // md 파서 산출물과 동형으로 어댑트 — 이후 스냅·게이트는 프로덕션 동일.
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
            const s = autoSnapGrammarMarks(q, p.content);
            q = s.question;
            corrections = s.corrections;
            gateIssues = gateMdQuestion(q, p.content);
            parsed = q;
          } catch (e) {
            gateIssues = [`파싱 예외: ${e instanceof Error ? e.message : String(e)}`];
          }
          return { arm: a.arm, model: MODEL, passageId: p.id, passageTitle: p.title, ...r, gateIssues, corrections, parsed };
        } catch (e) {
          return {
            arm: a.arm, model: MODEL, passageId: p.id, passageTitle: p.title,
            durationMs: 0, costUsd: null, inputTokens: 0, outputTokens: 0, reasoningTokens: 0,
            finishReason: null, provider: null, choiceError: null,
            gateIssues: [], corrections: [], parsed: null, text: "",
            error: e instanceof Error ? e.message : String(e),
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
      const st = r.error ? `ERROR ${r.error.slice(0, 50)}` : r.gateIssues.length ? `REJECT: ${r.gateIssues[0]?.slice(0, 60)}` : "PASS";
      console.log(`[${rows.length}/${tasks.length}] ${r.arm} ${r.passageTitle.slice(0, 20)} ${(r.durationMs / 1000).toFixed(0)}s $${r.costUsd ?? "?"} ${r.finishReason ?? ""} ${r.provider ?? ""} ${st}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeFileSync(resolve(DIR, "json-arm.json"), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));

  console.log("\n══ 팔별 요약 ══");
  for (const a of ARMS) {
    const rs = rows.filter((r) => r.arm === a.arm);
    const ok = rs.filter((r) => !r.error && r.gateIssues.length === 0);
    const empty = rs.filter((r) => r.finishReason === "error" || (r.error && !r.text));
    const live = rs.filter((r) => r.costUsd != null);
    const avgS = live.reduce((x, r) => x + r.durationMs, 0) / Math.max(1, live.length) / 1000;
    const avgCost = live.reduce((x, r) => x + (r.costUsd ?? 0), 0) / Math.max(1, live.length);
    console.log(`${a.arm}: 통과 ${ok.length}/8 | 빈응답 ${empty.length} | 평균 ${avgS.toFixed(1)}s | 콜당 ₩${(avgCost * 1470).toFixed(1)}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
