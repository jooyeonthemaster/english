// 확장형 라이브 스모크 (26-08-14) — 다중빈칸2 + 어법 7·2 각 1콜, 게이트 왕복 확인.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function call(prompt: string, system: string, schema: unknown) {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5.6-luna",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: 14_000,
      stream: false,
      usage: { include: true },
      reasoning: { enabled: true, effort: "high", exclude: true },
      response_format: { type: "json_schema", json_schema: schema },
      provider: { order: ["openai"], allow_fallbacks: false },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  const j: any = await res.json();
  return {
    text: j?.choices?.[0]?.message?.content ?? "",
    sec: (Date.now() - t0) / 1000,
    cost: j?.usage?.cost ?? null,
  };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const {
    LUNA_QGEN_SYSTEM_MESSAGE,
    buildLunaGrammarJsonSchemaNK,
    buildLunaGrammarSelfcheckNK,
    buildLunaMultiBlankJsonSchema,
    buildLunaMultiBlankSelfcheck,
    adaptLunaGrammarJsonNK,
    adaptLunaMultiBlankJson,
  } = await import("../src/lib/md-qgen/luna-lane");
  const { buildMdGrammarPrompt, buildMdMultiBlankPrompt } = await import(
    "../src/lib/md-qgen/prompts"
  );
  const { autoSnapGrammarMarks, gateMdQuestion, gateMdMultiBlank } = await import(
    "../src/lib/md-qgen/parser"
  );

  const p = await prisma.passage.findUnique({
    where: { id: "cmruw7blz004hmml4hsnulpff" },
    select: { content: true },
  });
  if (!p) throw new Error("지문 미발견");

  // ① 어법 7·2
  {
    const prompt = `${buildMdGrammarPrompt(p.content, "full", "KILLER", { markerCount: 7, answerCount: 2 })}\n\n${buildLunaGrammarSelfcheckNK(7, 2)}`;
    const r = await call(prompt, LUNA_QGEN_SYSTEM_MESSAGE, buildLunaGrammarJsonSchemaNK(7, 2));
    try {
      const adapted = adaptLunaGrammarJsonNK(r.text);
      const snapped = autoSnapGrammarMarks(adapted.question, p.content);
      const issues = [
        ...adapted.issues,
        ...gateMdQuestion(snapped.question, p.content, { markerCount: 7, answerCount: 2 }),
      ];
      console.log(
        `어법 7·2: ${r.sec.toFixed(0)}s $${r.cost} → ${issues.length ? "REJECT: " + issues.join(" | ").slice(0, 160) : "PASS"} (정답 ${snapped.question.answers.join(",")})`,
      );
    } catch (e) {
      console.log(`어법 7·2: 파싱 실패 — ${e instanceof Error ? e.message : e}`);
    }
  }

  // ② 다중 빈칸 2
  {
    const prompt = `${buildMdMultiBlankPrompt(p.content, "full", "KILLER", 2, "PARAPHRASE")}\n\n${buildLunaMultiBlankSelfcheck(2)}`;
    const r = await call(prompt, LUNA_QGEN_SYSTEM_MESSAGE, buildLunaMultiBlankJsonSchema(2));
    try {
      const { question } = adaptLunaMultiBlankJson(r.text);
      const issues = gateMdMultiBlank(question, p.content, { blankCount: 2 });
      console.log(
        `다중빈칸2: ${r.sec.toFixed(0)}s $${r.cost} → ${issues.length ? "REJECT: " + issues.join(" | ").slice(0, 160) : "PASS"} (정답 ${question.answer})`,
      );
    } catch (e) {
      console.log(`다중빈칸2: 파싱 실패 — ${e instanceof Error ? e.message : e}`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
