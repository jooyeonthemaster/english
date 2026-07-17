/**
 * Zero-call census of the production prompt/schema layers for all 25 active English types.
 * It intentionally measures a lower bound: private per-type final checklists and live diversity
 * history are not injected here and are reported as exclusions rather than guessed.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { z } from "zod";

import { getAiResponseSchema } from "../../../src/lib/question-ai-schemas-mc";
import { STRUCTURED_TYPE_PROMPTS } from "../../../src/lib/question-schemas";
import {
  buildQuestionTargetCandidateBlock,
  getTypeQualityRubric,
} from "../../../src/lib/question-quality";
import {
  buildQuestionTypeSettingsPrompt,
  resolveQuestionTypeGenerationSettings,
} from "../../../src/lib/question-type-generation-settings";
import { buildGenerationPrompt, STRUCTURED_OUTPUT_INSTRUCTIONS } from "../../../src/app/api/ai/generate-questions-auto/_lib/prompts";

const ACTIVE_TYPES = [
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "GRAMMAR_CHOICE_COMBO",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE",
  "SUMMARY_WRITING",
  "WORD_ORDER",
  "TOPIC_SENTENCE_WRITING",
  "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
] as const;

const REPRESENTATIVE_PASSAGE = `People often assume that more information automatically improves judgment. Yet information helps only when a decision maker can distinguish evidence from noise. When every new signal receives equal attention, weak clues may crowd out the few facts that actually predict the outcome. Experts therefore do not merely collect more observations; they organize them according to a theory of what matters. This structure also makes revision possible. If a prediction fails, the expert can identify which assumption should change instead of abandoning the entire framework. Good judgment is thus not the passive accumulation of facts but the disciplined allocation of attention. The paradox is that a smaller, well-ordered body of evidence may support a better decision than a larger, unstructured one.`;

const DIRECTIVE_RE = /\b(must|never|always|exactly|avoid|reject|require|required|do not|should|cannot|can't)\b/gi;

const SOURCE_FILES = [
  "src/lib/question-schemas.ts",
  "src/lib/question-ai-schemas-mc.ts",
  "src/lib/question-quality/rubric.ts",
  "src/lib/question-quality/candidate-blocks/index.ts",
  "src/lib/question-type-generation-settings/dispatchers.ts",
  "src/lib/question-generation-prompt-contract.ts",
  "src/app/api/ai/generate-questions-auto/_lib/constants.ts",
  "src/app/api/ai/generate-questions-auto/_lib/prompts.ts",
] as const;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/[`*_#>-]/g, " ")
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line.split(" ").length >= 5);
}

function jaccard(a: string, b: string): number {
  const left = new Set(a.split(" "));
  const right = new Set(b.split(" "));
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function duplicateDirectives(layers: Record<string, string>) {
  const rows = Object.entries(layers).flatMap(([layer, text]) =>
    meaningfulLines(text).map((line) => ({ layer, line })),
  );
  const duplicates: Array<{leftLayer: string; rightLayer: string; similarity: number; left: string; right: string}> = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (rows[i].layer === rows[j].layer) continue;
      const similarity = jaccard(rows[i].line, rows[j].line);
      if (similarity >= 0.72) {
        duplicates.push({
          leftLayer: rows[i].layer,
          rightLayer: rows[j].layer,
          similarity: Number(similarity.toFixed(3)),
          left: rows[i].line,
          right: rows[j].line,
        });
      }
    }
  }
  return duplicates.sort((a, b) => b.similarity - a.similarity).slice(0, 20);
}

function schemaOptions(resolved: Record<string, unknown>) {
  return {
    irrelevantSlotCount: resolved.irrelevantSlotCount as number | undefined,
    grammarMarkerCount: resolved.grammarMarkerCount as number | undefined,
    grammarAnswerCount: resolved.grammarAnswerCount as number | undefined,
    grammarCorrectionErrorCount: resolved.grammarCorrectionErrorCount as number | undefined,
    summaryCompleteMcBlankCount: resolved.summaryCompleteMcBlankCount as number | undefined,
    summaryCompleteBlankCount: resolved.summaryCompleteBlankCount as number | undefined,
    summaryWritingBlankCount: resolved.summaryWritingBlankCount as number | undefined,
    topicSentenceWritingBlankCount: resolved.topicSentenceWritingBlankCount as number | undefined,
    contentMatchOptionCount: resolved.contentMatchOptionCount as number | undefined,
    contentMatchAnswerCount: resolved.contentMatchAnswerCount as number | undefined,
    vocabChoiceMarkerCount: resolved.vocabChoiceMarkerCount as number | undefined,
    vocabChoiceAnswerCount: resolved.vocabChoiceAnswerCount as number | undefined,
    sentenceInsertSlotCount: resolved.sentenceInsertSlotCount as number | undefined,
    antonymPairCount: resolved.antonymPairCount as number | undefined,
    blankInferenceBlankCount: resolved.blankInferenceBlankCount as number | undefined,
    genericOptionCount: resolved.genericOptionCount as number | undefined,
    genericAnswerCount: resolved.genericAnswerCount as number | undefined,
  };
}

function candidateOptions(resolved: Record<string, unknown>) {
  return {
    irrelevantSlotCount: resolved.irrelevantSlotCount as number | undefined,
    grammarMarkerCount: resolved.grammarMarkerCount as number | undefined,
    grammarScarcityBaseCount: resolved.grammarMarkerCount as number | undefined,
    grammarAnswerCount: resolved.grammarAnswerCount as number | undefined,
    grammarCorrectionErrorCount: resolved.grammarCorrectionErrorCount as number | undefined,
    antonymPairCount: resolved.antonymPairCount as number | undefined,
    blankInferenceBlankCount: resolved.blankInferenceBlankCount as number | undefined,
    blankInferenceParaphraseAnswer: resolved.blankInferenceParaphraseAnswer as boolean | undefined,
    blankInferenceDoubleNegative: resolved.blankInferenceDoubleNegative as boolean | undefined,
    requestedDifficulty: "KILLER",
    variantIndex: 0,
    diversityEnabled: false,
    pointFocus:
      (resolved.grammarPointFocus ??
        resolved.blankPointFocus ??
        resolved.sentenceInsertPointFocus ??
        resolved.irrelevantPointFocus ??
        resolved.sentenceOrderPointFocus) as boolean | undefined,
  };
}

function main() {
  const rows = [];
  for (const type of ACTIVE_TYPES) {
    const resolved = resolveQuestionTypeGenerationSettings(type, {}, "KILLER") as unknown as Record<string, unknown>;
    const settings = buildQuestionTypeSettingsPrompt(
      type,
      resolved.effectiveTypeSettings as Record<string, unknown>,
      "KILLER",
    );
    const typePrompt = STRUCTURED_TYPE_PROMPTS[type] ?? "";
    const qualityRubric = getTypeQualityRubric(type, "KILLER");
    const candidateBlock = buildQuestionTargetCandidateBlock(
      type,
      REPRESENTATIVE_PASSAGE,
      candidateOptions(resolved),
    );
    const schema = getAiResponseSchema(type, schemaOptions(resolved));
    const schemaText = JSON.stringify(z.toJSONSchema(schema));

    const layers = {
      typePrompt,
      qualityRubric,
      typeSettings: settings,
      targetCandidateBlock: candidateBlock,
      structuredOutput: STRUCTURED_OUTPUT_INSTRUCTIONS,
    };
    const duplicates = duplicateDirectives(layers);
    const planSurface: Record<string, {systemChars: number; promptChars: number; lowerBoundTotalChars: number}> = {};
    for (const plan of ["STANDARD", "PREMIUM"] as const) {
      const built = buildGenerationPrompt({
        schoolType: "high school",
        gradeInfo: "grade 2",
        passageContent: REPRESENTATIVE_PASSAGE,
        teacherIntentBlock: "",
        analysisContext: "",
        targetPoints: [],
        typePrompt,
        structuredInstructions: STRUCTURED_OUTPUT_INSTRUCTIONS,
        targetCandidateBlock: candidateBlock,
        typeQualityRubric: qualityRubric,
        typeCount: 1,
        diffLabel: "KILLER",
        diffInstruction: "top-tier exam item requiring precise passage evidence",
        generationPlan: plan,
        subType: type,
        finalChecklist: "",
        customPrompt: settings,
      });
      const systemChars = built.system?.length ?? 0;
      const promptChars = built.prompt.length;
      planSurface[plan] = {
        systemChars,
        promptChars,
        lowerBoundTotalChars: systemChars + promptChars + schemaText.length,
      };
    }

    let standardTypeScopedLowerBoundChars: number | null = null;
    if (type === "GRAMMAR_ERROR" || type === "BLANK_INFERENCE") {
      const scoped = buildGenerationPrompt({
        schoolType: "high school",
        gradeInfo: "grade 2",
        passageContent: REPRESENTATIVE_PASSAGE,
        teacherIntentBlock: "",
        analysisContext: "",
        targetPoints: [],
        typePrompt,
        structuredInstructions: STRUCTURED_OUTPUT_INSTRUCTIONS,
        targetCandidateBlock: candidateBlock,
        typeQualityRubric: qualityRubric,
        typeCount: 1,
        diffLabel: "KILLER",
        diffInstruction: "top-tier exam item requiring precise passage evidence",
        generationPlan: "STANDARD",
        subType: type,
        standardContractScope: "force_type_scoped",
        finalChecklist: "",
        customPrompt: settings,
      });
      standardTypeScopedLowerBoundChars =
        (scoped.system?.length ?? 0) + scoped.prompt.length + schemaText.length;
    }

    const combinedDirectives = Object.values(layers).join("\n").match(DIRECTIVE_RE)?.length ?? 0;
    rows.push({
      type,
      layerChars: Object.fromEntries(Object.entries(layers).map(([key, value]) => [key, value.length])),
      schemaChars: schemaText.length,
      directiveLexemeCount: combinedDirectives,
      crossLayerNearDuplicateCount: duplicates.length,
      crossLayerNearDuplicates: duplicates,
      planSurface,
      researchProfiles: {
        standardTypeScopedLowerBoundChars,
      },
    });
  }

  const result = {
    schemaVersion: 1,
    externalCalls: 0,
    passageChars: REPRESENTATIVE_PASSAGE.length,
    passageSha256: sha256(REPRESENTATIVE_PASSAGE),
    sourceFileSha256: Object.fromEntries(
      SOURCE_FILES.map((file) => [file, sha256(fs.readFileSync(path.resolve(file)))]),
    ),
    exclusions: [
      "Private finalChecklist strings assembled inside run-question-generation.ts",
      "Live diversity-history prompt blocks",
      "Teacher intent, analysis context, custom user prompt and target points",
      "Provider serialization overhead and tokenizer-specific token counts",
    ],
    interpretation: "Character totals are production-layer lower bounds, not token or quality estimates.",
    rows,
  };

  const outDir = path.resolve("experiments/question-quality-20260715/offline/out");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "prompt-constraint-census.json"), JSON.stringify(result, null, 2), "utf8");
  console.log(
    JSON.stringify(
      rows
        .map((row) => ({
          type: row.type,
          premiumLowerBoundChars: row.planSurface.PREMIUM.lowerBoundTotalChars,
          schemaChars: row.schemaChars,
          directives: row.directiveLexemeCount,
          crossLayerNearDuplicates: row.crossLayerNearDuplicateCount,
        }))
        .sort((a, b) => b.premiumLowerBoundChars - a.premiumLowerBoundChars),
      null,
      2,
    ),
  );
}

main();
