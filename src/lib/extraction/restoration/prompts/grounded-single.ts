import { stringifyQuestions } from "../../_shared/prompt-formatters";
import type { BuildGroundedRestorationPromptInput } from "../types";
import { stringifyProblemEvidence } from "./_formatters";
import {
  GROUNDED_FINAL_TEXT_BUILDING,
  GROUNDED_RESTORATION_RULES,
  GROUNDED_SYSTEM_PROMPT,
} from "./_grounded-instructions";

const PIPELINE_SECTION: readonly string[] = [
  "## Pipeline (AI-only restoration)",
  "",
  "- You have no search tools and no source lookup. Work strictly from the raw passage + question evidence.",
  "- Apply the Restoration rules below: strip problem-only markers, place boxed/reordered sentences, drop the irrelevant sentence, fill blanks from evidence, fix grammar/vocab where the question identifies the answer position, etc.",
  "- Put the reconstructed passage in `aiRestoration.restoredText`. Echo the same text into `finalRestoredText`.",
  "- `aiRestoration.method` MUST be `\"QUESTION_EVIDENCE\"`. `finalMethod` MUST also be `\"QUESTION_EVIDENCE\"` (or `\"FAILED\"` if you cannot restore at all).",
  "- `aiRestoration.status` and `finalStatus` MUST be one of: `\"RESTORED\"` | `\"PARTIAL\"` | `\"FAILED\"`.",
  "- **`sourceMatch` MUST be null. `comparison` MUST be null.** You have no external source — never invent a source title, URL, publisher, or content. Never guess that this passage came from any specific book / article. If you think you recognize the source from prior training, ignore that — you have no way to verify it, and a hallucinated source corrupts the teacher's review.",
];

const JSON_SCHEMA_SECTION: readonly string[] = [
  "## Required JSON schema (return EXACTLY this shape)",
  "{",
  '  "sourceMatch": null,        // ALWAYS null — no external source lookup available',
  '  "aiRestoration": {',
  '    "status": "RESTORED" | "PARTIAL" | "FAILED",',
  '    "method": "QUESTION_EVIDENCE" | "FAILED",',
  '    "restoredText": string,',
  '    "confidence": 0.0-1.0,',
  '    "sentences": [{ "order": int, "text": string, "status": "OK"|"RESTORED"|"CHECK"|"UNRESOLVED" }],',
  '    "changes": [{ "sentenceOrder": int|null, "before": string, "after": string, "reason": string, "evidenceType": "VOCAB"|"GRAMMAR"|"WORD_ORDER"|"BLANK"|"INSERTION"|"ORDERING"|"SUMMARY"|"MANUAL_REQUIRED"|"OTHER", "confidence": 0.0-1.0 }],',
  '    "unresolvedMarkers": string[]',
  "  },",
  '  "comparison": null,         // ALWAYS null — no source to compare against',
  '  "finalRestoredText": string, // = aiRestoration.restoredText',
  '  "finalStatus": "RESTORED" | "PARTIAL" | "FAILED",',
  '  "finalMethod": "QUESTION_EVIDENCE" | "FAILED",',
  '  "warnings": string[]',
  "}",
];

/**
 * Single-call AI restoration prompt.
 *
 * The model is given the problem-mutated raw text, linked questions, and
 * optional first-pass problem evidence. It reconstructs the passage from raw
 * + evidence alone — no search tools, no source matching, no hallucinated
 * `sourceMatch`. Local DB matching (same-academy committed-draft 1:1 copy)
 * runs as a separate stage upstream in `restoreM1Passage`.
 */
export function buildGroundedRestorationPrompts(
  input: BuildGroundedRestorationPromptInput,
): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: GROUNDED_SYSTEM_PROMPT,
    userPrompt: [
      ...PIPELINE_SECTION,
      "",
      ...GROUNDED_RESTORATION_RULES,
      "",
      ...GROUNDED_FINAL_TEXT_BUILDING,
      "",
      ...JSON_SCHEMA_SECTION,
      "",
      "## Inputs",
      "",
      "Raw passage (problem-mutated):",
      input.problemText,
      "",
      "Linked questions:",
      stringifyQuestions(input.questions),
      "",
      "Problem evidence (from 1st-pass extraction):",
      stringifyProblemEvidence(input.problemEvidence),
    ].join("\n"),
  };
}
