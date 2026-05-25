/* eslint-disable no-console */
/**
 * Guardrail regression test for IRRELEVANT slotCount vs passage length.
 *
 * Verifies validateIrrelevantAgainstPassage:
 *   - 4-sentence passage: any slot count → reject (passage too short)
 *   - 5-sentence passage + slotCount=10 → reject (passage shorter than request)
 *   - 7-sentence passage + slotCount=7  → ok
 *   - 10-sentence passage + slotCount=10 → ok
 *
 * Also verifies the run-question-generation safety net (auto-cap) via a
 * Gemini-backed end-to-end call with a 6-sentence passage + slotCount=10.
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { countPassageSentences } from "../src/lib/passage-sentence-utils";
import {
  validateIrrelevantAgainstPassage,
  normalizeIrrelevantSlotCount,
} from "../src/lib/question-type-generation-settings";
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

// ─── Unit tests for validation ─────────────────────────────────────────────
function runUnitTests() {
  console.log("=".repeat(70));
  console.log("UNIT: validateIrrelevantAgainstPassage");
  console.log("=".repeat(70));

  const cases = [
    { label: "4-sentence passage + req 5", passageCount: 4, request: 5, expectOk: false },
    { label: "5-sentence passage + req 5", passageCount: 5, request: 5, expectOk: true },
    { label: "5-sentence passage + req 7", passageCount: 5, request: 7, expectOk: false },
    { label: "6-sentence passage + req 10", passageCount: 6, request: 10, expectOk: false },
    { label: "7-sentence passage + req 7", passageCount: 7, request: 7, expectOk: true },
    { label: "10-sentence passage + req 10", passageCount: 10, request: 10, expectOk: true },
    { label: "12-sentence passage + req 10", passageCount: 12, request: 10, expectOk: true },
  ];

  let pass = 0;
  for (const c of cases) {
    const v = validateIrrelevantAgainstPassage(c.request, c.passageCount);
    const ok = v.ok === c.expectOk;
    pass += ok ? 1 : 0;
    const flag = ok ? "✓" : "✗";
    console.log(`${flag} ${c.label} → ok=${v.ok}${v.error ? `  msg="${v.error.slice(0, 60)}..."` : ""}`);
  }
  console.log(`\nUnit tests: ${pass}/${cases.length} passed`);
}

// ─── countPassageSentences sanity ──────────────────────────────────────────
function runSentenceCountTests() {
  console.log(`\n${"=".repeat(70)}`);
  console.log("UNIT: countPassageSentences");
  console.log("=".repeat(70));
  const cases = [
    {
      text: "A. B. C. D.",
      expected: 4,
    },
    {
      text: "Sleep is critical. Researchers studied it. Memory benefits.",
      expected: 3,
    },
    {
      text: "He said \u201CHello.\u201D Then he left. End.",
      expected: 3,
    },
  ];
  let pass = 0;
  for (const c of cases) {
    const n = countPassageSentences(c.text);
    const ok = n === c.expected;
    pass += ok ? 1 : 0;
    console.log(`${ok ? "✓" : "✗"} "${c.text.slice(0, 50)}" → ${n} (expected ${c.expected})`);
  }
  console.log(`\nSentence count tests: ${pass}/${cases.length} passed`);
}

// ─── E2E: safety net auto-cap via Gemini ───────────────────────────────────
const SHORT_PASSAGE_6 =
  "Coral reefs are among the most productive ecosystems on Earth. Tiny animals called polyps build the reef from calcium they extract from seawater. Warm, shallow tropical waters allow polyps to thrive. When ocean temperatures rise even slightly, polyps expel their algae partners and lose color. If the stress continues, the corals die and the reef collapses. Restoration projects now grow young polyps in nurseries for transplant.";

async function runSafetyNetTest() {
  console.log(`\n${"=".repeat(70)}`);
  console.log("E2E: 6-sentence passage + slotCount=10 → safety net should cap to 6");
  console.log("=".repeat(70));

  const passageCount = countPassageSentences(SHORT_PASSAGE_6);
  console.log(`Passage sentence count: ${passageCount}`);

  // Simulate what run-question-generation would do: cap slotCount, build schema/prompt.
  const requested = normalizeIrrelevantSlotCount(10);
  const effective = passageCount >= 5 && passageCount < requested ? passageCount : requested;
  console.log(`Requested: ${requested}, effective (after cap): ${effective}`);

  const typeSettingsPrompt = buildQuestionTypeSettingsPrompt("IRRELEVANT", { slotCount: effective });
  const compact = buildGeminiCompactGenerationPrompt({
    schoolType: "고등학교",
    gradeInfo: "2학년",
    passageContent: SHORT_PASSAGE_6,
    targetCandidateBlock: buildQuestionTargetCandidateBlock("IRRELEVANT", SHORT_PASSAGE_6),
    typePrompt: MC_PROMPTS.IRRELEVANT,
    typeQualityRubric: getTypeQualityRubric("IRRELEVANT", "INTERMEDIATE"),
    count: 1,
    difficulty: "INTERMEDIATE",
    customPrompt: typeSettingsPrompt,
  });

  const schema = getAiResponseSchema("IRRELEVANT", { irrelevantSlotCount: effective });
  const r = await generateQuestionObject({
    schema,
    prompt: compact,
    generationPlan: "STANDARD",
    logPrefix: "safety-net",
    maxRetries: 1,
    maxTokens: 14000,
  });
  const qs = (r.object as { questions: Record<string, unknown>[] }).questions;
  const q = qs[0];
  const raw = q.sentences as string[];
  const irrIdx = Number(q.irrelevantIndex);

  const pp = processIrrelevant(SHORT_PASSAGE_6, q);
  const finalS = (pp.data as { sentences: string[] }).sentences;
  const finalOpts = (pp.data as { options: { label: string }[] }).options;
  console.log(`Raw sentences length: ${raw.length} (expected ${effective})`);
  console.log(`Final sentences length: ${finalS.length}`);
  console.log(`Options length: ${finalOpts.length}`);
  console.log(`irrelevantIndex: ${irrIdx}`);
  if (pp.warnings.length) console.log(`Warnings: ${pp.warnings.join("; ")}`);

  const ok = raw.length === effective && finalS.length === effective && finalOpts.length === effective;
  console.log(`Result: ${ok ? "✓ PASS" : "✗ FAIL"}`);
}

async function main() {
  runUnitTests();
  runSentenceCountTests();
  await runSafetyNetTest();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
