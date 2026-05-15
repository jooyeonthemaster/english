// ============================================================================
// m1-restoration-actions — build deterministic restoration actions from the
// classify-time question analysis.
//
// OCR classify (Gemini text) emits per-question `answer` ordinal (e.g. "④")
// plus low-density evidence, but does NOT populate `restorationActions`.
// The grounded restoration prompt knows how to use restorationActions —
// it just never receives any. This module fills that gap by reading the
// classify output + the linked CHOICE blocks, then emitting concrete
// FILL_BLANK / REMOVE_IRRELEVANT_SENTENCE / RESTORE_GRAMMAR / etc. actions.
//
// Pure code, no LLM call.
// ============================================================================

import type { ProblemEvidenceAction } from "@/lib/extraction/problem-evidence";

export interface ChoiceInput {
  label: string;
  content: string;
  isAnswer?: boolean | null;
}

export interface QuestionAnalysisInput {
  questionType: string;
  answer: string | null;
  answerConfidence: number | null;
  evidence: string[];
}

// ─── Ordinal helpers ───────────────────────────────────────────────────────

const ORDINAL_MAP: Record<string, number> = {
  "①": 1,
  "②": 2,
  "③": 3,
  "④": 4,
  "⑤": 5,
  "⑥": 6,
  "⑦": 7,
  "⑧": 8,
  "⑨": 9,
  "⑩": 10,
};

/** Parse the `answer` string (e.g. "④", "①, ⑤", "1, 5, 6, 8", "②", "(b)
 *  scarcity -> abundance, (d) like -> unlike") into a list of choice
 *  ordinals when the answer is choice-indexed. Returns an empty array
 *  when the answer is a free-form string (서답형 textbook detail etc.). */
function answerOrdinals(answer: string | null): number[] {
  if (!answer) return [];
  const ordinals = new Set<number>();
  for (const ch of answer) {
    const v = ORDINAL_MAP[ch];
    if (v !== undefined) ordinals.add(v);
  }
  // Fallback: parse "1, 5, 6, 8" / "1,5,6" style when no circled chars.
  if (ordinals.size === 0) {
    const numbers = answer.match(/(?<!\d)\d{1,2}(?!\d)/g);
    if (numbers) {
      for (const n of numbers) {
        const v = Number.parseInt(n, 10);
        if (v >= 1 && v <= 10) ordinals.add(v);
      }
    }
  }
  return [...ordinals].sort((a, b) => a - b);
}

function choiceTextByOrdinal(
  choices: ChoiceInput[],
  ordinal: number,
): string | null {
  if (ordinal < 1 || ordinal > choices.length) return null;
  return choices[ordinal - 1]?.content?.trim() ?? null;
}

// ─── Action constructors ───────────────────────────────────────────────────

function action(
  type: ProblemEvidenceAction["type"],
  fields: {
    target?: string | null;
    value?: string | null;
    reason: string;
    confidence: number;
  },
): ProblemEvidenceAction {
  return {
    type,
    target: fields.target ?? null,
    value: fields.value ?? null,
    reason: fields.reason,
    confidence: fields.confidence,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Build the per-question restoration actions implied by `analysis.answer`.
 * Returns an empty array for question types that don't require body
 * edits (TITLE / TOPIC_MAIN_IDEA / CONTEXT_MEANING / etc.) or when the
 * answer is missing.
 */
export function buildRestorationActions(
  analysis: QuestionAnalysisInput,
  choices: ChoiceInput[],
): ProblemEvidenceAction[] {
  const conf = analysis.answerConfidence ?? 0.5;
  const ordinals = answerOrdinals(analysis.answer);
  const actions: ProblemEvidenceAction[] = [];
  const type = analysis.questionType;

  switch (type) {
    case "BLANK_INFERENCE":
    case "BLANK_WORD":
    case "BLANK_SENTENCE":
    case "CONNECTOR": {
      for (const idx of ordinals) {
        const text = choiceTextByOrdinal(choices, idx);
        if (!text) continue;
        actions.push(
          action("RESTORE_BLANK", {
            target: "______",
            value: text,
            reason: `Fill the blank with choice ${idx} (${type}, confidence ${conf})`,
            confidence: conf,
          }),
        );
      }
      break;
    }

    case "IRRELEVANT": {
      for (const idx of ordinals) {
        const text = choiceTextByOrdinal(choices, idx);
        if (!text) continue;
        actions.push(
          action("REMOVE_IRRELEVANT_SENTENCE", {
            target: text,
            value: null,
            reason: `Remove sentence marked ${idx} — off-topic per classify`,
            confidence: conf,
          }),
        );
      }
      break;
    }

    case "SENTENCE_INSERT": {
      // Boxed sentence text lives inside the stem block, not the
      // CHOICE list. The grounded prompt already pulls it from
      // `stem`; we only emit the target POSITION so the model knows
      // which marker the boxed sentence belongs at.
      for (const idx of ordinals) {
        actions.push(
          action("INSERT_SENTENCE", {
            target: `marker ${idx}`,
            value: null,
            reason: `Insert the boxed sentence at marker ${idx}`,
            confidence: conf,
          }),
        );
      }
      break;
    }

    case "GRAMMAR_ERROR":
    case "GRAMMAR_CORRECTION": {
      for (const idx of ordinals) {
        const text = choiceTextByOrdinal(choices, idx);
        if (!text) continue;
        actions.push(
          action("RESTORE_GRAMMAR", {
            target: text,
            value: null, // 정답 (어법상 올바른 형태) 은 본문에 없음 — 강사가 채울 영역.
            reason: `Position ${idx} is grammatically incorrect; mark for teacher review`,
            confidence: conf,
          }),
        );
      }
      break;
    }

    case "VOCAB_CHOICE": {
      for (const idx of ordinals) {
        const text = choiceTextByOrdinal(choices, idx);
        if (!text) continue;
        actions.push(
          action("RESTORE_VOCAB", {
            target: text,
            value: null,
            reason: `Position ${idx} vocab is not context-appropriate`,
            confidence: conf,
          }),
        );
      }
      break;
    }

    case "SENTENCE_ORDER":
    case "PARAGRAPH_ORDER":
    case "DIALOGUE_ORDER": {
      // The chosen ordering lives inside choices[ordinal] as a string
      // like "(A)-(C)-(B)-(D)". We pass that string through so the
      // prompt can solve the final layout deterministically.
      for (const idx of ordinals) {
        const text = choiceTextByOrdinal(choices, idx);
        if (!text) continue;
        actions.push(
          action("REORDER_CHUNKS", {
            target: null,
            value: text,
            reason: `Apply ordering from choice ${idx}`,
            confidence: conf,
          }),
        );
      }
      break;
    }

    case "WORD_ORDER": {
      // 서답형 word-order — analysis.answer carries the numeric sequence
      // directly (e.g. "9-2-3-7"). No CHOICE lookup needed.
      if (analysis.answer && analysis.answer.trim().length > 0) {
        actions.push(
          action("RESTORE_WORD_ORDER", {
            target: null,
            value: analysis.answer.trim(),
            reason: "Word-order answer sequence (서답형)",
            confidence: conf,
          }),
        );
      }
      break;
    }

    case "SUMMARY_COMPLETE": {
      // The summary blanks are filled with either ordinal-indexed
      // choices (선택형) or a free-text payload (서답형 e.g.
      // "(A) process, (B) results"). Emit whichever applies.
      if (ordinals.length > 0) {
        const collected = ordinals
          .map((idx) => choiceTextByOrdinal(choices, idx))
          .filter((t): t is string => !!t)
          .join("\n");
        if (collected.length > 0) {
          actions.push(
            action("RESTORE_SUMMARY", {
              target: null,
              value: collected,
              reason: `Summary blanks filled from choices ${ordinals.join(", ")}`,
              confidence: conf,
            }),
          );
          break;
        }
      }
      if (analysis.answer && analysis.answer.trim().length > 0) {
        actions.push(
          action("RESTORE_SUMMARY", {
            target: null,
            value: analysis.answer.trim(),
            reason: "Summary blanks (서답형 answer)",
            confidence: conf,
          }),
        );
      }
      break;
    }

    case "SENTENCE_TRANSFORM":
    case "TEXTBOOK_DETAIL":
    case "CONDITIONAL_WRITING":
    case "DIALOGUE_RESPONSE":
    case "KOREAN_TRANSLATION":
    case "ENGLISH_DEFINITION": {
      // Open-response 서답형 types. Surface the answer as a
      // teacher-review hint — the body itself stays unchanged.
      if (analysis.answer && analysis.answer.trim().length > 0) {
        actions.push(
          action("TEACHER_REVIEW_REQUIRED", {
            target: null,
            value: analysis.answer.trim(),
            reason: `${type} answer (reference only — body unchanged)`,
            confidence: conf,
          }),
        );
      }
      break;
    }

    // CONTEXT_MEANING / REFERENCE / CONTENT_MATCH / TOPIC_MAIN_IDEA /
    // TITLE / PURPOSE / MOOD_TONE — body unchanged, no actions.
    default:
      break;
  }

  return actions;
}
