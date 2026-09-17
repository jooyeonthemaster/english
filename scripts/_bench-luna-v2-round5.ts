// 확증런 v2 — 5라운드(span) (26-08-14): 인접 게이트 × 분산 검산 공존 검증.
// 소급 실측에서 구세대 luna 생성물의 13%가 신설 인접 게이트에 걸렸다 — 사용자
// 경고("규칙 모순이 에러를 낳는다") 검증런: **프로덕션 모듈 그대로**(검산 v3 =
// 우선순위 사다리+위치 분산, parser 인접 게이트, 어댑터·코어스) 20지문 재생성해
// ① 1차 인접 발생률 ② 재생성 회복률 ③ 확정 실패율 ④ 시간·원가 꼬리를 측정한다.
// 산출: luna-bench-20260814/gen-r5.json
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, readFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DIR = "experiments/question-quality-20260715/luna-bench-20260814";
const CONCURRENCY = 4;

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdGrammarPrompt } = await import("../src/lib/md-qgen/prompts");
  const { autoSnapGrammarMarks, gateMdQuestion } = await import("../src/lib/md-qgen/parser");
  const {
    adaptLunaGrammarJson,
    LUNA_GRAMMAR_JSON_SCHEMA,
    LUNA_GRAMMAR_SELFCHECK,
    LUNA_QGEN_MAX_TOKENS,
    LUNA_QGEN_MODEL_ID,
    LUNA_QGEN_SYSTEM_MESSAGE,
  } = await import("../src/lib/md-qgen/luna-lane");

  const gen = JSON.parse(readFileSync(resolve(DIR, "gen-v2.json"), "utf8"));
  const passages: Array<{ id: string; title: string; content: string }> = [];
  for (const meta of gen.passages) {
    const p = await prisma.passage.findUnique({
      where: { id: meta.id },
      select: { id: true, title: true, content: true },
    });
    if (p) passages.push({ id: p.id, title: p.title ?? "", content: p.content });
  }
  console.log(`5라운드(span): luna 어법(검산 v3 + 인접 게이트) × ${passages.length}지문`);

  async function call(prompt: string) {
    const t0 = Date.now();
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: LUNA_QGEN_MODEL_ID,
        messages: [
          { role: "system", content: LUNA_QGEN_SYSTEM_MESSAGE },
          { role: "user", content: prompt },
        ],
        max_tokens: LUNA_QGEN_MAX_TOKENS,
        stream: true,
        usage: { include: true },
        reasoning: { enabled: true, effort: "high", exclude: false },
        response_format: { type: "json_schema", json_schema: LUNA_GRAMMAR_JSON_SCHEMA },
        provider: { order: ["openai"], allow_fallbacks: false },
      }),
      signal: AbortSignal.timeout(240_000),
    });
    if (!res.ok || !res.body) throw new Error(`${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let usage: any = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
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
          const c = j.choices?.[0]?.delta?.content ?? "";
          if (c) text += c;
          if (j.usage) usage = j.usage;
        } catch {
          /* partial */
        }
      }
    }
    if (!text.trim()) throw new Error("빈 본문");
    return {
      text,
      durationMs: Date.now() - t0,
      costUsd: typeof usage?.cost === "number" ? usage.cost : null,
    };
  }

  const parseGate = (text: string, passage: string) => {
    try {
      const adapted = adaptLunaGrammarJson(text);
      const snapped = autoSnapGrammarMarks(adapted.question, passage);
      return {
        question: snapped.question,
        gateIssues: [...adapted.issues, ...gateMdQuestion(snapped.question, passage)],
      };
    } catch (e) {
      return {
        question: null,
        gateIssues: [`파싱 예외: ${e instanceof Error ? e.message : String(e)}`],
      };
    }
  };

  const tasks = passages.map((p) => async () => {
    const base = `${buildMdGrammarPrompt(p.content, "full", "KILLER")}\n\n${LUNA_GRAMMAR_SELFCHECK}`;
    try {
      const c1 = await call(base);
      const g1 = parseGate(c1.text, p.content);
      if (g1.gateIssues.length === 0) {
        return {
          passageTitle: p.title,
          attempts: 1,
          finalPass: true,
          firstIssues: [],
          totalDurationMs: c1.durationMs,
          totalCostUsd: c1.costUsd ?? 0,
        };
      }
      const needsSpread = g1.gateIssues.some((i) => i.includes("인접"));
      const feedback = `${base}\n\n[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${g1.gateIssues.join(", ")}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라.${
        needsSpread
          ? " 인접 사유는 밑줄 배치 문제다 — 붙어 있는 두 밑줄 중 하나를 지문의 떨어진 다른 부분의 확정적 포인트로 옮겨라. 포인트 다양성(코드 종류)을 줄이는 한이 있어도 위치 분산이 우선이다(같은 코드 2회까지 허용)."
          : ""
      }`;
      const c2 = await call(feedback);
      const g2 = parseGate(c2.text, p.content);
      return {
        passageTitle: p.title,
        attempts: 2,
        finalPass: g2.gateIssues.length === 0,
        firstIssues: g1.gateIssues.map((i) => i.slice(0, 100)),
        secondIssues: g2.gateIssues.map((i) => i.slice(0, 100)),
        totalDurationMs: c1.durationMs + c2.durationMs,
        totalCostUsd: (c1.costUsd ?? 0) + (c2.costUsd ?? 0),
      };
    } catch (e) {
      return {
        passageTitle: p.title,
        attempts: 1,
        finalPass: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  const rows: any[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      const r = await tasks[i]();
      rows.push(r);
      console.log(
        `[${rows.length}/${tasks.length}] ${String(r.passageTitle).slice(0, 24)} att${r.attempts} ${r.finalPass ? "PASS" : "FAIL"}${r.firstIssues?.length ? ` (1차: ${r.firstIssues[0]?.slice(0, 50)})` : ""}`,
      );
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeFileSync(
    resolve(DIR, "gen-r5.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2),
  );
  const firstPass = rows.filter((r) => r.attempts === 1 && r.finalPass);
  const firstAdj = rows.filter((r) => (r.firstIssues ?? []).some((i: string) => i.includes("인접")));
  const finalPass = rows.filter((r) => r.finalPass);
  const live = rows.filter((r) => !r.error);
  console.log(
    `\nR5: 1차 통과 ${firstPass.length}/${rows.length} | 1차 인접 반려 ${firstAdj.length} | 최종 통과 ${finalPass.length}/${rows.length} | 평균 ${(
      live.reduce((a, r) => a + (r.totalDurationMs ?? 0), 0) / Math.max(1, live.length) / 1000
    ).toFixed(1)}s | 문항당 ₩${(
      (live.reduce((a, r) => a + (r.totalCostUsd ?? 0), 0) / Math.max(1, live.length)) * 1470
    ).toFixed(1)}`,
  );
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
