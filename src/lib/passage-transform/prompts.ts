// ============================================================================
// AI 지문 변형 프롬프트 — gemini flash-lite 전용으로 강박적으로 프리스크립티브하게.
//
// Flash-Lite는 추론력이 약한 대신 지시 추종은 좋다. 따라서:
//  - 역할/금지/출력 형식을 모두 명시
//  - 정답 예시(few-shot)를 포함
//  - 사람이 읽는 설명(note)은 한국어 강제
// ============================================================================

/** 선택 구간 앞뒤 맥락을 잘라 모델에 보여줄 길이. */
const CONTEXT_WINDOW_CHARS = 600;

function clip(text: string, max: number, fromEnd = false): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return fromEnd ? "…" + t.slice(t.length - max) : t.slice(0, max) + "…";
}

/**
 * PARAPHRASE — 선택 문장(들)을 뜻은 그대로, 표현만 바꿔 재작성.
 * 수능/내신 영어 지문 변형이라는 도메인 제약을 명시한다.
 */
export function buildParaphrasePrompt({
  passageText,
  selectedText,
  avoidTexts,
}: {
  passageText: string;
  selectedText: string;
  avoidTexts?: string[];
}): string {
  // 선택 구간의 문장 수 — 모델이 다문장 span 을 한 문장으로 요약·붕괴시키는
  // 사고를 막기 위해 "같은 문장 수 유지"를 수치로 못박는다.
  const sentenceCount =
    (selectedText.match(/[.!?]["'”’)\]]*(?:\s|$)/g) || []).length || 1;
  const idx = passageText.indexOf(selectedText);
  const before =
    idx > 0 ? clip(passageText.slice(0, idx), CONTEXT_WINDOW_CHARS, true) : "";
  const after =
    idx >= 0
      ? clip(
          passageText.slice(idx + selectedText.length),
          CONTEXT_WINDOW_CHARS,
        )
      : "";

  const avoidBlock =
    avoidTexts && avoidTexts.length > 0
      ? [
          "",
          "## Previously generated versions (DO NOT repeat these wordings)",
          ...avoidTexts.map((t, i) => `${i + 1}. ${t}`),
          "Produce a NEW rewriting that is clearly different from ALL versions above.",
        ]
      : [];

  return [
    "You are an expert editor of Korean CSAT (수능) English reading passages.",
    "A teacher selected a span inside a passage. Rewrite ONLY that span so that the MEANING stays exactly the same but the WORDING changes.",
    "",
    "## Hard rules",
    `1. The selected span contains EXACTLY ${sentenceCount} sentence${sentenceCount > 1 ? "s" : ""}. Your rewrittenText MUST contain the SAME number of sentences (${sentenceCount}), rewriting EVERY sentence in place and in the same order. Count your sentences before answering.`,
    "2. This is a PARAPHRASE, NOT a summary. NEVER summarize, condense, merge, shorten the count, or drop any sentence — EVEN IF a sentence seems off-topic, unrelated, incoherent, or out of place relative to the others. Rewrite each sentence faithfully right where it is; if one sentence is irrelevant, keep it irrelevant (just reworded).",
    "3. Preserve the meaning of EACH sentence 100%. Do not add, drop, or weaken any information, nuance, or logical connector.",
    "4. Replace content words (verbs, nouns, adjectives, adverbs) with natural synonyms; you may also restructure (active↔passive, clause order) when it stays natural.",
    "5. Keep proper nouns, numbers, years, quoted terms, and technical terms EXACTLY as they are.",
    "6. Keep vocabulary at the same difficulty level (high-school / CSAT level). No rare or archaic words.",
    "7. Total length must stay within ±25% of the original span (so a long multi-sentence span stays a long multi-sentence span — do NOT shrink it).",
    "8. The rewritten span MUST flow seamlessly with the surrounding context shown below (grammar, tense, pronouns, connectors must still match).",
    "9. Output plain text only — no markdown, no quotes around the text, no explanations inside rewrittenText.",
    "",
    "## Output JSON",
    '{ "rewrittenText": string, "changes": [{ "before": string, "after": string }], "note": string }',
    "- rewrittenText: the rewritten span ONLY (NOT the whole passage).",
    "- changes: 3~6 entries. EVERY entry must have BOTH fields non-empty: `before` = a SHORT phrase (1~5 words) copied from the ORIGINAL span, `after` = the corresponding new phrase in your rewriting. Never output an entry with an empty `before` or empty `after`, and never put the whole sentence in one entry.",
    '  e.g. [{ "before": "improves", "after": "enhances" }, { "before": "ability to concentrate", "after": "capacity to focus" }]',
    "- note: 한국어 한 문장으로 어떻게 바꿨는지 요약 (반드시 한국어, 예: \"핵심 어휘를 동의어로 바꾸고 마지막 문장을 수동태로 전환했습니다.\").",
    "",
    "## Example (single sentence)",
    "Selected span: \"Reading books regularly improves your ability to concentrate.\"",
    'GOOD rewrittenText: "Regular reading enhances your capacity to focus."',
    'BAD (meaning changed): "Reading books sometimes helps you relax."',
    'BAD (too difficult): "Habitual perusal of tomes ameliorates one\'s faculty of attention."',
    "",
    "## Example (multi-sentence — rewrite EVERY sentence, keep the same count)",
    'Selected span (2 sentences): "Sleep helps the brain store memories. Without enough rest, students forget what they learned."',
    'GOOD rewrittenText (still 2 sentences): "Sleep enables the brain to retain memories. When students lack sufficient rest, they lose what they studied."',
    'BAD (collapsed/summarized into 1 sentence — FORBIDDEN): "Sleep is important for memory."',
    ...avoidBlock,
    "",
    "## Context BEFORE the selected span",
    before || "(passage starts here)",
    "",
    "## SELECTED SPAN (rewrite this)",
    selectedText,
    "",
    "## Context AFTER the selected span",
    after || "(passage ends here)",
  ].join("\n");
}

/**
 * PREPEND — 지문 전체 맥락 기반으로, 지문 첫 문장으로 자연스럽게 흘러들어가는
 * "앞 문단"을 새로 생성.
 */
export function buildPrependPrompt({
  passageText,
  avoidTexts,
  sentenceCount = 3,
}: {
  passageText: string;
  avoidTexts?: string[];
  /** 생성할 앞 문단의 문장 수 (1~5). 교사가 UI에서 직접 지정한다. */
  sentenceCount?: number;
}): string {
  const n = Math.min(5, Math.max(1, Math.round(sentenceCount)));
  const avoidBlock =
    avoidTexts && avoidTexts.length > 0
      ? [
          "",
          "## Previously generated paragraphs (DO NOT repeat these)",
          ...avoidTexts.map((t, i) => `${i + 1}. ${t}`),
          "Write a NEW opening paragraph with a clearly different angle or example from ALL versions above.",
        ]
      : [];

  return [
    "You are an expert writer of Korean CSAT (수능) English reading passages.",
    "Write ONE new opening paragraph that will be placed IMMEDIATELY BEFORE the passage below, so the combined text reads as a single, longer, natural passage.",
    "",
    "## Hard rules",
    `1. The paragraph MUST contain EXACTLY ${n} sentence${n > 1 ? "s" : ""}. Count your sentences before answering — not ${n - 1 || "zero"}, not ${n + 1}: EXACTLY ${n}. This is the teacher's explicit request and overrides everything else. English only.`,
    "2. Same topic, same register/tone, same tense and person as the passage.",
    "3. The LAST sentence of your paragraph must lead so naturally into the passage's FIRST sentence that a reader cannot tell where the seam is.",
    "4. Introduce or set up the passage's main idea — background, a hook, a general observation, or a concrete everyday example.",
    "5. Do NOT repeat, summarize, or contradict any sentence already in the passage.",
    "6. NEVER copy the passage's first sentence (or any passage sentence) into your paragraph. Your paragraph ENDS right before the passage begins — the passage's first sentence must NOT appear in your output.",
    "7. Do NOT refer to \"the passage\", \"the text\", \"below\", or the reader's task.",
    "8. Vocabulary at the same difficulty level as the passage (high-school / CSAT level).",
    "9. Output plain text only — no markdown, no title, no quotes.",
    "",
    "## Output JSON",
    '{ "paragraph": string, "note": string }',
    `- paragraph: the new opening paragraph only — EXACTLY ${n} sentence${n > 1 ? "s" : ""}.`,
    "- note: 한국어 한 문장으로 연결 방식 설명 (반드시 한국어, 예: \"일상 사례로 화제를 도입해 첫 문장의 일반 진술로 자연스럽게 이어집니다.\").",
    "",
    "## Example",
    "Passage starts with: \"This is why memory training has become popular among students.\"",
    'GOOD paragraph ending: "...Many students, however, find that facts slip away just hours after class." (→ \"This is why...\" connects naturally)',
    'BAD: "In the passage below, we will learn about memory." (refers to the passage — forbidden)',
    ...avoidBlock,
    "",
    "## The passage (your paragraph goes right before this)",
    passageText,
  ].join("\n");
}
