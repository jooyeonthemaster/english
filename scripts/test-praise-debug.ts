/* eslint-disable no-console */
/**
 * Targeted debug: run PROD-Praise 5 times and dump raw sentences[] when
 * the postprocess can't snap a slot back to verbatim. Identifies whether
 * the 2/4 failure is reproducible and what the AI actually emits.
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { z } from "zod";
import { MC_PROMPTS } from "../src/lib/question-prompts-mc";
import { aiIrrelevantSchema } from "../src/lib/question-ai-schemas-mc";
import { processIrrelevant } from "../src/lib/question-postprocess/processors/irrelevant";
import { generateQuestionObject } from "../src/lib/question-generation-llm";
import {
  buildQuestionTargetCandidateBlock,
  getTypeQualityRubric,
} from "../src/lib/question-quality";
import { buildGeminiCompactGenerationPrompt } from "../src/lib/question-generation-prompt-contract";

const PRAISE =
  "Although praise is one of the most powerful tools available for improving young children’s behavior, it is equally powerful for improving your child’s self-esteem. Preschoolers believe what their parents tell them in a very profound way. They do not yet have the cognitive sophistication to reason analytically and reject false information. If a preschool boy consistently hears from his mother that he is smart and a good helper, he is likely to incorporate that information into his self-image Thinking of himself as a boy who is smart and knows how to do things is likely to make him endure longer in problem-solving efforts and increase his confidence in trying new and difficult tasks. Similarly, thinking of himself as the kind of boy who is a good helper will make him more likely to volunteer to help with tasks at home and at preschool.";

const SENTENCE_SPLIT_RE = /[^.!?]+[.!?]+[\u201D\u2019")\]]*(?=\s|$)/g;
function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const matches = cleaned.match(SENTENCE_SPLIT_RE);
  return matches ? matches.map((s) => s.trim()) : [cleaned];
}
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u00ad]/g, "")
    .replace(/[\u00a0]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?"'()\-]/g, "")
    .trim();
}

const originals = splitSentences(PRAISE);
console.log("Original passage split into sentences:");
for (let i = 0; i < originals.length; i++) {
  console.log(`  [${i}] (${originals[i].length} chars) "${originals[i].slice(0, 100)}${originals[i].length > 100 ? "..." : ""}"`);
}

async function run(attempt: number) {
  const responseSchema = z.object({ questions: z.array(aiIrrelevantSchema) });
  const prompt = buildGeminiCompactGenerationPrompt({
    schoolType: "고등학교",
    gradeInfo: "2학년",
    passageContent: PRAISE,
    targetCandidateBlock: buildQuestionTargetCandidateBlock("IRRELEVANT", PRAISE),
    typePrompt: MC_PROMPTS.IRRELEVANT,
    typeQualityRubric: getTypeQualityRubric("IRRELEVANT", "INTERMEDIATE"),
    count: 1,
    difficulty: "INTERMEDIATE",
  });

  const result = await generateQuestionObject({
    schema: responseSchema,
    prompt,
    generationPlan: "STANDARD",
    logPrefix: `praise-debug-r${attempt}`,
    maxRetries: 1,
    maxTokens: 6000,
  });
  const qs = (result.object as { questions: Record<string, unknown>[] }).questions;
  const q = qs[0];
  const raw = q.sentences as string[];
  const irrIdx = Number(q.irrelevantIndex);
  const pp = processIrrelevant(PRAISE, q);
  const final = (pp.data as { sentences: string[] }).sentences;

  console.log(`\n--- run ${attempt} | irrelevantIndex=${irrIdx} ---`);
  let mismatched = 0;
  for (let i = 0; i < raw.length; i++) {
    if (i === irrIdx) {
      console.log(`  [${i}] ✦ IRR: "${raw[i].slice(0, 80)}..."`);
      continue;
    }
    const r = normalize(raw[i]);
    const matched = originals.find((o) => normalize(o) === r);
    const finalMatched = originals.find((o) => normalize(o) === normalize(final[i]));
    const changed = raw[i] !== final[i];
    const tag = finalMatched ? "✓" : "✗";
    console.log(`  [${i}] ${tag} ${changed ? "REPAIRED" : "unchanged"}`);
    if (!matched) {
      console.log(`       raw  : "${raw[i]}"`);
    }
    if (changed) {
      console.log(`       final: "${final[i]}"`);
    }
    if (!finalMatched) {
      mismatched++;
      console.log(`       (no original match — postprocess could not repair)`);
    }
  }
  if (pp.warnings.length) console.log(`  warnings: ${pp.warnings.join("; ")}`);
  return mismatched;
}

async function main() {
  let totalMismatch = 0;
  for (let i = 1; i <= 5; i++) {
    totalMismatch += await run(i);
  }
  console.log(`\nTotal mismatched slots across 5 runs: ${totalMismatch}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
