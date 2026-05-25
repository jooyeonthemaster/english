/**
 * Regression test for variable slot count (5/7/10).
 * Uses Gemini compact prompt + dynamic schema + new IRRELEVANT settings prompt.
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { MC_PROMPTS } from "../src/lib/question-prompts-mc";
import { getAiResponseSchema } from "../src/lib/question-ai-schemas-mc";
import { processIrrelevant } from "../src/lib/question-postprocess/processors/irrelevant";
import { generateQuestionObject } from "../src/lib/question-generation-llm";
import {
  buildQuestionTargetCandidateBlock,
  getTypeQualityRubric,
} from "../src/lib/question-quality";
import { buildGeminiCompactGenerationPrompt } from "../src/lib/question-generation-prompt-contract";
import { buildQuestionTypeSettingsPrompt } from "../src/lib/question-type-generation-settings";

// Long passage with > 10 sentences so slot-count is the binding constraint.
const PASSAGE =
  "Coral reefs are among the most productive ecosystems on Earth. They support roughly a quarter of all marine species, despite covering less than one percent of the ocean floor. The reefs themselves are built by tiny animals called polyps, which extract calcium from seawater to construct stony skeletons. Warm, shallow tropical waters provide the ideal conditions for these animals to thrive. Each polyp lives in close partnership with microscopic algae that give the coral its color and most of its energy. When ocean temperatures rise even slightly, however, the polyps expel the algae and lose their color in a process known as bleaching. If the stress continues, the corals die and the reef structure begins to collapse. Once a reef is lost, the thousands of species that depend on it must move elsewhere or perish. Storm damage, overfishing, and acidifying water make recovery even harder. Marine biologists are now experimenting with heat-tolerant coral strains, hoping to give reefs a fighting chance against warmer oceans. Restoration projects also include coral nurseries that grow young polyps for transplant onto damaged reefs.";

const SENTENCE_SPLIT_RE = /[^.!?]+[.!?]+[\u201D\u2019")\]]*(?=\s|$)/g;
function splitSentences(t: string): string[] {
  const c = t.replace(/\s+/g, " ").trim();
  return c.match(SENTENCE_SPLIT_RE)?.map((s) => s.trim()) ?? [c];
}
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?"'()\-]/g, "")
    .trim();
}
function isVerbatim(slot: string, originals: string[]): boolean {
  const n = normalize(slot);
  return originals.some((o) => normalize(o) === n);
}

async function runOne(slotCount: number) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Testing slotCount=${slotCount}`);
  console.log("=".repeat(80));

  const typeSettings = { slotCount };
  const typeSettingsPrompt = buildQuestionTypeSettingsPrompt("IRRELEVANT", typeSettings);
  console.log(`\n--- TypeSettingsPrompt ---\n${typeSettingsPrompt}\n---`);

  const compact = buildGeminiCompactGenerationPrompt({
    schoolType: "고등학교",
    gradeInfo: "2학년",
    passageContent: PASSAGE,
    targetCandidateBlock: buildQuestionTargetCandidateBlock("IRRELEVANT", PASSAGE, {
      irrelevantSlotCount: slotCount,
      requestedDifficulty: "INTERMEDIATE",
    }),
    typePrompt: MC_PROMPTS.IRRELEVANT,
    typeQualityRubric: getTypeQualityRubric("IRRELEVANT", "INTERMEDIATE"),
    count: 1,
    difficulty: "INTERMEDIATE",
    customPrompt: typeSettingsPrompt,
  });

  const schema = getAiResponseSchema("IRRELEVANT", { irrelevantSlotCount: slotCount });
  let object: unknown;
  try {
    const r = await generateQuestionObject({
      schema,
      prompt: compact,
      generationPlan: "STANDARD",
      logPrefix: `slot${slotCount}`,
      maxRetries: 1,
      maxTokens: 14000,
    });
    object = r.object;
  } catch (e) {
    console.error(`Generation failed: ${e instanceof Error ? e.message : e}`);
    return { slotCount, ok: false };
  }

  const qs = (object as { questions: Record<string, unknown>[] }).questions;
  if (!qs?.length) {
    console.warn("Empty");
    return { slotCount, ok: false };
  }
  const q = qs[0];
  const raw = q.sentences as string[];
  const irrIdx = Number(q.irrelevantIndex);

  const pp = processIrrelevant(PASSAGE, q);
  if (!pp.success) {
    console.error(`PostProcess failed: ${pp.error}`);
    return { slotCount, ok: false };
  }
  const finalS = (pp.data as { sentences: string[] }).sentences;
  const finalOpts = (pp.data as { options: { label: string }[] }).options;
  const passageWith = (pp.data as { passageWithNumbers: string }).passageWithNumbers;
  const correct = (pp.data as { correctAnswer: string }).correctAnswer;

  const originals = splitSentences(PASSAGE);
  let exact = 0;
  for (let i = 0; i < finalS.length; i++) {
    if (i === irrIdx) continue;
    if (isVerbatim(finalS[i], originals)) exact++;
  }

  console.log(`Raw length: ${raw.length}, requested: ${slotCount} → ${raw.length === slotCount ? "✓" : "✗"}`);
  console.log(`Final length: ${finalS.length}, options length: ${finalOpts.length}`);
  console.log(`irrelevantIndex: ${irrIdx}, correctAnswer: ${correct}`);
  console.log(`Verbatim (non-irrelevant): ${exact}/${finalS.length - 1}`);
  console.log(`PassageWithNumbers markers: ${(passageWith.match(/[\u2460-\u2469]/g) ?? []).length}`);
  console.log(`Warnings: ${pp.warnings.length ? pp.warnings.join("; ") : "none"}`);
  console.log(`\n--- passageWithNumbers ---\n${passageWith}\n---`);

  return {
    slotCount,
    ok: raw.length === slotCount && exact === finalS.length - 1,
    exact,
    finalLen: finalS.length,
  };
}

async function main() {
  const results = [];
  for (const n of [5, 7, 10]) {
    results.push(await runOne(n));
  }
  console.log("\n##### SUMMARY #####");
  for (const r of results) {
    console.log(JSON.stringify(r));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
