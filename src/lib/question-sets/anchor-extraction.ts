// ============================================================================
// 장문 세트 — anchor extraction
// ============================================================================
// Maps each inline-mark question type's AI output fields to re-derivable Anchors.
// Mirrors the per-type post-processors (src/lib/question-postprocess/processors/*)
// EXACTLY — same source text, same display form, same find strategy — so that
// reconstructPassageView(base, extractAnchors(type, ai)) === processor.passageWith*.
// This is what lets a set store anchors instead of the baked (leaky) passage copy.
// ============================================================================

import type { Anchor } from "./types";

function norm(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// ── GRAMMAR_ERROR label canonicalization (mirrors processors/grammar-error.ts) ──
const GRAMMAR_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;
const GRAMMAR_LABELS = [
  "(A)", "(B)", "(C)", "(D)", "(E)", "(F)", "(G)", "(H)", "(I)", "(J)",
] as const;

function normalizeGrammarKey(value: unknown): string {
  const text = norm(value);
  if (!text) return "";
  const alpha = text.match(/^[([]?\s*([A-Ja-j])\s*[)\].:]?$/);
  if (alpha) return alpha[1].toUpperCase();
  const numeric = text.match(/^[([]?\s*(10|[1-9])\s*[)\].:]?$/);
  if (numeric) return GRAMMAR_KEYS[Number(numeric[1]) - 1] ?? "";
  return "";
}

function canonicalGrammarLabel(value: unknown, fallbackIndex?: number): string {
  const key = normalizeGrammarKey(value);
  if (key) return `(${key})`;
  if (
    typeof fallbackIndex === "number" &&
    fallbackIndex >= 0 &&
    fallbackIndex < GRAMMAR_LABELS.length
  ) {
    return GRAMMAR_LABELS[fallbackIndex];
  }
  return norm(value);
}

type AnyRecord = Record<string, unknown>;

/**
 * Extract the passage-mark anchors for a single inline-mark question. `ai` may be
 * the raw AI output OR the post-processed question data (both carry the same
 * source fields). Returns [] for passthrough / structural / source types.
 */
export function extractAnchors(typeId: string, ai: AnyRecord): Anchor[] {
  switch (typeId) {
    case "BLANK_INFERENCE": {
      const spanText = norm(ai.originalExpression);
      if (!spanText) return [];
      return [
        {
          kind: "BLANK",
          spanText,
          surroundingText: norm(ai.surroundingText) || undefined,
          findStrategy: "expression",
        },
      ];
    }

    case "FILL_BLANK_KEY": {
      const answer = norm(ai.answer) || norm(ai.correctAnswer);
      if (!answer) return [];
      const sentenceWithBlank = norm(ai.sentenceWithBlank);
      const ctx = sentenceWithBlank
        ? sentenceWithBlank.replace(/_{3,}/g, answer)
        : undefined;
      return [
        {
          kind: "BLANK",
          spanText: answer,
          surroundingText: ctx,
          findStrategy: "expression",
        },
      ];
    }

    case "GRAMMAR_ERROR": {
      const mes = Array.isArray(ai.markedExpressions)
        ? (ai.markedExpressions as AnyRecord[])
        : [];
      return mes.map((me, index) => {
        const expression = norm(me.expression);
        const errorExpression = norm(me.errorExpression);
        const correction =
          norm(me.correction) ||
          (me.isError && errorExpression && expression && errorExpression !== expression
            ? expression
            : "");
        const source = expression || correction || errorExpression;
        const display = me.isError ? errorExpression || expression : expression;
        return {
          kind: "MARKER",
          label: canonicalGrammarLabel(me.label, index),
          spanText: source,
          passageForm: display,
          surroundingText: norm(me.surroundingText) || undefined,
          findStrategy: "grammar",
          fallbackText:
            me.isError && correction && correction !== source ? correction : undefined,
        } satisfies Anchor;
      });
    }

    case "VOCAB_CHOICE": {
      const mws = Array.isArray(ai.markedWords)
        ? (ai.markedWords as AnyRecord[])
        : [];
      return mws.map((mw) => {
        const wordToFind = norm(mw.originalWord) || norm(mw.word);
        const display =
          mw.isInappropriate && norm(mw.substituteWord)
            ? norm(mw.substituteWord)
            : wordToFind;
        return {
          kind: "MARKER",
          label: norm(mw.label),
          spanText: wordToFind,
          passageForm: display,
          surroundingText: norm(mw.surroundingText) || undefined,
          findStrategy: "word",
        } satisfies Anchor;
      });
    }

    case "ANTONYM": {
      const mws = Array.isArray(ai.markedWords)
        ? (ai.markedWords as AnyRecord[])
        : [];
      return mws.map((mw) => {
        const word = norm(mw.word);
        return {
          kind: "MARKER",
          label: norm(mw.label),
          spanText: word,
          passageForm: word,
          surroundingText: norm(mw.surroundingText) || undefined,
          findStrategy: "word",
        } satisfies Anchor;
      });
    }

    case "REFERENCE": {
      const pronoun = norm(ai.underlinedPronoun);
      if (!pronoun) return [];
      return [
        {
          kind: "UNDERLINE",
          spanText: pronoun,
          passageForm: pronoun,
          surroundingText: norm(ai.surroundingText) || undefined,
          findStrategy: "wordStrict",
        },
      ];
    }

    case "CONTEXT_MEANING": {
      const word = norm(ai.underlinedWord);
      if (!word) return [];
      return [
        {
          kind: "UNDERLINE",
          spanText: word,
          passageForm: word,
          surroundingText: norm(ai.surroundingText) || undefined,
          findStrategy: "word",
        },
      ];
    }

    case "SYNONYM": {
      const target = norm(ai.targetWord);
      if (!target) return [];
      return [
        {
          kind: "UNDERLINE",
          spanText: target,
          // passageForm omitted → render the located passage slice (mirrors processor).
          surroundingText: norm(ai.contextSentence) || undefined,
          findStrategy: "wordOrExpression",
        },
      ];
    }

    case "IMPLIED_MEANING": {
      const expr = norm(ai.underlinedExpression);
      if (!expr) return [];
      return [
        {
          kind: "UNDERLINE",
          spanText: expr,
          // passageForm omitted → render the located passage slice (mirrors processor).
          surroundingText: norm(ai.surroundingText) || undefined,
          findStrategy: "expression",
        },
      ];
    }

    default:
      return [];
  }
}
