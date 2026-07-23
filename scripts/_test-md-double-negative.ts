// 부정-부정 md 탑재 검증 (26-07-23) — 실지문 1콜: DN 모드 블록 → 파서·게이트 →
// 어댑터(DOUBLE_NEGATIVE) → 후처리 → 정답에 부정 기제 실재 + 원문 축자 빈칸 실증.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DN_BLOCK = [
  "## 정답 형식: 부정-부정 빈칸 (필수 — 위의 정답 형식 지시를 이 절이 대체한다)",
  "- 정답 선지는 빈칸원문의 의미를 정확히 보존하는 **부정/결여 패러프레이즈**다: not+반대 개념, without, lack(ing), fail to, prevent/keep ... from, cannot ... without, free from, non-/un-/in- 계열 중 **명확한 부정 기제 1개**를 사용하라.",
  "- 빈칸원문은 여전히 지문 축자 그대로 뽑는다(변형은 정답 선지에서만 일어난다).",
  "- 표적은 논리적 동작·관계를 담은 구(동사구·동명사구·분사구·수식 명사구)로 잡아라 — 단일 추상명사, 구두점 포함 구간, 예시 나열 자리(such as/including 뒤)는 금지.",
  "- 부정 기제 사슬 금지: not...without 꼬임, fail 중복, 'No 주어 + 부정 술어' 구조는 만들지 마라. 정답을 빈칸에 끼운 완성문이 자연스럽고 원문과 논리 등가(축소·과장·반전 없음)인지 소리 내어 검산하라.",
  "- 문법 슬롯 보존: 전치사 뒤 빈칸이면 정답이 또 전치사로 시작하면 안 되고, be동사 뒤면 보어구여야 한다.",
  "- 오답 설계: **최소 2개의 오답에도 부정/결여 표현을 넣어** 부정어 유무만으로 정답이 식별되지 않게 하라. 오답은 지문 키워드·같은 의미장을 재활용하되 극성·범위·인과 역할·논지 방향의 미세한 이동으로 틀리게 만든다. 형식·길이·추상 층위는 다섯 선지 평행.",
].join("\n");

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
  const prompt = buildMdBlankPrompt(passage.content, "full", "KILLER") + "\n\n" + DN_BLOCK;
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
  const adapt = adaptMdBlankToAiQuestion(q, passage.content, "KILLER", "DOUBLE_NEGATIVE");
  if (!adapt.ok || !adapt.aiQuestion) { console.log("어댑터 실패", adapt.error); process.exit(1); }
  const pp = postProcessQuestion("BLANK_INFERENCE", passage.content, adapt.aiQuestion);
  if (!pp.success || !pp.data) { console.log("후처리 실패", pp.error); process.exit(1); }
  const d = pp.data as any;
  const answerText = (d.options as Array<{label:string;text:string}>).find((o) => o.label === d.correctAnswer)?.text ?? "";
  const oe = q.originalExpression ?? "";
  const NEG = /\b(not|no|never|without|lack\w*|fail\w*|prevent\w*|cannot|unable|impossible|free from|non-|un\w+|in(?:capable|complete|sufficient)\w*)\b/i;
  const negHit = NEG.test(answerText);
  const notVerbatim = normalizeWs(answerText) !== normalizeWs(oe);
  const verbatimSpan = normalizeWs(passage.content).includes(normalizeWs(oe));
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s / 게이트: ${gate.length === 0 ? "PASS" : gate.join("; ")}`);
  console.log(`빈칸원문(축자 ${verbatimSpan ? "✓" : "✗"}): "${oe.slice(0, 80)}"`);
  console.log(`정답 선지: "${answerText.slice(0, 90)}"`);
  console.log(`부정 기제 포함: ${negHit ? "PASS ✓" : "FAIL ✗"} / 원문 비축자(변형됨): ${notVerbatim ? "PASS ✓" : "FAIL ✗"}`);
  await prisma.$disconnect();
  if (!negHit || !notVerbatim || !verbatimSpan || gate.length > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
