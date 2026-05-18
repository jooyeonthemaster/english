/**
 * Live audit of question-generation pipeline.
 * Reproduces the exact API flow without auth/credits.
 *
 * Tests:
 *  A) Substring-trap passage (contains "digital", "Britain", "with" etc — words that contain "it")
 *     → tries REFERENCE 'it' and CONTEXT_MEANING to provoke the substring-underline bug.
 *  B) Real DB passage at KILLER difficulty for all 19 types (smoke test).
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env") });
import { generateObject } from "ai";
import { model } from "../src/lib/ai";
import { STRUCTURED_TYPE_PROMPTS, QUESTION_SCHEMAS } from "../src/lib/question-schemas";
import { AI_QUESTION_SCHEMAS, getAiResponseSchema } from "../src/lib/question-ai-schemas-mc";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { z } from "zod";

const OUTDIR = path.join(process.cwd(), "scripts", "_gen_audit_out");
if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

// ---------------------------------------------------------------------------
// Substring-trap passage (designed to provoke the "it inside digital" bug)
// ---------------------------------------------------------------------------
const TRAP_PASSAGE = `In cities around the world, a digital revolution is reshaping daily life. Smart sensors monitor traffic and air quality, and the data they collect feeds algorithms that quietly optimize the urban environment. Many people welcome this shift, but a growing number worry that it threatens privacy in ways residents do not fully understand. When a phone tracks your movements, it is not just storing a coordinate — it is building a behavioral profile that companies and governments may later access. Critics argue that without clear consent rules, the city itself becomes a surveillance device. Supporters reply that the benefits, from reduced congestion to faster emergency response, outweigh the risks, provided that strong oversight is in place.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generateOnce(typeId: string, passage: string, count: number, difficulty: string) {
  const typePrompt = STRUCTURED_TYPE_PROMPTS[typeId] || `${typeId} 유형의 문제를 만드세요.`;
  const hasAiSchema = !!AI_QUESTION_SCHEMAS[typeId];
  const isStructured = hasAiSchema || !!QUESTION_SCHEMAS[typeId];
  const responseSchema = hasAiSchema
    ? getAiResponseSchema(typeId)
    : isStructured
      ? z.object({ questions: z.array(QUESTION_SCHEMAS[typeId]) })
      : z.object({ questions: z.array(z.any()) });

  const structuredInstructions = isStructured
    ? `\n\n## 출력 형식 안내
- 반드시 아래 유형별 지시사항의 필드 이름을 정확히 사용하세요.
- direction 필드에는 발문(한국어)을 넣으세요.
- correctAnswer 필드에는 정답 선지 label (객관식) 또는 정답 텍스트 (서술형)를 넣으세요.
- ⚠️ 지문 전체를 복사하는 필드(passageWithBlank, passageWithMarkers, passageWithUnderline, passageWithNumbers)는 절대 생성하지 마세요. 서버에서 자동 생성합니다.`
    : `\n## 출력 형식 안내
- 밑줄 친 표현은 __단어__ 형태로 감쌉니다
- 빈칸은 _____(5개 이상)으로 표시합니다`;

  const prompt = `당신은 한국 고등학교 영어 내신/수능 시험 출제 전문가입니다.

## 지문
${passage}

## 출제 유형 지시사항
${typePrompt}
${structuredInstructions}

## 생성 조건
- 문제 수: ${count}문제
- 난이도: ${difficulty}
- difficulty 필드에 반드시 "${difficulty}"을 입력하세요. 다른 값을 넣지 마세요.
- 객관식은 반드시 5개 선택지 (options 배열에 {label, text} 형태)
- 해설(explanation): 왜 정답인지 지문 근거와 함께 한국어로 작성 (3~5문장, 300자 이내로 간결하게)
- keyPoints: 3개의 학습 포인트 (각 1문장)
- wrongOptionExplanations: 각 오답이 틀린 이유를 한국어로 간결하게 (각 1~2문장)
- tags: 관련 문법/어휘/유형 태그를 한국어로

정확히 ${count}문제를 생성하세요.`;

  const { object } = await generateObject({
    model,
    schema: responseSchema,
    prompt,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 4096 } } },
  });

  const rawQuestions = (object as any).questions || [];
  const processed: any[] = [];
  const ppFailures: any[] = [];
  for (const q of rawQuestions) {
    const pp = postProcessQuestion(typeId, passage, q);
    if (!pp.success) {
      ppFailures.push({ aiRaw: q, error: pp.error });
      continue;
    }
    processed.push({ aiRaw: q, processed: pp.data, warnings: pp.warnings });
  }
  return { rawQuestions, processed, ppFailures };
}

// ---------------------------------------------------------------------------
// Bug detectors
// ---------------------------------------------------------------------------

function inspectMarkerCorrectness(passageOriginal: string, processedPassage: string, label: string) {
  // Find all __...__ markers in processed passage
  const markerRegex = /__([^_]+)__/g;
  const findings: any[] = [];
  let m: RegExpExecArray | null;
  while ((m = markerRegex.exec(processedPassage)) !== null) {
    const markerText = m[1];
    const markerStart = m.index;
    const markerEnd = m.index + m[0].length;

    // Check char before and after the marker in PROCESSED passage
    const before = processedPassage[markerStart - 1];
    const after = processedPassage[markerEnd];

    // Word boundary if non-word char on each side (or string edge)
    const leftBoundary = markerStart === 0 || !/\w/.test(before ?? "");
    const rightBoundary = markerEnd === processedPassage.length || !/\w/.test(after ?? "");

    // Substring violation if either side is mid-word
    const isSubstringInWord = !leftBoundary || !rightBoundary;

    findings.push({
      markerText,
      contextSnippet: processedPassage.slice(Math.max(0, markerStart - 12), Math.min(processedPassage.length, markerEnd + 12)),
      leftBoundary,
      rightBoundary,
      isSubstringInWord,
    });
  }
  return { label, findings };
}

function inspectKillerAccuracy(q: any) {
  // Crude heuristics — same idea as audit recommendation
  const opts = (q.options as Array<{ label: string; text: string }>) || [];
  const avgOptLen = opts.length ? opts.reduce((s, o) => s + (o.text?.length || 0), 0) / opts.length : 0;
  const explanation = (q.explanation as string) || "";
  const keyPoints = (q.keyPoints as string[]) || [];

  let score = 0;
  const signals: string[] = [];
  if (avgOptLen > 60) { score += 0.3; signals.push(`avg option length ${avgOptLen.toFixed(0)} (long → killer signal)`); }
  if (avgOptLen < 25) { score -= 0.3; signals.push(`avg option length ${avgOptLen.toFixed(0)} (short → basic signal)`); }
  if (/함축|추론|패러프레이즈|은유|행간/.test(explanation)) { score += 0.3; signals.push("explanation cites inference/implication"); }
  if (explanation.length < 80) { score -= 0.3; signals.push(`explanation length ${explanation.length} (terse → basic)`); }
  if (keyPoints.some((kp) => /킬러|함축|난이도/.test(kp))) { score += 0.2; signals.push("keyPoints mention killer signals"); }

  // Check option similarity (similar lengths → harder distractors)
  if (opts.length >= 4) {
    const lens = opts.map((o) => o.text?.length || 0);
    const max = Math.max(...lens), min = Math.min(...lens);
    if (max > 0 && (max - min) / max < 0.3) { score += 0.2; signals.push("options have similar lengths (good distractors)"); }
  }

  let assessed: "BASIC" | "INTERMEDIATE" | "KILLER" = "INTERMEDIATE";
  if (score >= 0.4) assessed = "KILLER";
  else if (score <= -0.3) assessed = "BASIC";
  return { score: Number(score.toFixed(2)), assessed, signals };
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

async function runTrapTests() {
  const results: any = { passage: TRAP_PASSAGE, tests: [] };

  // REFERENCE 'it' — the bug case
  console.log("\n[TRAP] REFERENCE x3 @ KILLER ...");
  try {
    const r = await generateOnce("REFERENCE", TRAP_PASSAGE, 3, "KILLER");
    const inspected = r.processed.map((p) => ({
      ai: {
        underlinedPronoun: p.aiRaw.underlinedPronoun,
        surroundingText: p.aiRaw.surroundingText,
        difficulty: p.aiRaw.difficulty,
        options: p.aiRaw.options,
        correctAnswer: p.aiRaw.correctAnswer,
        explanation: p.aiRaw.explanation,
      },
      passageWithUnderline: p.processed.passageWithUnderline,
      markerInspection: inspectMarkerCorrectness(TRAP_PASSAGE, p.processed.passageWithUnderline || "", "REFERENCE"),
      killerInspection: inspectKillerAccuracy(p.aiRaw),
      warnings: p.warnings,
    }));
    results.tests.push({ type: "REFERENCE", inspected, ppFailures: r.ppFailures });
  } catch (e: any) {
    results.tests.push({ type: "REFERENCE", error: e?.message || String(e) });
  }

  // CONTEXT_MEANING — another single-word underline type
  console.log("[TRAP] CONTEXT_MEANING x2 @ KILLER ...");
  try {
    const r = await generateOnce("CONTEXT_MEANING", TRAP_PASSAGE, 2, "KILLER");
    const inspected = r.processed.map((p) => ({
      ai: {
        underlinedWord: p.aiRaw.underlinedWord,
        surroundingText: p.aiRaw.surroundingText,
        difficulty: p.aiRaw.difficulty,
        options: p.aiRaw.options,
        correctAnswer: p.aiRaw.correctAnswer,
      },
      passageWithUnderline: p.processed.passageWithUnderline,
      markerInspection: inspectMarkerCorrectness(TRAP_PASSAGE, p.processed.passageWithUnderline || "", "CONTEXT_MEANING"),
      killerInspection: inspectKillerAccuracy(p.aiRaw),
      warnings: p.warnings,
    }));
    results.tests.push({ type: "CONTEXT_MEANING", inspected, ppFailures: r.ppFailures });
  } catch (e: any) {
    results.tests.push({ type: "CONTEXT_MEANING", error: e?.message || String(e) });
  }

  // VOCAB_CHOICE & GRAMMAR_ERROR — multi-marker types (substring trap can affect these too)
  for (const t of ["VOCAB_CHOICE", "GRAMMAR_ERROR"]) {
    console.log(`[TRAP] ${t} x1 @ KILLER ...`);
    try {
      const r = await generateOnce(t, TRAP_PASSAGE, 1, "KILLER");
      const inspected = r.processed.map((p) => ({
        ai: p.aiRaw,
        passageWithMarkers: p.processed.passageWithMarkers,
        markerInspection: inspectMarkerCorrectness(TRAP_PASSAGE, p.processed.passageWithMarkers || "", t),
        killerInspection: inspectKillerAccuracy(p.aiRaw),
        warnings: p.warnings,
      }));
      results.tests.push({ type: t, inspected, ppFailures: r.ppFailures });
    } catch (e: any) {
      results.tests.push({ type: t, error: e?.message || String(e) });
    }
  }

  fs.writeFileSync(path.join(OUTDIR, "trap.json"), JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n[TRAP] saved → ${path.join(OUTDIR, "trap.json")}`);
  return results;
}

async function main() {
  const trap = await runTrapTests();

  // Print summary directly
  console.log("\n\n========== TRAP TEST SUMMARY ==========");
  for (const t of trap.tests) {
    console.log(`\n--- ${t.type} ---`);
    if (t.error) { console.log(`  ERROR: ${t.error}`); continue; }
    if (t.ppFailures?.length) console.log(`  post-process failures: ${t.ppFailures.length}`);
    for (const i of t.inspected || []) {
      const violations = i.markerInspection.findings.filter((f: any) => f.isSubstringInWord);
      console.log(`  AI difficulty="${i.ai.difficulty}", heuristic-assessed="${i.killerInspection.assessed}" (score=${i.killerInspection.score})`);
      if (violations.length) {
        console.log(`  ❌ SUBSTRING-IN-WORD VIOLATIONS:`);
        for (const v of violations) {
          console.log(`     marker="${v.markerText}" context="...${v.contextSnippet}..." left=${v.leftBoundary} right=${v.rightBoundary}`);
        }
      } else {
        console.log(`  ✅ all markers at word boundaries`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
