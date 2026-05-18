/**
 * Shared instruction blocks for grounded restoration prompts (single-task and
 * batch variants). Pulled out into one place so changes to restoration rules
 * stay in sync between single and batch builders.
 *
 * The large bullet-list sections below are returned as arrays so callers can
 * splice them into their own `.join("\n")` pipeline without re-wrapping.
 */

export const GROUNDED_SYSTEM_PROMPT =
  "You restore English study passages from Korean school problem sheets. " +
  "**Primary restorer = AI reading the raw problem text and the question evidence.** " +
  "google_search is a SECONDARY reference tool — use it to find the original source ONLY to verify specific problem-coupled spans (grammar/vocab answer positions, blanks) and to fix obvious OCR noise. " +
  "You must NOT replace teacher-edited passages with the source verbatim — the teacher's intentional edits (rewording, condensing, rewritten endings) are pedagogical and must be preserved. " +
  "Do not invent text that isn't supported by either the raw passage, the question evidence, or a confidently-matched source. " +
  "Return strict JSON only — no markdown, no commentary.";

export const GROUNDED_RESTORATION_RULES: readonly string[] = [
  "## Restoration rules (apply in Investigation B and to finalRestoredText)",
  "- Preserve paragraph order, capitalization, original punctuation.",
  "- For questions whose sentences/paragraphs are labelled with parenthesised uppercase letters — ordering questions use `(A)`~`(D)`, vocab-choice / 동의어 / multi-choice 본문 problems can go up to `(A)`~`(I)` (rarely beyond) — **YOU MUST STRIP every such `(LETTER)` label from the output for letters A through Z**. The restored text must read as a single continuous passage with NO chunk labels remaining anywhere.",
  "- For referent / 'underlined (a)~(e)' questions (e.g. \"밑줄 친 (a)~(e) 중...\"): the `(a)`, `(b)`, `(c)`, `(d)`, `(e)` parentheses are problem-sheet markers slapped onto specific words. **YOU MUST REMOVE every `(a)`, `(b)`, `(c)`, `(d)`, `(e)` inline marker from the restored text**, keeping the underlying word intact.",
  "- For insertion questions, place the given/boxed sentence at the solved marker position from problem evidence; remove (①) ~ (⑤) position markers.",
  "- For irrelevant-sentence questions, remove ONLY the sentence identified as unrelated; keep numbering off.",
  "- For blank inference / word / sentence questions, fill the blank only when the question evidence supports it.",
  "- For grammar / vocabulary questions, restore the original (correct) form. **Vocabulary edits target ONLY the marked word, not adjacent function words.** Example: in `not (d)like`, the marker `(d)` is glued to `like` only — if the question's answer is `unlike`, the restoration target is `like` → `unlike`, NOT `not like` → `unlike`. Keep `not` (and any other unmarked surrounding tokens) intact unless the original passage genuinely lacked them.",
  "- **Preserve word-gloss footnotes** (`*word 한글뜻` lines, usually at the bottom of the passage — e.g. `*scapegoat 희생양`, `*resilience 회복력`). These are teacher-supplied glossary entries, not problem-sheet markers. Keep them verbatim in `finalRestoredText`. They are NOT subject to marker removal.",
  "- Remove all problem-only markers (@, underlines, bracketed base forms, [ word, word ] word-banks, [N점] score tags).",
  "- If labels / chunk fragments / unresolved markers remain, `finalStatus` MUST be \"PARTIAL\" or \"FAILED\".",
];

export const GROUNDED_VARIANT_POLICY: readonly string[] = [
  "## Variant policy (drives Investigation C — DEFAULT = keep AI, patch only on strong signal)",
  "Compare `aiRestoration.restoredText` vs `sourceMatch.content`. For each diff, classify and act:",
  "- #1 PROBLEM-COUPLED → PATCH from source. Triggers: diff at `(a)~(e)` / `(a)~(i)` underline AND question is GRAMMAR_* / VOCAB_CHOICE / CONTEXT_MEANING / REFERENCE; or diff inside `(A)~(D)` ordering chunk or `(A)~(I)` vocab-choice chunk; or diff at a `________` / `(A)/(B)/(C)` blank.",
  "- #2 AUTHOR-EDIT → KEEP AI. Diff at a non-marker position, grammatically well-formed, span ≥3 words (condensed wording / rewritten ending / simplified clause).",
  "- #3 OCR NOISE → PATCH from source. Short (1-2 tokens), broken grammar / repeated tokens / garbled.",
  "- #4 AMBIGUOUS → KEEP AI, set `finalStatus=\"PARTIAL\"`.",
];

export const GROUNDED_FINAL_TEXT_BUILDING: readonly string[] = [
  "## Building `finalRestoredText`",
  "- Start from `aiRestoration.restoredText`. If no `sourceMatch`, emit it unchanged.",
  "- Otherwise: patch source spans for #1 and #3, leave AI spans for #2 and #4.",
  "- Emit a `changes` entry for EVERY sentence-level edit you applied — covering BOTH source patches (#1 #3) AND Investigation B evidence-driven edits (blank fills derived from question answers, grammar/vocab corrections inferred from problem evidence, sentence insertions, sentence ordering swaps). For source patches: `before`=AI span, `after`=source span. For evidence-driven edits: `before`=raw fragment (e.g. blank placeholder `________` or wrong-form word), `after`=restored fragment. Pick `evidenceType` per class (GRAMMAR/VOCAB/BLANK/INSERTION/ORDERING/SUMMARY for substantive edits, OTHER for OCR noise patches). Set `evidenceQuestionNumber` to the source question's number when the edit was driven by a specific problem. Do NOT emit changes for pure marker removal (①~⑤, (A)~(E) chunk labels, [N~M] shared-instruction tags) — those are housekeeping.",
  "- **Multi-blank passages (Word Box / 다중 빈칸 추론 / multi-blank 어휘) — STRICT EMIT RULE:** if the raw passage contains 2+ blank placeholders (`________` underscores OR `< 보기 >` slot grids), each blank MUST get its OWN `changes` entry. Never collapse. Never skip a blank just because it's filled with a single-word choice.",
  "    - `before` = `<word-or-token before blank> ________ <word-or-token after blank>` (the underscore + 1-2 surrounding tokens for disambiguation when the placeholder repeats)",
  "    - `after` = `<word-or-token before blank> <filled word/phrase> <word-or-token after blank>` (same surrounding tokens, blank replaced)",
  "    - Worked example. Raw: `... eliminate the idea that the next ________ mini-silence is your next ________ to express ...` (Q21, choice ② = 'available', choice ② = 'opening'). Emit:",
  "        changes[0] = { before: 'next ________ mini-silence', after: 'next available mini-silence', evidenceType: 'BLANK', reason: \"Q21: choice ② ('available')\" }",
  "        changes[1] = { before: 'next ________ to express', after: 'next opening to express', evidenceType: 'BLANK', reason: \"Q21: choice ② ('opening')\" }",
  "    - Word Box passages: count the box items (e.g. `<보기>` with 8 words → 8 fills → 8 BLANK changes). Producing 0 or 1 changes for an N-blank Word Box passage is a HARD FAILURE — set `finalStatus=\"PARTIAL\"` instead.",
  "- **`reason` format — write the reason in this canonical form so reviewers can scan it at a glance:**",
  "    - 객관식 정답 기반 (BLANK / SUMMARY / WORD_ORDER 정답이 객관식 ①~⑤): `Q{N}: choice {circled} ('{answer text}')` — e.g. `Q5: choice ② ('happiness')`",
  "    - 서답형 정답 기반 (서답형/단답형): `Q{N} answer: '{answer text}'` — e.g. `Q[서답형3] answer: 'creativity'`",
  "    - Word Box 빈칸 매칭: `Q{N}: matched from Word Box ('{word}')` — e.g. `Q4: matched from Word Box ('endure')`",
  "    - 어법/어휘 정답 적용: `Q{N}: changed '{before}' → '{after}' (answer choice {N})` — e.g. `Q7: changed 'has' → 'have' (answer choice ③)`",
  "    - Source patch (Investigation C #1/#3): use the variant tag, e.g. `OCR noise patch (sourceMatch)` or `Problem-coupled span (#1)`",
  "    Use the question's source number verbatim — `[서답형3]` stays `Q[서답형3]` (NOT `Q4`). When no question drives the edit, write a short English reason instead (do NOT force one of the templates).",
  "- For #2/#4 kept spans: add ONE aggregated warning like \"Preserved N suspected author edits — source differs but not patched\" (do not list each span). Place specifics in `comparison.differences` (concise — short fragments only).",
];
