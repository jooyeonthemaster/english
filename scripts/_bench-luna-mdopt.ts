// luna md-opt 팔 (26-08-08, O216) — "md 를 luna 최적화" 실측.
// 리서치 근거 적용(연구노트 O216 참조):
//  ① GPT-5 계열은 최종답변 형식 지시를 사고 중 유실하는 알려진 결함 → 형식 계약을
//     system(developer) 메시지 전면 + user 말미 재강조(recency)로 이중 배치
//  ② provider OpenAI 고정 + 폴백 차단(Azure ~10배 과금 차단), 502 는 스크립트 1회 재시도
//  ③ 사고 폭주 절단 가드 max_tokens 20k (본편 14k 전량 잠식 사례)
// 프롬프트 본문·파서·게이트는 프로덕션 v3 그대로.
// 산출: experiments/question-quality-20260715/luna-bench-20260808/mdopt.json
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync, writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DIR = "experiments/question-quality-20260715/luna-bench-20260808";
const MODEL = "openai/gpt-5.6-luna";
const CONCURRENCY = 6;

const SYSTEM = `너는 대한민국 수능 영어 어법 문항 출제위원이다. 사용자 지시문의 내용 요구(설계·품질·해설 기준)를 전부 따르되, **최종 답변은 반드시 아래 형식 골격 그대로** 출력한다. GPT 계열은 사고 중 형식 지시를 유실하는 경향이 있으니, 최종 답변을 쓰기 직전에 이 골격과 대조 검산하라.

밑줄지문:
<지문 전체를 한 글자도 바꾸지 말고 그대로. 밑줄 5곳만 [[A:표현]] ~ [[E:표현]] 마커로 감싼다. A→E 는 지문 등장 순서. 정답 한 곳만 원문과 다른 오형, 나머지 4곳은 원문 그대로>

원형·포인트:
(A) <원문 형태> | <포인트코드 a~k 한 글자>
(B) ...
(C) ...
(D) ...
(E) ...
정답: <(A)~(E) 하나>
고침: <정답 자리를 고친 원형>
해설: <딱 2문장, 합니다체>
오답:
(A) <왜 옳은지 + 학생이 헷갈리는 지점 1문장> (정답 라벨 제외 4개만)
...

형식 하드 규칙: 밑줄 정확히 5개 / 마커 밖 텍스트는 원문 축자 / 골격 밖의 다른 말·머리말·코드펜스 금지.`;

const TAIL = `

## 최종 출력 형식 재확인 (마지막 지시)
최종 답변은 "밑줄지문:" 으로 시작하고, 원형·포인트 5줄(A~E) → 정답 → 고침 → 해설 → 오답 4개 순서다. 밑줄은 정확히 5개, (A)~(E) 지문 등장순, 정답은 1개다.`;

async function callOnce(prompt: string) {
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
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt + TAIL },
      ],
      max_tokens: 20000,
      reasoning: { enabled: true, effort: "high", exclude: true },
      provider: { order: ["openai"], allow_fallbacks: false },
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
  const { parseMdGrammar, autoSnapGrammarMarks, gateMdQuestion } = await import(
    "../src/lib/md-qgen/parser"
  );

  const gen = JSON.parse(readFileSync(resolve(DIR, "gen.json"), "utf8"));
  const passages: Array<{ id: string; title: string; content: string }> = [];
  for (const meta of gen.passages) {
    const p = await prisma.passage.findUnique({ where: { id: meta.id }, select: { id: true, title: true, content: true } });
    if (p) passages.push({ id: p.id, title: p.title ?? "", content: p.content });
  }

  const rows: any[] = [];
  const tasks = passages.map((p) => async () => {
    const prompt = buildMdGrammarPrompt(p.content, "full", "KILLER");
    let retried = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await callOnce(prompt);
        if ((r.finishReason === "error" || !r.text) && attempt === 1) {
          retried = true;
          continue; // 502 계열 1회 재시도
        }
        let gateIssues: string[] = [];
        let corrections: string[] = [];
        let parsed: any = null;
        try {
          let q: any = parseMdGrammar(r.text);
          const s = autoSnapGrammarMarks(q, p.content);
          q = s.question;
          corrections = s.corrections;
          gateIssues = gateMdQuestion(q, p.content);
          parsed = q;
        } catch (e) {
          gateIssues = [`파서 예외: ${e instanceof Error ? e.message : String(e)}`];
        }
        rows.push({ arm: "md-opt", model: MODEL, passageId: p.id, passageTitle: p.title, attempt, retried, ...r, gateIssues, corrections, parsed });
        const st = r.choiceError ? "choiceErr" : gateIssues.length ? `REJECT: ${gateIssues[0]?.slice(0, 60)}` : "PASS";
        console.log(`${p.title.slice(0, 24)} a${attempt} ${(r.durationMs / 1000).toFixed(0)}s $${r.costUsd ?? "?"} ${r.finishReason ?? ""} ${r.provider ?? ""} ${st}`);
        return;
      } catch (e) {
        if (attempt === 1) {
          retried = true;
          continue;
        }
        rows.push({
          arm: "md-opt", model: MODEL, passageId: p.id, passageTitle: p.title, attempt, retried,
          durationMs: 0, costUsd: null, inputTokens: 0, outputTokens: 0, reasoningTokens: 0,
          finishReason: null, provider: null, choiceError: null,
          gateIssues: [], corrections: [], parsed: null, text: "",
          error: e instanceof Error ? e.message : String(e),
        });
        console.log(`${p.title.slice(0, 24)} ERROR ${e instanceof Error ? e.message.slice(0, 60) : e}`);
      }
    }
  });

  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) await tasks[cursor++]();
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeFileSync(resolve(DIR, "mdopt.json"), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));

  const ok = rows.filter((r) => !r.error && r.gateIssues.length === 0);
  const retriedN = rows.filter((r) => r.retried).length;
  const live = rows.filter((r) => r.costUsd != null);
  const avgS = live.reduce((x, r) => x + r.durationMs, 0) / Math.max(1, live.length) / 1000;
  const avgCost = live.reduce((x, r) => x + (r.costUsd ?? 0), 0) / Math.max(1, live.length);
  const avgReason = live.reduce((x, r) => x + r.reasoningTokens, 0) / Math.max(1, live.length);
  console.log(`\nmd-opt: 통과 ${ok.length}/${rows.length} | 재시도 발동 ${retriedN} | 평균 ${avgS.toFixed(1)}s | 콜당 ₩${(avgCost * 1470).toFixed(1)} | 평균 사고토큰 ${avgReason.toFixed(0)}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
