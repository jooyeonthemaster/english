/**
 * Smoke-test ALL 20 question types at KILLER difficulty using a real DB passage.
 * Saves raw outputs + per-question marker/killer analysis to JSON for inspection.
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

const ALL_TYPES = [
  "BLANK_INFERENCE", "GRAMMAR_ERROR", "VOCAB_CHOICE",
  "SENTENCE_ORDER", "SENTENCE_INSERT", "TOPIC_MAIN_IDEA",
  "TITLE", "IMPLIED_MEANING", "REFERENCE", "CONTENT_MATCH", "IRRELEVANT",
  "CONDITIONAL_WRITING", "SENTENCE_TRANSFORM", "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE", "WORD_ORDER", "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING", "SYNONYM", "ANTONYM",
];

// Real passage from DB (sunk cost fallacy)
const PASSAGE = `Few mistakes in reasoning are as common as the tendency to throw good money after bad. Economists call it the sunk cost fallacy: the belief that past investments justify future commitments, even when the future looks dim. A factory that has spent millions developing a doomed product will often keep pouring resources into it, simply because so much has already been invested. The same logic infects everyday life: people sit through bad films because they paid for the ticket, stay in unproductive relationships because of the years already invested, and persist in failing careers because turning back would feel like an admission of defeat. Rational decision-making, by contrast, requires evaluating each new choice on its own merits, asking not what has been spent but what is still to gain. The hardest lesson in economics, then, may also be the hardest lesson in life.`;

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
- ⚠️ 지문 전체를 복사하는 필드는 절대 생성하지 마세요. 서버에서 자동 생성합니다.`
    : "";

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
- 해설(explanation): 한국어 3~5문장
- keyPoints: 3개
- wrongOptionExplanations: 각 오답 해설
- tags: 한국어 태그

정확히 ${count}문제를 생성하세요.`;

  const { object } = await generateObject({
    model, schema: responseSchema, prompt,
  });
  return (object as any).questions || [];
}

function inspectMarkers(processedPassage: string) {
  const re = /__([^_]+)__/g;
  const findings: any[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(processedPassage)) !== null) {
    const start = m.index, end = m.index + m[0].length;
    const before = processedPassage[start - 1];
    const after = processedPassage[end];
    const leftOK = start === 0 || !/\w/.test(before ?? "");
    const rightOK = end === processedPassage.length || !/\w/.test(after ?? "");
    findings.push({
      marker: m[1],
      ctx: processedPassage.slice(Math.max(0, start - 15), Math.min(processedPassage.length, end + 15)),
      leftOK, rightOK,
      bad: !leftOK || !rightOK,
    });
  }
  return findings;
}

function inspectKiller(q: any) {
  const opts = (q.options as any[]) || [];
  const avgLen = opts.length ? opts.reduce((s: number, o: any) => s + (o.text?.length || 0), 0) / opts.length : 0;
  const expl = (q.explanation as string) || "";
  let score = 0;
  const sig: string[] = [];
  if (avgLen > 60) { score += 0.3; sig.push(`opts long (${avgLen.toFixed(0)})`); }
  if (avgLen < 25 && avgLen > 0) { score -= 0.3; sig.push(`opts short (${avgLen.toFixed(0)})`); }
  if (/함축|추론|패러프레이즈|은유|행간|역설|반어|중의|복합/.test(expl)) { score += 0.3; sig.push("inference cues in explanation"); }
  if (expl.length < 80) { score -= 0.3; sig.push(`expl short (${expl.length})`); }
  if (opts.length >= 4) {
    const lens = opts.map((o: any) => o.text?.length || 0);
    const max = Math.max(...lens), min = Math.min(...lens);
    if (max > 0 && (max - min) / max < 0.3) { score += 0.2; sig.push("similar opt lengths"); }
  }
  let assessed: "BASIC" | "INTERMEDIATE" | "KILLER" = "INTERMEDIATE";
  if (score >= 0.4) assessed = "KILLER";
  else if (score <= -0.3) assessed = "BASIC";
  return { score: Number(score.toFixed(2)), assessed, sig };
}

async function runType(typeId: string): Promise<any> {
  try {
    console.log(`▶ ${typeId} ...`);
    const raw = await generateOnce(typeId, PASSAGE, 1, "KILLER");
    const items: any[] = [];
    for (const q of raw) {
      const pp = postProcessQuestion(typeId, PASSAGE, q);
      const processed = pp.success ? pp.data : null;
      const passageField = processed?.passageWithUnderline || processed?.passageWithMarkers || processed?.passageWithBlank || processed?.passageWithNumbers || "";
      items.push({
        ai: q,
        processed,
        ppSuccess: pp.success,
        ppError: pp.error,
        ppWarnings: pp.warnings,
        markers: passageField ? inspectMarkers(passageField) : [],
        killer: inspectKiller(q),
      });
    }
    console.log(`✓ ${typeId} done`);
    return { typeId, items };
  } catch (e: any) {
    console.log(`✗ ${typeId} error: ${e?.message}`);
    return { typeId, error: e?.message || String(e) };
  }
}

async function main() {
  // Run in parallel — 19 LLM calls
  const results = await Promise.all(ALL_TYPES.map(runType));
  fs.writeFileSync(path.join(OUTDIR, "all19.json"), JSON.stringify({ passage: PASSAGE, results }, null, 2), "utf-8");
  console.log(`\nsaved → ${path.join(OUTDIR, "all19.json")}`);

  // Summary
  console.log("\n========== ALL-19 KILLER + MARKER SUMMARY ==========");
  console.log("Type                  | AI=KILLER | Heuristic | Substring-bad | PP-success | Direction sample");
  console.log("-".repeat(120));
  for (const r of results) {
    if (r.error) {
      console.log(`${r.typeId.padEnd(20)} | ERROR: ${r.error.slice(0, 80)}`);
      continue;
    }
    for (const it of r.items) {
      const aiDiff = it.ai?.difficulty ?? "?";
      const heur = it.killer?.assessed ?? "?";
      const bad = (it.markers || []).filter((m: any) => m.bad).length;
      const dirSample = (it.ai?.direction || "").slice(0, 40);
      console.log(`${r.typeId.padEnd(20)} | ${String(aiDiff).padEnd(9)} | ${heur.padEnd(9)} | ${String(bad).padEnd(13)} | ${String(it.ppSuccess).padEnd(10)} | ${dirSample}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
