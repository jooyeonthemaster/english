// md 레인 교사 포인트 검증 (26-07-23) — 실지문+실포인트 1콜: 프롬프트 강제 블록
// 주입 → 파서·스냅·게이트 → 표적 준수 확인.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const POINT = "make the most of themselves";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdBlankPrompt } = await import("../src/lib/md-qgen/prompts");
  const { parseMdBlank, autoSnapBlankExpression, gateMdQuestion, normalizeWs } = await import("../src/lib/md-qgen/parser");
  const { buildTeacherPointsPromptBlock } = await import("../src/lib/question-generation-prompt-contract");

  const passage = await prisma.passage.findFirst({
    where: { title: { contains: "고3 10월 영어 23번" }, content: { contains: POINT } },
    select: { title: true, content: true },
  });
  if (!passage) { console.log("지문 없음"); process.exit(1); }
  console.log(`지문: ${passage.title}`);

  const block = buildTeacherPointsPromptBlock([{ text: POINT, unit: "phrase" }]);
  const prompt = buildMdBlankPrompt(passage.content, "full", "KILLER") + "\n\n" + block;

  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 14000,
      reasoning: { enabled: true, effort: "high", exclude: true },
    }),
    signal: AbortSignal.timeout(240000),
  });
  const text = ((await res.json()) as any)?.choices?.[0]?.message?.content ?? "";
  let q = parseMdBlank(text);
  q = autoSnapBlankExpression(q, passage.content).question;
  const gate = gateMdQuestion(q, passage.content);
  const oe = normalizeWs(q.originalExpression ?? "");
  const pt = normalizeWs(POINT);
  const comply = oe.includes(pt) || pt.includes(oe);
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`빈칸원문: "${q.originalExpression}"`);
  console.log(`게이트: ${gate.length === 0 ? "PASS" : "REJECT " + gate.join("; ")}`);
  console.log(`교사 표적 준수: ${comply ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`정답 선지: ${q.answer} / 선지 수 ${q.options.length}`);
  await prisma.$disconnect();
  if (!comply || gate.length > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
