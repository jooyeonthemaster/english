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
  "**You are the restorer — you read the raw problem text and the question evidence and reconstruct the passage.** " +
  "You have NO external tools — no google_search, no web access, no source lookup. Work strictly from the raw passage and the question evidence provided in the prompt. " +
  "Do not invent text that isn't directly supported by the raw passage or by the question evidence (answer keys, choice contents, marked positions). " +
  "Return strict JSON only — no markdown, no commentary.";

export const GROUNDED_RESTORATION_RULES: readonly string[] = [
  "## Restoration rules (apply during AI restoration)",
  "- **CRITICAL — RAW preservation rule:** Do NOT add tokens to the restored text that aren't already in the RAW passage. \"Tokens\" means punctuation (em dash `—`, colons, commas, parentheses), words, clauses, whitespace normalization. The ONLY allowed changes are: (a) filling blank placeholders `________` with the answer-key word/phrase, (b) removing problem-sheet markers (stem text, score tags `[N점]`, choice options `①`~`⑤`, chunk labels `(A)`~`(I)`, inline letter markers `(a)`~`(e)`, boxed word lists, `<보기>` blocks), (c) replacing a marked grammar/vocab word with its correct form per the answer key. Everything else MUST be kept verbatim. Do NOT \"fix\" `respect-as` into `respect — as`, do NOT join `yourself you` with an em dash, do NOT normalize spacing. OCR-noise punctuation is preserved as-is; teachers will fix it on review.",
  "- Preserve paragraph order, capitalization, original punctuation.",
  "- For questions whose sentences/paragraphs are labelled with parenthesised uppercase letters — ordering questions use `(A)`~`(D)`, vocab-choice / 동의어 / multi-choice 본문 problems can go up to `(A)`~`(I)` (rarely beyond) — **YOU MUST STRIP every such `(LETTER)` label from the output for letters A through Z**. The restored text must read as a single continuous passage with NO chunk labels remaining anywhere.",
  "- For referent / 'underlined (a)~(e)' questions (e.g. \"밑줄 친 (a)~(e) 중...\"): the `(a)`, `(b)`, `(c)`, `(d)`, `(e)` parentheses are problem-sheet markers slapped onto specific words. **YOU MUST REMOVE every `(a)`, `(b)`, `(c)`, `(d)`, `(e)` inline marker from the restored text**, keeping the underlying word intact.",
  "- For insertion questions, place the given/boxed sentence at the solved marker position from problem evidence; remove (①) ~ (⑤) position markers.",
  "- For irrelevant-sentence questions, remove ONLY the sentence identified as unrelated; keep numbering off.",
  "- For blank inference / word / sentence questions, fill the blank only when the question evidence supports it. \"Evidence\" means: an [ANSWER_MARK]ed choice, an answer in the explanation, a Word Box, OR a full choice list you can solve from. **If a blank has NONE of these (e.g. a 서답형 with no answer key and no choices), you MUST leave the `________` placeholder untouched, list it in `unresolvedMarkers`, and set `finalStatus=\"PARTIAL\"`. Inventing a fill word from your own judgment is forbidden — a plausible-looking guess silently corrupts the teacher's source text.**",
  "- For grammar / vocabulary questions, restore the original (correct) form. **Vocabulary edits target ONLY the marked word, not adjacent function words.** Example: in `not (d)like`, the marker `(d)` is glued to `like` only — if the question's answer is `unlike`, the restoration target is `like` → `unlike`, NOT `not like` → `unlike`. Keep `not` (and any other unmarked surrounding tokens) intact unless the original passage genuinely lacked them.",
  "- **WORD_ORDER / 어순 배열 questions — parse the stem's usage directive FIRST:**",
  "    - If the stem says `'모두 이용'` / `'모든 단어를 (반드시) 사용'` / `'all the words'` / `'use every word'` → the answer MUST use every word in the box. Count the box items. If the question evidence's answer key is shorter than the box (partial), do NOT pad with outside words and do NOT silently drop box items — emit the best-effort answer you can derive from the box AND set `finalStatus=\"PARTIAL\"` with a warning explaining the answer key was partial.",
  "    - If the stem says `'필요한 것만'` / `'적절히 선택'` / `'use only the necessary words'` → partial use of the box is fine. Use only what makes a grammatical sentence.",
  "    - No explicit directive → use only what the answer key specifies. If the result is clearly ungrammatical, set `finalStatus=\"PARTIAL\"`.",
  "    - Emit ONE `changes` entry per filled blank with `evidenceType=\"WORD_ORDER\"`, `before`=raw fragment containing the blank placeholder, `after`=raw fragment with the blank replaced by the assembled answer.",
  "- **Preserve word-gloss footnotes** (`*word 한글뜻` lines, usually at the bottom of the passage — e.g. `*scapegoat 희생양`, `*resilience 회복력`). These are teacher-supplied glossary entries, not problem-sheet markers. Keep them verbatim in `finalRestoredText`. They are NOT subject to marker removal.",
  "- Remove all problem-only markers (@, underlines, bracketed base forms, [ word, word ] word-banks, [N점] score tags).",
  "- If labels / chunk fragments / unresolved markers remain, `finalStatus` MUST be \"PARTIAL\" or \"FAILED\".",
];

export const GROUNDED_FINAL_TEXT_BUILDING: readonly string[] = [
  "## Building `finalRestoredText`",
  "- `finalRestoredText` = `aiRestoration.restoredText`. Emit it unchanged.",
  "- Emit a `changes` entry for EVERY sentence-level edit you applied during AI restoration — blank fills derived from question answers, grammar/vocab corrections inferred from problem evidence, sentence insertions, sentence ordering swaps. `before`=raw fragment (e.g. blank placeholder `________` or wrong-form word), `after`=restored fragment. Pick `evidenceType` per class (GRAMMAR/VOCAB/BLANK/WORD_ORDER/INSERTION/ORDERING/SUMMARY for substantive edits, OTHER as a last resort). Set `evidenceQuestionNumber` to the source question's number when the edit was driven by a specific problem. Do NOT emit changes for pure marker removal (①~⑤, (A)~(E) chunk labels, [N~M] shared-instruction tags) — those are housekeeping.",
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
  "    Use the question's source number verbatim — `[서답형3]` stays `Q[서답형3]` (NOT `Q4`). When no question drives the edit, write a short English reason instead (do NOT force one of the templates).",
];
