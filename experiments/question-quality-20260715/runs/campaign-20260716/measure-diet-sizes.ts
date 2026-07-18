/** G4 diet + 빈칸 contract 다이어트의 프롬프트 크기 효과 실측 (무API). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGrammarErrorCandidateBlock } from "../../../../src/lib/question-quality/candidate-blocks/grammar";
import { GRAMMAR_POSITIVE_CORE_PROMPT } from "../../../../src/lib/question-generation-research-profiles";
import { STRUCTURED_TYPE_PROMPTS } from "../../../../src/lib/question-schemas";

const corpus = JSON.parse(
  readFileSync(
    join(process.cwd(), "experiments/question-quality-20260715/runs/campaign-20260716/private/corpus-joined.private.json"),
    "utf8",
  ),
) as { rows: Array<{ frameId: string; focusType: string; passageText: string }> };

const grammarFrames = corpus.rows.filter((r) => r.focusType === "GRAMMAR_ERROR").slice(0, 5);
console.log("=== 어법 candidate block: full vs diet (KILLER) ===");
let fullSum = 0;
let dietSum = 0;
for (const f of grammarFrames) {
  const full = buildGrammarErrorCandidateBlock(f.passageText, 5, 1, "KILLER", { diversityEnabled: true, variantIndex: 0 });
  const dietB = buildGrammarErrorCandidateBlock(f.passageText, 5, 1, "KILLER", { diversityEnabled: true, variantIndex: 0 }, undefined, "diet");
  fullSum += full.length;
  dietSum += dietB.length;
  console.log(`${f.frameId}: full ${full.length}자 → diet ${dietB.length}자 (${(100 * dietB.length / full.length).toFixed(0)}%)`);
}
console.log(`평균: full ${(fullSum / grammarFrames.length).toFixed(0)}자 → diet ${(dietSum / grammarFrames.length).toFixed(0)}자`);

const typePrompt = (STRUCTURED_TYPE_PROMPTS as Record<string, string>).GRAMMAR_ERROR ?? "";
console.log(`\ntypePrompt: 현행 ${typePrompt.length}자 → G4 positive-core ${GRAMMAR_POSITIVE_CORE_PROMPT.length}자`);
console.log(`\nG4 총 절감(대략): typePrompt ${typePrompt.length - GRAMMAR_POSITIVE_CORE_PROMPT.length}자 + candidateBlock ${((fullSum - dietSum) / grammarFrames.length).toFixed(0)}자/지문 + rubric/checklist ~1200자`);
