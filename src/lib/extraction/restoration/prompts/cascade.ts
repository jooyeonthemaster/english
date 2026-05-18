import { stringifyQuestions } from "../../_shared/prompt-formatters";
import type { BuildRestorationPromptInput } from "../types";
import {
  stringifyProblemEvidence,
  stringifySourceMatches,
} from "./_formatters";

/**
 * Legacy cascade-style restoration prompt: a single Gemini call that consumes
 * pre-fetched source candidates + problem evidence and returns the restored
 * passage in one shot. Used when grounded mode is disabled.
 */
export function buildRestorationPrompts(input: BuildRestorationPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt:
      "You restore English study passages from Korean school problem sheets. " +
      "Use only evidence from source candidates and the linked questions. " +
      "Do not invent unsupported content. Return strict JSON only.",
    userPrompt: [
      "Restore the problem-mutated passage into the clean original study passage.",
      "",
      "Rules:",
      "- If a source candidate clearly matches, use that original text.",
      "- Otherwise use the first-pass problem evidence and linked questions to recover the original passage.",
      "- Preserve paragraph order.",
      "- For questions whose sentences/paragraphs are labelled with parenthesised uppercase letters — ordering questions use `(A)`~`(D)`, vocab-choice / 동의어 / multi-choice 본문 problems can go up to `(A)`~`(I)` (rarely beyond) — **YOU MUST STRIP every such `(LETTER)` label from the output for letters A through Z**. The restored text must read as a single continuous passage with NO chunk labels remaining anywhere.",
      "- For referent / 'underlined (a)~(e)' questions (e.g. \"밑줄 친 (a)~(e) 중...\"): the `(a)`, `(b)`, `(c)`, `(d)`, `(e)` parentheses are problem-sheet markers slapped onto specific words. **YOU MUST REMOVE every `(a)`, `(b)`, `(c)`, `(d)`, `(e)` inline marker from the restored text**, keeping the underlying word intact.",
      "- For insertion questions, place the given/boxed sentence at the solved marker position from problemEvidence.answer or INSERT_SENTENCE.target. If target is BEST_SUPPORTED_POSITION_MARKER, solve the marker from the local logic before restoring. Remove all position markers.",
      "- For irrelevant sentence questions, remove only the sentence identified as unrelated by evidence.",
      "- For school writing/word-order questions, use the model answer only when it is supported by the raw text or question evidence.",
      "- Remove problem-only markers such as @, underlines, bracketed base forms, and answer-choice word-order fragments.",
      "- If labeled chunks, word-order fragments, bracketed base forms, or other problem markers remain, status must be PARTIAL or FAILED, never RESTORED.",
      "- If evidence is insufficient, keep the best supported text and mark PARTIAL or FAILED.",
      "- Split the restored passage into numbered English sentences.",
      "- Return JSON matching: { status, method, restoredText, confidence, sentences, changes, unresolvedMarkers, warnings }.",
      "",
      "Problem-sheet passage:",
      input.problemText,
      "",
      "Linked questions:",
      stringifyQuestions(input.questions),
      "",
      "First-pass problem evidence:",
      stringifyProblemEvidence(input.problemEvidence),
      "",
      "Source candidates:",
      stringifySourceMatches(input.sourceMatches),
    ].join("\n"),
  };
}
