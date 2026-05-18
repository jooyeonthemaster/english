import { stringifyQuestions } from "../../_shared/prompt-formatters";
import type { BuildGroundedRestorationPromptInput } from "../types";
import {
  stringifyLocalSourceMatches,
  stringifyProblemEvidence,
} from "./_formatters";
import {
  GROUNDED_FINAL_TEXT_BUILDING,
  GROUNDED_RESTORATION_RULES,
  GROUNDED_SYSTEM_PROMPT,
  GROUNDED_VARIANT_POLICY,
} from "./_grounded-instructions";

const PIPELINE_SECTION: readonly string[] = [
  "## Pipeline (run all three in ONE response — B is the MAIN restorer)",
  "",
  "### Investigation A — Source lookup (REFERENCE ONLY, optional)",
  "- Use google_search to look up the original source (book / article / textbook).",
  "- If found, copy the original passage verbatim into `sourceMatch.content` (no paraphrase).",
  "- If not confidently found, set `sourceMatch` to null and stop searching.",
  "- **Sanity check**: if the candidate source's overall meaning / topic diverges substantially from the raw passage (i.e. you matched a different text), treat it as NOT found and set `sourceMatch` to null. Better no source than a wrong source.",
  "- This output is REFERENCE for Investigation C — it is NOT the answer.",
  "",
  "### Investigation B — AI restoration (PRIMARY)",
  "- This is the main restoration path. Use the raw passage and the question evidence to reconstruct the passage as the teacher intends students to read it.",
  "- Apply the Restoration rules below: strip problem-only markers, place boxed/reordered sentences, drop the irrelevant sentence, fill blanks from evidence, fix grammar/vocab where the question identifies the answer position, etc.",
  "- **Do NOT consult `sourceMatch` for this investigation.** Treat raw + evidence as your only inputs.",
  "- Put the result in `aiRestoration.restoredText`. This is the starting point for `finalRestoredText`.",
  "- `aiRestoration.method` MUST be exactly one of: \"SOURCE_MATCH\" | \"QUESTION_EVIDENCE\" | \"MIXED\" | \"FAILED\". Use \"QUESTION_EVIDENCE\" for this investigation.",
  "- `aiRestoration.status` MUST be exactly one of: \"RESTORED\" | \"PARTIAL\" | \"FAILED\".",
  "",
  "### Investigation C — Source-assisted patching (build finalRestoredText)",
  "- **Start from `aiRestoration.restoredText` verbatim.**",
  "- If `sourceMatch` is null OR `sourceMatch` differs from raw in too many places to be a confident match: emit `aiRestoration.restoredText` unchanged. Set `comparison` to null, `finalMethod = \"QUESTION_EVIDENCE\"`.",
  "- If `sourceMatch` is present and largely overlaps with raw, walk the diffs between `aiRestoration.restoredText` and `sourceMatch.content`. Apply the Variant classification policy below. Patch ONLY #1 (problem-coupled) and #3 (OCR noise) spans with source text. Leave every other diff as-is (= AI's reconstruction).",
  "- After patching, set `finalMethod`:",
  "    \"MIXED\"           when at least one source patch was applied",
  "    \"QUESTION_EVIDENCE\" when no source patch was needed / applied",
  "    \"SOURCE_MATCH\"    only if raw was already nearly identical to source and AI did almost nothing (rare)",
  "    \"FAILED\"          if the passage could not be restored at all",
  "- `comparison.agreement` = 0~1 sentence-level overlap between aiRestoration and sourceMatch (when both exist).",
  "- `comparison.differences` should list meaningful diffs you DID NOT patch (= suspected author edits or ambiguous), so the teacher can review.",
  "- `comparison.recommendation` MUST be one of: \"SOURCE_PRIMARY\" | \"AI_PRIMARY\" | \"BOTH_AGREE\" | \"TEACHER_REVIEW_REQUIRED\". Under this pipeline the default is \"AI_PRIMARY\" — only use \"SOURCE_PRIMARY\" when raw and source are nearly identical and AI added no edits.",
  "- `finalStatus` MUST be exactly one of: \"RESTORED\" | \"PARTIAL\" | \"FAILED\".",
];

const JSON_SCHEMA_SECTION: readonly string[] = [
  "## Required JSON schema (return EXACTLY this shape)",
  "{",
  '  "sourceMatch": {',
  '    "title": string, "url": string|null, "publisher": string|null, "year": int|null,',
  '    "content": string, "confidence": 0.0-1.0, "reason": string',
  "  } | null,",
  '  "aiRestoration": {',
  '    "status": "RESTORED" | "PARTIAL" | "FAILED",',
  '    "method": "SOURCE_MATCH" | "QUESTION_EVIDENCE" | "MIXED" | "FAILED",',
  '    "restoredText": string,',
  '    "confidence": 0.0-1.0,',
  '    "sentences": [{ "order": int, "text": string, "status": "OK"|"RESTORED"|"CHECK"|"UNRESOLVED" }],',
  '    "changes": [{ "sentenceOrder": int|null, "before": string, "after": string, "reason": string, "evidenceType": "VOCAB"|"GRAMMAR"|"WORD_ORDER"|"BLANK"|"INSERTION"|"ORDERING"|"SUMMARY"|"SOURCE_MATCH"|"MANUAL_REQUIRED"|"OTHER", "confidence": 0.0-1.0 }],',
  '    "unresolvedMarkers": string[]',
  "  },",
  '  "comparison": {',
  '    "agreement": 0.0-1.0, "differences": string[],',
  '    "recommendation": "SOURCE_PRIMARY" | "AI_PRIMARY" | "BOTH_AGREE" | "TEACHER_REVIEW_REQUIRED"',
  "  } | null,",
  '  "finalRestoredText": string,',
  '  "finalStatus": "RESTORED" | "PARTIAL" | "FAILED",',
  '  "finalMethod": "SOURCE_MATCH" | "QUESTION_EVIDENCE" | "MIXED" | "FAILED",',
  '  "warnings": string[]',
  "}",
];

/**
 * Single-call grounded restoration prompt.
 *
 * The model is given the problem-mutated raw text, linked questions, optional
 * first-pass problem evidence, and any local DB candidates that did not cross
 * the auto-accept threshold. It performs three investigations in one response:
 *   (A) google_search source lookup
 *   (B) AI restoration from evidence
 *   (C) compare & emit finalRestoredText
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
      ...GROUNDED_VARIANT_POLICY,
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
      "",
      "Local DB candidates (already searched, none crossed auto-accept threshold):",
      stringifyLocalSourceMatches(input.localSourceMatches ?? []),
    ].join("\n"),
  };
}
