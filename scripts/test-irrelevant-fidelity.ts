/* eslint-disable no-console */
/**
 * Phase B — Full-pipeline regression test for IRRELEVANT generation.
 *
 * For each passage, calls the real Gemini compact prompt + new IRRELEVANT
 * prompt + new postprocess pipeline. Measures fidelity at TWO layers:
 *
 *   - rawExact  : did the AI itself return each slot as exactly one original
 *                 passage sentence? (counts the underlying model behavior)
 *   - finalExact: after postprocess auto-repair, does the final user-facing
 *                 sentences[] match originals verbatim? (counts what reaches
 *                 the user)
 *
 * The whole point of the fix is to drive finalExact to 100% even if rawExact
 * still has occasional fusion.
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

// ─── Passages ──────────────────────────────────────────────────────────────
// Mix of synthetic (clean) + production (real 1618학원 passages where
// mutations were observed). Production passages have curly quotes, em dashes,
// soft hyphens, very short sentences ("No.") — i.e. the fusion triggers.

const PASSAGES: { id: string; topic: string; content: string; source: "synth" | "prod" }[] = [
  {
    id: "S1",
    topic: "Urban farming",
    source: "synth",
    content:
      "In cities around the world, a quiet revolution is taking place on rooftops and in abandoned buildings. Urban farming has grown rapidly as people seek fresh, locally grown food. Unlike traditional agriculture, urban farms use innovative techniques such as vertical farming and hydroponics to grow crops in limited spaces. These methods use significantly less water and no soil at all. Beyond providing food, urban farms create green spaces that reduce air pollution and lower temperatures in crowded neighborhoods. Community gardens also bring people together, fostering social connections in areas where neighbors rarely interact.",
  },
  {
    id: "S2",
    topic: "Sleep and memory",
    source: "synth",
    content:
      "Sleep plays a critical role in how the brain organizes new information. During the deeper stages of sleep, neural circuits replay the experiences of the day, strengthening the connections that matter most. Researchers have shown that students who sleep after studying tend to recall material more accurately than those who stay awake. This consolidation process is not limited to facts; it also applies to motor skills such as playing an instrument. Without sufficient rest, the brain struggles to transfer short-term impressions into stable long-term memory. As a result, chronic sleep deprivation can quietly erode learning even when study hours remain unchanged.",
  },
  {
    id: "PROD-Wobegon",
    topic: "Lake Wobegon effect (1618학원)",
    source: "prod",
    content:
      "We tend to believe that we possess a host of socially desirable characteristics, and that we are free of most of those that are socially undesirable. For example, a large majority of the general public thinks that they are more intelligent, more fair­minded, less prejudiced, and more skilled behind the wheel of an automobile than the average person. This phenomenon is so reliable and ubiquitous that it has come to be known as the “Lake Wobegon effect,” after Garrison Keillor’s fictional community where “the women are strong, the men are good­looking, and all the children are above average.” A survey of one million high school seniors found that 70% thought they were above average in leadership ability, and only 2% thought they were below average. In terms of ability to get along with others, all students thought they were above average, 60% thought they were in the top 10%, and 25% thought they were in the top 1%!",
  },
  {
    id: "PROD-Stress",
    topic: "Poverty/stress (1618학원)",
    source: "prod",
    content:
      "Few people will be surprised to hear that poverty tends to create stress: a 2006 study published in the American journal Psychosomatic Medicine, for example, noted that a lower socioeconomic status was associated with higher levels of stress hormones in the body. However, richer economies have their own distinct stresses. The key issue is time pressure. A 1999 study of 31 countries by American psychologist Robert Levine and Canadian psychologist Ara Norenzayan found that wealthier, more industrialized nations had a faster pace of life — which led to a higher standard of living, but at the same time left the population feeling a constant sense of urgency, as well as being more prone to heart disease. In effect, fast­paced productivity creates wealth, but it also leads people to feel time­poor when they lack the time to relax and enjoy themselves.",
  },
  {
    id: "PROD-Praise",
    topic: "Praise/preschool (1618학원)",
    source: "prod",
    content:
      "Although praise is one of the most powerful tools available for improving young children’s behavior, it is equally powerful for improving your child’s self-esteem. Preschoolers believe what their parents tell them in a very profound way. They do not yet have the cognitive sophistication to reason analytically and reject false information. If a preschool boy consistently hears from his mother that he is smart and a good helper, he is likely to incorporate that information into his self-image Thinking of himself as a boy who is smart and knows how to do things is likely to make him endure longer in problem-solving efforts and increase his confidence in trying new and difficult tasks. Similarly, thinking of himself as the kind of boy who is a good helper will make him more likely to volunteer to help with tasks at home and at preschool.",
  },
  {
    id: "PROD-Excellence",
    topic: "Basketball/excellence (1618학원, fusion case)",
    source: "prod",
    content:
      "Individuals who perform at a high level in their profession often have instant credibility with others. People admire them, they want to be like them, and they feel connected to them. When they speak, others listen ― even if the area of their skill has nothing to do with the advice they give. Think about a world-famous basketball player. He has made more money from endorsements than he ever did playing basketball. Is it because of his knowledge of the products he endorses? No. It’s because of what he can do with a basketball. The same can be said of an Olympic medalist swimmer. People listen to him because of what he can do in the pool. And when an actor tells us we should drive a certain car, we don’t listen because of his expertise on engines. We listen because we admire his talent. Excellence connects. If you possess a high level of ability in an area, others may desire to connect with you because of it.",
  },
  {
    id: "PROD-PostPurchase",
    topic: "Post-purchase behavior (1618학원)",
    source: "prod",
    content:
      "Why do you care how a customer reacts to a purchase? Good question. By understanding post­purchase behavior, you can understand the influence and the likelihood of whether a buyer will repurchase the product (and whether she will keep it or return it). You’ll also determine whether the buyer will encourage others to purchase the product from you. Satisfied customers can become unpaid ambassadors for your business, so customer satisfaction should be on the top of your to­do list. People tend to believe the opinions of people they know. People trust friends over advertisements any day. They know that advertisements are paid to tell the “good side” and that they’re used to persuade them to purchase products and services. By continually monitoring your customer’s satisfaction after the sale, you have the ability to avoid negative word­of­mouth advertising.",
  },
];

// ─── Sentence-level verifier (matches the new postprocess split rules) ────
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
function verifyVerbatim(slot: string, originals: string[]): boolean {
  const n = normalize(slot);
  if (!n) return false;
  for (const o of originals) if (normalize(o) === n) return true;
  return false;
}

// ─── Production-mirroring Gemini compact prompt ────────────────────────────
function buildCompactPrompt(passageContent: string, difficulty: string): string {
  return buildGeminiCompactGenerationPrompt({
    schoolType: "고등학교",
    gradeInfo: "2학년",
    passageContent,
    targetCandidateBlock: buildQuestionTargetCandidateBlock("IRRELEVANT", passageContent),
    typePrompt: MC_PROMPTS.IRRELEVANT,
    typeQualityRubric: getTypeQualityRubric("IRRELEVANT", difficulty),
    count: 1,
    difficulty,
  });
}

// ─── Runner ────────────────────────────────────────────────────────────────
type RunResult =
  | {
      id: string;
      source: string;
      difficulty: string;
      attempt: number;
      status: "ok";
      rawExact: number;
      finalExact: number;
      repairedCount: number;
      irrelevantIndex: number;
      warnings: string[];
    }
  | { id: string; source: string; difficulty: string; attempt: number; status: "fail" | "empty" };

async function runOne(
  p: { id: string; topic: string; content: string; source: "synth" | "prod" },
  difficulty: string,
  attempt: number,
): Promise<RunResult> {
  const originals = splitSentences(p.content);
  console.log(`\n${"=".repeat(80)}`);
  console.log(`[${p.id}|${difficulty}|run${attempt}] ${p.topic} — ${originals.length} original sentences`);
  console.log("=".repeat(80));

  const responseSchema = z.object({ questions: z.array(aiIrrelevantSchema) });
  const prompt = buildCompactPrompt(p.content, difficulty);

  let object: unknown;
  try {
    const result = await generateQuestionObject({
      schema: responseSchema,
      prompt,
      generationPlan: "STANDARD",
      logPrefix: `IRR-${p.id}-${difficulty}-r${attempt}`,
      maxRetries: 1,
      maxTokens: 6000,
    });
    object = result.object;
  } catch (err) {
    console.error(`GENERATION FAILED: ${err instanceof Error ? err.message : err}`);
    return { id: p.id, source: p.source, difficulty, attempt, status: "fail" };
  }

  const questions =
    object && typeof object === "object" && Array.isArray((object as { questions?: unknown[] }).questions)
      ? (object as { questions: Record<string, unknown>[] }).questions
      : [];
  if (!questions.length) return { id: p.id, source: p.source, difficulty, attempt, status: "empty" };

  const q = questions[0];
  const rawSentences = q.sentences as string[];
  const irrelevantIndex = Number(q.irrelevantIndex);

  // Count RAW (pre-postprocess) fidelity
  let rawExact = 0;
  for (let i = 0; i < rawSentences.length; i++) {
    if (i === irrelevantIndex) continue;
    if (verifyVerbatim(rawSentences[i], originals)) rawExact++;
  }

  // Apply NEW postprocess
  const pp = processIrrelevant(p.content, q);
  if (!pp.success) {
    console.error(`POST-PROCESS FAILED: ${pp.error}`);
    return { id: p.id, source: p.source, difficulty, attempt, status: "fail" };
  }
  const finalSentences = (pp.data as { sentences: string[] }).sentences;

  // Count FINAL (post-postprocess) fidelity
  let finalExact = 0;
  let repairedCount = 0;
  for (let i = 0; i < finalSentences.length; i++) {
    if (i === irrelevantIndex) continue;
    if (verifyVerbatim(finalSentences[i], originals)) finalExact++;
    if (finalSentences[i] !== rawSentences[i]) repairedCount++;
  }

  console.log(`irrelevantIndex: ${irrelevantIndex}`);
  console.log(`rawExact:   ${rawExact}/4   (AI behavior before repair)`);
  console.log(`finalExact: ${finalExact}/4   (after postprocess)`);
  if (repairedCount) {
    console.log(`repaired:   ${repairedCount} slot(s)`);
    for (let i = 0; i < rawSentences.length; i++) {
      if (i === irrelevantIndex) continue;
      if (finalSentences[i] !== rawSentences[i]) {
        console.log(`  ⟳ slot ${i + 1}:`);
        console.log(`     was: "${rawSentences[i].slice(0, 90)}..."`);
        console.log(`     now: "${finalSentences[i].slice(0, 90)}..."`);
      }
    }
  }
  for (const w of pp.warnings) console.log(`  ⚠ ${w}`);

  return {
    id: p.id,
    source: p.source,
    difficulty,
    attempt,
    status: "ok",
    rawExact,
    finalExact,
    repairedCount,
    irrelevantIndex,
    warnings: pp.warnings,
  };
}

async function main() {
  const RUNS_PER_PASSAGE = 2; // run each passage twice to surface nondeterminism
  const DIFFICULTIES = ["INTERMEDIATE"];

  const results: RunResult[] = [];
  for (const difficulty of DIFFICULTIES) {
    for (const p of PASSAGES) {
      for (let attempt = 1; attempt <= RUNS_PER_PASSAGE; attempt++) {
        const r = await runOne(p, difficulty, attempt);
        results.push(r);
      }
    }
  }

  // ── Final report ────────────────────────────────────────────────────────
  console.log(`\n${"#".repeat(80)}`);
  console.log("# FINAL REGRESSION REPORT");
  console.log("#".repeat(80));

  let totalRaw = 0,
    totalFinal = 0,
    totalRepaired = 0,
    okRuns = 0,
    failed = 0;
  const prodResults: RunResult[] = [];
  const synthResults: RunResult[] = [];

  for (const r of results) {
    if (r.status !== "ok") {
      failed++;
      console.log(`${r.id}/${r.difficulty}/r${r.attempt}: ${r.status}`);
      continue;
    }
    okRuns++;
    totalRaw += r.rawExact;
    totalFinal += r.finalExact;
    totalRepaired += r.repairedCount;
    if (r.source === "prod") prodResults.push(r);
    else synthResults.push(r);
    const flag = r.finalExact === 4 ? "PASS" : "FAIL";
    const rawFlag = r.rawExact === 4 ? "clean" : `${4 - r.rawExact} fused/drift`;
    console.log(
      `${r.id.padEnd(20)} ${r.difficulty.padEnd(13)} r${r.attempt}: [${flag}] raw=${r.rawExact}/4 (${rawFlag})  final=${r.finalExact}/4  repaired=${r.repairedCount}`,
    );
  }

  const denom = okRuns * 4 || 1;
  console.log(`\n── Aggregate ──`);
  console.log(`Total OK runs: ${okRuns} (failed: ${failed})`);
  console.log(`Raw   fidelity: ${totalRaw}/${denom} (${((totalRaw / denom) * 100).toFixed(1)}%)`);
  console.log(`Final fidelity: ${totalFinal}/${denom} (${((totalFinal / denom) * 100).toFixed(1)}%)`);
  console.log(`Total slots auto-repaired by postprocess: ${totalRepaired}`);

  const splitReport = (label: string, arr: RunResult[]) => {
    let r = 0,
      f = 0,
      rep = 0,
      n = 0;
    for (const x of arr) {
      if (x.status !== "ok") continue;
      r += x.rawExact;
      f += x.finalExact;
      rep += x.repairedCount;
      n += 4;
    }
    if (n === 0) return;
    console.log(
      `${label}: raw ${r}/${n} (${((r / n) * 100).toFixed(1)}%), final ${f}/${n} (${((f / n) * 100).toFixed(1)}%), repaired ${rep}`,
    );
  };
  splitReport("Synthetic ", synthResults);
  splitReport("Production", prodResults);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
