import { stringifyQuestions } from "../../_shared/prompt-formatters";
import type { BuildGroundedRestorationBatchPromptInput } from "../types";
import { stringifyProblemEvidence } from "./_formatters";
import {
  GROUNDED_FINAL_TEXT_BUILDING,
  GROUNDED_RESTORATION_RULES,
  GROUNDED_SYSTEM_PROMPT,
} from "./_grounded-instructions";

const PIPELINE_SECTION: readonly string[] = [
  "## Pipeline (AI-only restoration — apply per task)",
  "",
  "- You have no search tools and no source lookup. Work strictly from each task's raw passage + question evidence.",
  "- Apply the Restoration rules below: strip problem-only markers, place boxed/reordered sentences, drop the irrelevant sentence, fill blanks from evidence, fix grammar/vocab where the question identifies the answer position, etc.",
  "- Put the reconstructed passage in `aiRestoration.restoredText`. Echo the same text into `finalRestoredText`.",
  "- `aiRestoration.method` MUST be `\"QUESTION_EVIDENCE\"`. `finalMethod` MUST also be `\"QUESTION_EVIDENCE\"` (or `\"FAILED\"` if you cannot restore at all).",
  "- `aiRestoration.status` and `finalStatus` MUST be one of: `\"RESTORED\"` | `\"PARTIAL\"` | `\"FAILED\"`.",
  "- **`sourceMatch` MUST be null. `comparison` MUST be null.** You have no external source — never invent a source title, URL, publisher, or content. Never guess that this passage came from any specific book / article. If you think you recognize the source from prior training, ignore that — you have no way to verify it, and a hallucinated source corrupts the teacher's review.",
];

const BATCH_JSON_SCHEMA_SECTION: readonly string[] = [
  "## Required JSON schema (return EXACTLY this shape)",
  "{",
  '  "results": [',
  "    {",
  '      "id": <echo the task id verbatim>,',
  '      "sourceMatch": null,        // ALWAYS null',
  '      "aiRestoration": {',
  '        "status": "RESTORED" | "PARTIAL" | "FAILED",',
  '        "method": "QUESTION_EVIDENCE" | "FAILED",',
  '        "restoredText": string,',
  '        "confidence": 0.0-1.0,',
  '        "sentences": [{ "order": int, "text": string, "status": "OK"|"RESTORED"|"CHECK"|"UNRESOLVED" }],',
  '        "changes": [{ "sentenceOrder": int|null, "before": string, "after": string, "reason": string, "evidenceType": "VOCAB"|"GRAMMAR"|"WORD_ORDER"|"BLANK"|"INSERTION"|"ORDERING"|"SUMMARY"|"MANUAL_REQUIRED"|"OTHER", "confidence": 0.0-1.0 }],',
  '        "unresolvedMarkers": string[]',
  "      },",
  '      "comparison": null,         // ALWAYS null',
  '      "finalRestoredText": string, // = aiRestoration.restoredText',
  '      "finalStatus": "RESTORED" | "PARTIAL" | "FAILED",',
  '      "finalMethod": "QUESTION_EVIDENCE" | "FAILED",',
  '      "warnings": string[]',
  "    }",
  "  ]",
  "}",
];

/**
 * Build a prompt for processing multiple restoration tasks in a single AI
 * call. Amortises per-call overhead across N drafts.
 *
 * The model must echo each task's `id` in its `results[*].id` so the caller
 * can map results back to inputs deterministically. No source lookup, no
 * search tools — pure AI restoration from raw + question evidence.
 */
export function buildGroundedRestorationBatchPrompts(
  input: BuildGroundedRestorationBatchPromptInput,
): { systemPrompt: string; userPrompt: string } {
  const taskBlocks = input.tasks.map((task, idx) =>
    [
      `### TASK ${idx + 1}  (id="${task.id}")`,
      "",
      "Raw passage (problem-mutated):",
      task.problemText,
      "",
      "Linked questions:",
      stringifyQuestions(task.questions),
      "",
      "Problem evidence (from 1st-pass extraction):",
      stringifyProblemEvidence(task.problemEvidence ?? null),
    ].join("\n"),
  );

  return {
    systemPrompt: GROUNDED_SYSTEM_PROMPT,
    userPrompt: [
      "## Batch restoration",
      "",
      `You will receive ${input.tasks.length} restoration tasks below. Process each task INDEPENDENTLY and return an array of results, one per task, IN INPUT ORDER, with each result echoing the input's \`id\`.`,
      "",
      ...PIPELINE_SECTION,
      "",
      ...GROUNDED_RESTORATION_RULES,
      "",
      ...GROUNDED_FINAL_TEXT_BUILDING,
      "",
      ...BATCH_JSON_SCHEMA_SECTION,
      "",
      `Total number of tasks: ${input.tasks.length}. The results array MUST contain exactly ${input.tasks.length} items, in input order, each with the correct id.`,
      "",
      "## Tasks",
      "",
      taskBlocks.join("\n\n---\n\n"),
    ].join("\n"),
  };
}
