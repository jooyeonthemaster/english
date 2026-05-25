export const POSITION_MARKER_PATTERN = /\(\s*(?:[\u2460-\u2469]|10|[1-9]|\?|[^\x00-\x7F]{1,3})\s*\)/g;
export const CHUNK_LABEL_PATTERN = /(?:^|\n)\s*\([A-E]\)\s+/g;
export const CIRCLED_SENTENCE_PATTERN = /[\u2460-\u2469]\s*[A-Z][^\u2460-\u2469\n]{20,}/g;
export const LONG_BLANK_PATTERN = /_{3,}|blank/i;
export const WORD_BANK_PATTERN = /\[[^\]\n]+,\s*[^\]\n]+]/;
export const GRAMMAR_VOCAB_PATTERN = /underlined|grammatically|context|vocabulary|grammar/i;
