// SOURCE_EXACT(빈칸 변형 OFF) 검증 (26-07-23) — 실지문 1콜: 모드 블록 주입 →
// 파서·게이트 → 어댑터(SOURCE_EXACT) → 후처리 → 최종 정답 선지가 빈칸원문
// 축자인지 실증.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { buildMdBlankPrompt } = await import("../src/lib/md-qgen/prompts");
  const { parseMdBlank, autoSnapBlankExpression, gateMdQuestion, normalizeWs } = await import("../src/lib/md-qgen/parser");
  const { adaptMdBlankToAiQuestion } = await import("../src/lib/md-qgen/adapter");
  const { postProcessQuestion } = await import("../src/lib/question-postprocess");

  const passage = await prisma.passage.findFirst({
    where: { title: { contains: "고3 10월 영어 23번" } },
    select: { title: true, content: true },
  });
  if (!passage) { console.log("지문 없음"); process.exit(1); }

  const modeBlock = `## 정답 형식 (필수 — 위의 '추상 패러프레이즈' 지시보다 우선한다)\n- '빈칸 변형' 미사용 설정이다: 정답 선지는 빈칸원문을 **한 글자도 바꾸지 말고 그대로** 써라.\n- 오답 4개는 정답과 같은 문법 형식·길이·추상 층위로 설계해, 원문 축자 정답이 형식만으로 표나지 않게 하라. 오답 기제 4종 규칙은 그대로 적용한다.`;
  const prompt = buildMdBlankPrompt(passage.content, "full", "KILLER") + "\n\n" + modeBlock;

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
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s / 게이트: ${gate.length === 0 ? "PASS" : gate.join("; ")}`);
  const adapt = adaptMdBlankToAiQuestion(q, passage.content, "KILLER", "SOURCE_EXACT");
  if (!adapt.ok || !adapt.aiQuestion) { console.log("어댑터 실패", adapt.error); process.exit(1); }
  const pp = postProcessQuestion("BLANK_INFERENCE", passage.content, adapt.aiQuestion);
  if (!pp.success || !pp.data) { console.log("후처리 실패", pp.error); process.exit(1); }
  const d = pp.data as any;
  const answerLabel = d.correctAnswer;
  const answerText = (d.options as Array<{label: string; text: string}>).find((o) => o.label === answerLabel)?.text ?? "";
  const oe = q.originalExpression ?? "";
  const exact = normalizeWs(answerText) === normalizeWs(oe);
  console.log(`빈칸원문: "${oe.slice(0, 90)}"`);
  console.log(`최종 정답 선지: "${answerText.slice(0, 90)}"`);
  console.log(`SOURCE_EXACT 집행: ${exact ? "PASS ✓ (정답 = 원문 축자)" : "FAIL ✗"}`);
  await prisma.$disconnect();
  if (!exact || gate.length > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
