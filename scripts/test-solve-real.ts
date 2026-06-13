/* eslint-disable no-console */
// ============================================================================
// 실제 수능 기출 풀이 비교 (개발용) — 3.5-flash vs 3.1-flash-lite
//   npx tsx scripts/test-solve-real.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env", ".env.local"]) {
  try {
    const envFile = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of envFile.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      if (process.env[m[1]] !== undefined) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
}

const API_KEY =
  process.env.GEMINI_API_KEY?.trim() ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
if (!API_KEY) throw new Error("GEMINI_API_KEY missing");

const Q39 = `39. 글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오. [3점]

<주어진 문장>
The difference is that the action in the game world can only be explored through the virtual bodily space of the avatar.

A video game has its own model of reality, internal to itself and separate from the player's external reality, the player's bodily space and the avatar's bodily space. ( ① ) The avatar's bodily space, the potential actions of the avatar in the game world, is the only way in which the reality of the external reality of the game world can be perceived. ( ② ) As in the real world, perception requires action. ( ③ ) Players extend their perceptual field into the game, encompassing the available actions of the avatar. ( ④ ) The feedback loop of perception and action that enables you to navigate the world around you is now one step removed: instead of perceiving primarily through interaction of your own body with the external world, you're perceiving the game world through interaction of the avatar. ( ⑤ ) The entire perceptual system has been extended into the game world.
*encompass: 둘러싸다`;

const Q34 = `34. 다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오. [3점]

Kant was a strong defender of the rule of law as the ultimate guarantee, not only of security and peace, but also of freedom. He believed that human societies were moving towards more rational forms regulated by effective and binding legal frameworks because only such frameworks enabled people to live in harmony, to prosper and to co-operate. However, his belief in inevitable progress was not based on an optimistic or high-minded view of human nature. On the contrary, it comes close to Hobbes's outlook: man's violent and conflict-prone nature makes it necessary to establish and maintain an effective legal framework in order to secure peace. We cannot count on people's benevolence or goodwill, but even 'a nation of devils' can live in harmony in a legal system that binds every citizen equally. Ideally, the law is the embodiment of those political principles that all rational beings would freely choose. If such laws forbid them to do something that they would not rationally choose to do anyway, then the law cannot be ________________.
*benevolence: 자비심

① regarded as reasonably confining human liberty
② viewed as a strong defender of the justice system
③ understood as a restraint on their freedom
④ enforced effectively to suppress their evil nature
⑤ accepted within the assumption of ideal legal frameworks`;

const SYSTEM =
  "You are an expert solver of Korean CSAT (수능) English questions. " +
  "Read the question and return strict JSON only: " +
  '{ "answer": 1|2|3|4|5, "confidence": 0.0-1.0, "reasoning": "한국어 2~3문장 근거" }';

async function solve(model: string, thinkingBudget: number, question: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(API_KEY!)}`;
  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: question }] }],
      generationConfig: {
        temperature: 0,
        topK: 1,
        topP: 0,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget },
      },
    }),
  });
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { thoughtsTokenCount?: number };
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  const parsed = JSON.parse(
    text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, ""),
  ) as { answer: number; confidence: number; reasoning: string };
  return {
    ...parsed,
    ms: Date.now() - started,
    thoughtTok: json.usageMetadata?.thoughtsTokenCount ?? 0,
  };
}

async function main() {
  const questions = [
    { id: "39번 문장삽입", text: Q39, correct: 3 },
    { id: "34번 빈칸(칸트)", text: Q34, correct: 3 },
  ];
  const variants = [
    { name: "3.5-flash  (thinking 0)", model: "gemini-3.5-flash", tb: 0 },
    { name: "3.5-flash  (thinking 2048)", model: "gemini-3.5-flash", tb: 2048 },
    { name: "3.1-lite   (thinking 0)", model: "gemini-3.1-flash-lite", tb: 0 },
    { name: "3.1-lite   (thinking 2048)", model: "gemini-3.1-flash-lite", tb: 2048 },
  ];

  for (const question of questions) {
    console.log(`\n${"═".repeat(70)}\n■ ${question.id} (정답 ${question.correct})\n${"═".repeat(70)}`);
    for (const v of variants) {
      try {
        const r = await solve(v.model, v.tb, question.text);
        const ok = r.answer === question.correct;
        console.log(
          `  [${ok ? "정답" : "오답"}] ${v.name}: ${r.answer}번 (conf ${r.confidence}, ${r.ms}ms, thought ${r.thoughtTok}tok)`,
        );
        console.log(`         근거: ${r.reasoning}`);
      } catch (err) {
        console.log(
          `  [실패] ${v.name}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}

void main();
