export const POSITION_MARKER_PATTERN = /\(\s*(?:[①-⑨1-5]|\?|[^\x00-\x7F]{1,3})\s*\)/g;
export const CHUNK_LABEL_PATTERN = /(?:^|\n)\s*\([A-E]\)\s+/g;
export const CIRCLED_SENTENCE_PATTERN = /[①-⑤]\s*[A-Z][^①-⑤\n]{20,}/g;
export const LONG_BLANK_PATTERN = /_{3,}|blank/i;
export const WORD_BANK_PATTERN = /\[[^\]\n]+,\s*[^\]\n]+]/;
export const GRAMMAR_VOCAB_PATTERN = /underlined|grammatically|context|vocabulary|grammar/i;
