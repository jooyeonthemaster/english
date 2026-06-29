/* eslint-disable no-console */
/**
 * TOPIC_SENTENCE_WRITING (주제문 영작) — 적대적 실생성 E2E 검증.
 *   npx tsx scripts/_tsw_e2e.ts
 * 모드(scrambled/cloze) × 주제형태(sentence/nounPhrase) × 난이도(기본/중급/킬러) + 오버라이드 매트릭스.
 * 각 케이스: 실모델 생성(PREMIUM→STANDARD) → 스키마 → 품질게이트 → 학생직렬화 누수검사 → 구조검사 → 발문일치.
 * 통과분 c:\tmp\tsw-samples\questions.json 저장.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { STRUCTURED_TYPE_PROMPTS } from "../src/lib/question-schemas";
import { getAiResponseSchema } from "../src/lib/question-ai-schemas-mc";
import { generateQuestionObject } from "../src/lib/question-generation-llm";
import {
  buildQuestionTargetCandidateBlock,
  getTypeQualityRubric,
  validateQuestionQuality,
} from "../src/lib/question-quality";
import { buildGeminiCompactGenerationPrompt } from "../src/lib/question-generation-prompt-contract";
import {
  buildQuestionTypeSettingsPrompt,
  readTopicSentenceWritingBlankCountSetting,
  resolveTopicSentenceWritingSettings,
  buildTopicSentenceWritingDirection,
} from "../src/lib/question-type-generation-settings";
import { buildGeneratedQuestionText } from "../src/lib/question-generation-persistence";
import { reshuffleTopicSentenceWritingChips, chipsAreInAnswerOrder } from "@/lib/topic-sentence-writing";

const SUBTYPE = "TOPIC_SENTENCE_WRITING";
const OUT_DIR = "c:\\tmp\\tsw-samples";

const PASSAGES: { id: string; topic: string; content: string }[] = [
  {
    id: "P-Datafication",
    topic: "Datafication of emotion",
    content:
      "A rise in quantification can be experienced as a threat to the quality of psychological life. Datafication of emotion often involves a quantification of bodies as part of the categorisation of emotion: for instance, analysing faces through the generation of data points as part of the categorisation of expressions rendered as the manifestation of emotions. This is part of the technologisation of emotion that is underway, which does not allow for inclusion of the quality of emotional and affective activity, such as the experiential dimensions of emotion — which are not neatly and entirely captured through a focus only on facial (or other physiological) expressions. Emotion and affect have become part of a computational move in relation to psychology, something that was previously primarily concerned with cognition (e.g. artificial intelligence). The computational gaze is fast broadening to incorporate affective life, which is introducing new quantified systems of emotional knowledge that are feeding into the cultural consciousness.",
  },
  {
    id: "P-Attention",
    topic: "Attention economy",
    content:
      "In the modern digital landscape, human attention has become the scarcest and most valuable resource. Technology companies design their platforms to capture and hold attention for as long as possible, because every additional minute translates into advertising revenue. This incentive structure means that products are engineered not to serve users' long-term interests but to exploit psychological vulnerabilities such as the desire for social approval and the fear of missing out. As a result, individuals increasingly find their focus fragmented and their capacity for sustained, deep thought eroded. Reclaiming attention, therefore, is not merely a matter of personal discipline but a structural challenge posed by an economy built to monetize distraction.",
  },
];

interface Case { id: string; label: string; rawSettings: Record<string, unknown>; }

const CASES: Case[] = [
  { id: "C1", label: "기본 기본값(배열·명사구·구단위·미끼0)", rawSettings: { difficulty: "BASIC" } },
  { id: "C2", label: "중급 기본값(배열·문장·단어단위·미끼1)", rawSettings: { difficulty: "INTERMEDIATE" } },
  { id: "C3", label: "킬러 기본값(빈칸완성·문장·미끼2·어형변형·2빈칸·추론)", rawSettings: { difficulty: "KILLER" } },
  { id: "C4", label: "기본+문장 배열 오버라이드", rawSettings: { difficulty: "BASIC", topicForm: "sentence" } },
  { id: "C5", label: "중급+빈칸완성 오버라이드", rawSettings: { difficulty: "INTERMEDIATE", mode: "cloze" } },
  { id: "C6", label: "킬러+배열 오버라이드(난이도 배열)", rawSettings: { difficulty: "KILLER", mode: "scrambled" } },
  { id: "C7", label: "빈칸완성·명사구(1빈칸)", rawSettings: { difficulty: "INTERMEDIATE", mode: "cloze", topicForm: "nounPhrase" } },
  { id: "C8", label: "킬러 빈칸완성 1빈칸 오버라이드", rawSettings: { difficulty: "KILLER", blankCount: 1 } },
  { id: "C9", label: "중급 배열·힌트 없음", rawSettings: { difficulty: "INTERMEDIATE", hintEnabled: false } },
  { id: "C10", label: "기본 배열·미끼2 오버라이드", rawSettings: { difficulty: "BASIC", distractors: 2 } },
];

function buildPrompt(passageContent: string, rawSettings: Record<string, unknown>, difficulty: string): string {
  const typePrompt = STRUCTURED_TYPE_PROMPTS[SUBTYPE] || `${SUBTYPE} 유형의 문제를 만드세요.`;
  const typeQualityRubric = getTypeQualityRubric(SUBTYPE, difficulty);
  const targetCandidateBlock = buildQuestionTargetCandidateBlock(SUBTYPE, passageContent, { requestedDifficulty: difficulty });
  const typeSettingsPrompt = buildQuestionTypeSettingsPrompt(SUBTYPE, rawSettings, difficulty);
  return buildGeminiCompactGenerationPrompt({
    schoolType: "고등학교", gradeInfo: "2학년", passageContent, targetCandidateBlock,
    typePrompt, typeQualityRubric, count: 1, difficulty, customPrompt: typeSettingsPrompt,
  });
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

function collectSecrets(q: Record<string, unknown>): string[] {
  // 진짜 누수 벡터만: 완성 정답(modelAnswer)과 빈칸 정답(blanks[].answer)의 "연속 어구".
  // 제외: wordBankDistractors(미끼는 의도적으로 학생노출 칩) / scoringCriteria·acceptableVariants
  // (교사면 전용, 직렬화 안 됨 — 영어단어 우연일치 노이즈). 어구 단위(2+토큰)만 검사.
  const out: string[] = [];
  if (q.modelAnswer) out.push(String(q.modelAnswer));
  if (Array.isArray(q.blanks)) for (const b of q.blanks as Record<string, unknown>[]) {
    if (b.answer) out.push(String(b.answer));
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

async function tryGenerate(prompt: string, blankCount: number, logPrefix: string) {
  const schema = getAiResponseSchema(SUBTYPE, { topicSentenceWritingBlankCount: blankCount });
  const plans: { plan: "PREMIUM" | "STANDARD"; tag: string }[] = [
    { plan: "PREMIUM", tag: "PREMIUM(Claude)" },
    { plan: "STANDARD", tag: "STANDARD(Gemini)" },
  ];
  let lastErr = "";
  for (const { plan, tag } of plans) {
    try {
      const result = await generateQuestionObject({ schema, prompt, generationPlan: plan, logPrefix: `${logPrefix}-${plan}`, maxRetries: 1, maxTokens: 6000 });
      const obj = result.object as { questions?: Record<string, unknown>[] };
      const q = Array.isArray(obj?.questions) && obj.questions[0] ? obj.questions[0] : null;
      if (q) return { q, plan: tag, error: "" };
      lastErr = `${plan}: empty`;
    } catch (err) {
      lastErr = `${plan}: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(`  ${plan} failed: ${lastErr}`);
    }
  }
  return { q: null as Record<string, unknown> | null, plan: "gen_unavailable", error: lastErr };
}

async function main() {
  console.log("# TOPIC_SENTENCE_WRITING E2E 적대 검증");
  let generated = 0, passed = 0, failed = 0, leakTotal = 0, gateErrTotal = 0;
  const failures: { case: string; reasons: string[] }[] = [];
  const samples: unknown[] = [];
  const sampleLines: string[] = [];
  let anyReal = false, usedModel = "none";

  for (const c of CASES) {
    const difficulty = String(c.rawSettings.difficulty || "INTERMEDIATE");
    const resolved = resolveTopicSentenceWritingSettings(c.rawSettings, difficulty);
    const expectedDirection = buildTopicSentenceWritingDirection(resolved);
    const blankCount = readTopicSentenceWritingBlankCountSetting(c.rawSettings) || resolved.blankCount;
    const passage = PASSAGES[CASES.indexOf(c) % PASSAGES.length];
    console.log("\n" + "=".repeat(78));
    console.log(`CASE ${c.id} — ${c.label}`);
    console.log(`  resolved: mode=${resolved.mode} topicForm=${resolved.topicForm} distr=${resolved.distractors} fidel=${resolved.fidelity} blanks=${resolved.blankCount} hint=${resolved.hintEnabled}`);
    console.log(`  expected DIR: ${expectedDirection}`);
    const prompt = buildPrompt(passage.content, c.rawSettings, difficulty);
    const gen = await tryGenerate(prompt, blankCount, `TSW-${c.id}`);
    if (!gen.q) { console.warn(`  GEN UNAVAILABLE: ${gen.error}`); continue; }
    anyReal = true; usedModel = gen.plan; generated++;
    // 프로덕션 미러: 생성 후처리에서 칩을 정답 어순에서 떼어 놓는다(run-question-generation 와 동일).
    const q = reshuffleTopicSentenceWritingChips(gen.q as Record<string, unknown>);
    const reasons: string[] = [];

    const schema = getAiResponseSchema(SUBTYPE, { topicSentenceWritingBlankCount: blankCount });
    const sp = schema.safeParse({ questions: [q] });
    if (!sp.success) reasons.push("schema: " + sp.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}:${i.message}`).join("; "));

    let gateErrs: string[] = [];
    try {
      const issues = validateQuestionQuality({ typeId: SUBTYPE, question: q, passage: passage.content, requestedDifficulty: difficulty, stemLanguage: "ko", optionLanguage: "en", topicSentenceWritingBlankCount: blankCount } as any);
      gateErrs = issues.filter((i: any) => i.severity === "error").map((i: any) => `${i.code}: ${i.message}`);
    } catch (e) { reasons.push("validator threw: " + (e instanceof Error ? e.message : String(e))); }
    if (gateErrs.length) { gateErrTotal += gateErrs.length; reasons.push(...gateErrs.map((g) => "GATE " + g)); }

    const studentText = buildGeneratedQuestionText({ _typeId: SUBTYPE, ...q });
    // [보기]/[배열 단어] 칩 줄은 정답 단어를 의도적으로 담는다(학생이 그 단어로 조립).
    // 진짜 누수는 정답 "어구"가 [주제문] 프레임이나 [주제 힌트]에 통째로 박히는 것 →
    // 칩 줄을 제외한 텍스트에서 연속 어구 검사. (배열 모드는 modelAnswer 전체가 셔플돼
    // 연속으로 안 나타나므로 칩 줄 포함 여부와 무관.)
    const leakCheckText = studentText
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("[보기]") && !l.trimStart().startsWith("[배열 단어]"))
      .join("\n");
    const nText = norm(leakCheckText);
    const secrets = collectSecrets(q);
    const leaks: string[] = [];
    for (const sec of secrets) {
      const ns = norm(sec);
      if (ns.split(" ").length >= 2 && nText.includes(ns)) leaks.push(sec);
    }
    if (leaks.length) { leakTotal += leaks.length; reasons.push("LEAK: " + leaks.slice(0, 3).join(" | ")); }

    const mode = String(q.mode || resolved.mode);
    const ans = String(q.modelAnswer || "");
    if (mode === "scrambled") {
      const sw = Array.isArray(q.scrambledWords) ? (q.scrambledWords as string[]) : [];
      if (sw.length < 3) reasons.push(`scrambled: too few chips (${sw.length})`);
      if (norm(sw.join(" ")) === norm(q.modelAnswer)) reasons.push("scrambled: chips already in answer order (LEAK)");
      if (chipsAreInAnswerOrder(sw, ans)) reasons.push("scrambled: chips read in answer order (ORDER LEAK)");
      if (Array.isArray(q.blanks) && (q.blanks as unknown[]).length > 0) reasons.push("scrambled: blanks should be empty");
    } else {
      const swb = String(q.summaryWithBlanks || "");
      if (!/\(A\)/.test(swb)) reasons.push("cloze: summaryWithBlanks missing (A) marker");
      const blanks = Array.isArray(q.blanks) ? (q.blanks as Record<string, unknown>[]) : [];
      if (!blanks.length) reasons.push("cloze: no blanks");
      for (const b of blanks) if (!String(b.answer || "").trim()) reasons.push(`cloze: blank ${b.label} empty answer`);
      const wb = Array.isArray(q.wordBank) ? (q.wordBank as string[]) : [];
      if (chipsAreInAnswerOrder(wb, ans)) reasons.push("cloze: wordBank reads in answer order (ORDER LEAK)");
    }
    if (String(q.direction || "").trim() !== expectedDirection.trim()) {
      reasons.push(`direction mismatch:\n      got: ${q.direction}\n      exp: ${expectedDirection}`);
    }

    const ok = reasons.length === 0;
    if (ok) {
      passed++;
      samples.push({ id: c.id, difficulty, mode, structuredData: q, questionText: studentText });
      const keyLine = studentText.split("\n").find((l) => l.startsWith("[주제문]") || l.startsWith("[배열 단어]")) || "";
      sampleLines.push(`${c.id}: ${keyLine}`);
      console.log(`  PASS via ${gen.plan}`);
      console.log("  STUDENT TEXT:\n" + studentText.split("\n").map((l) => "    " + l).join("\n"));
    } else {
      failed++; failures.push({ case: `${c.id}/${passage.id}`, reasons });
      console.log(`  FAIL: \n` + reasons.map((r) => "    - " + r).join("\n"));
      console.log("  modelAnswer(secret): " + q.modelAnswer);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}\\questions.json`, JSON.stringify(samples, null, 2), "utf-8");

  const out = { ok: anyReal && failed === 0 && leakTotal === 0, model: usedModel, generated, passed, failed, leakTotal, gateErrTotal, failures, sampleLines };
  console.log("\n===RESULT_JSON_START===");
  console.log(JSON.stringify(out, null, 2));
  console.log("===RESULT_JSON_END===");
}
main().catch((e) => { console.error(e); process.exit(1); });
