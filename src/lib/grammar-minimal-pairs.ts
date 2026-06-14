// ============================================================================
// 기출 1000제 최소대립쌍 — pointCode(a~m)별 검증된 오류 변형 방향.
// 자동 생성: scripts/build-grammar-minimal-pairs.ts (수기 편집 금지).
// 출처: minimal-pair-library.json(byFinePoint). count>=3, 깨끗한 1~2어만.
// GRAMMAR_ERROR/네모 어법 오류 생성의 기출 근거 + 시비성(비검증) 변형 차단용.
// ============================================================================

export interface GrammarMinimalPair {
  /** 원문의 올바른 표면형 */
  correct: string;
  /** 기출에서 이 자리를 오류로 만들 때 쓰는 틀린 표면형 */
  wrong: string;
  /** 기출 1000제 내 출현 횟수 */
  count: number;
}

/** pointCode(a~m) → 기출 검증 변형쌍(빈도순 상위). 시제 단독 등 etc는 미수록. */
export const GRAMMAR_MINIMAL_PAIRS: Record<string, GrammarMinimalPair[]> = {
  b: [{ correct: "that", wrong: "what", count: 80 }, { correct: "what", wrong: "that", count: 44 }, { correct: "where", wrong: "which", count: 33 }, { correct: "that", wrong: "which", count: 19 }, { correct: "which", wrong: "what", count: 16 }, { correct: "which", wrong: "that", count: 11 }, { correct: "which", wrong: "where", count: 11 }, { correct: "what", wrong: "which", count: 10 }],
  c: [{ correct: "called", wrong: "calling", count: 10 }, { correct: "asked", wrong: "asking", count: 8 }, { correct: "Given", wrong: "Giving", count: 5 }, { correct: "involved", wrong: "involving", count: 5 }, { correct: "left", wrong: "leaving", count: 5 }, { correct: "made", wrong: "making", count: 5 }, { correct: "leaving", wrong: "left", count: 4 }, { correct: "compared", wrong: "comparing", count: 4 }],
  d: [{ correct: "is", wrong: "are", count: 56 }, { correct: "are", wrong: "is", count: 26 }, { correct: "were", wrong: "was", count: 20 }, { correct: "has", wrong: "have", count: 12 }, { correct: "have", wrong: "has", count: 12 }, { correct: "was", wrong: "were", count: 11 }, { correct: "are", wrong: "do", count: 7 }, { correct: "do", wrong: "are", count: 6 }],
  e: [{ correct: "from voting", wrong: "to vote", count: 3 }],
  f: [{ correct: "well", wrong: "good", count: 6 }, { correct: "easy", wrong: "easily", count: 5 }, { correct: "calm", wrong: "calmly", count: 4 }, { correct: "alone", wrong: "lonely", count: 3 }, { correct: "hard", wrong: "hardly", count: 3 }, { correct: "narrow", wrong: "narrowly", count: 3 }, { correct: "properly", wrong: "proper", count: 3 }, { correct: "similar", wrong: "similarly", count: 3 }],
  g: [{ correct: "it", wrong: "them", count: 18 }, { correct: "them", wrong: "themselves", count: 10 }, { correct: "themselves", wrong: "them", count: 10 }, { correct: "one", wrong: "it", count: 5 }, { correct: "himself", wrong: "him", count: 4 }, { correct: "their", wrong: "its", count: 4 }, { correct: "them", wrong: "it", count: 3 }],
  k: [{ correct: "to be", wrong: "being", count: 4 }, { correct: "lying", wrong: "laying", count: 3 }, { correct: "gaining", wrong: "gain", count: 3 }, { correct: "building", wrong: "build", count: 3 }, { correct: "investigate", wrong: "investigating", count: 3 }, { correct: "laughing", wrong: "to laugh", count: 3 }, { correct: "seeing", wrong: "see", count: 3 }, { correct: "smiling", wrong: "to smile", count: 3 }],
  l: [{ correct: "because of", wrong: "because", count: 13 }, { correct: "during", wrong: "while", count: 9 }, { correct: "while", wrong: "during", count: 7 }, { correct: "Although", wrong: "Despite", count: 6 }, { correct: "because", wrong: "because of", count: 6 }, { correct: "why", wrong: "because", count: 4 }, { correct: "because", wrong: "why", count: 3 }, { correct: "though", wrong: "despite", count: 3 }],
  m: [{ correct: "much", wrong: "very", count: 8 }, { correct: "few", wrong: "little", count: 5 }, { correct: "much", wrong: "many", count: 4 }, { correct: "most", wrong: "almost", count: 3 }, { correct: "than", wrong: "as", count: 3 }, { correct: "little", wrong: "a little", count: 3 }],
};

/** 해당 pointCode 의 기출 변형 방향을 "a→b, c→d" 한 줄로 (프롬프트 주입용). */
export function describeGrammarMinimalPairs(pointCode: string, max = 5): string {
  const pairs = GRAMMAR_MINIMAL_PAIRS[pointCode];
  if (!pairs || pairs.length === 0) return "";
  return pairs.slice(0, max).map((p) => `${p.correct}→${p.wrong}`).join(", ");
}
