// ============================================================================
// Credit Cost Constants — Operation-type → credit cost mapping
// ============================================================================

export const CREDIT_COSTS = {
  // Question generation
  QUESTION_GEN_SINGLE: 2,     // Single MC question generation
  QUESTION_GEN_VOCAB: 1,      // Vocabulary question (simpler prompt)
  AUTO_GEN_BATCH: 15,         // AI plans + generates ~10 questions automatically
  LEARNING_QUESTION_GEN: 2,   // 내신/수능 학습 문제 생성

  // Passage operations
  PASSAGE_ANALYSIS: 5,        // Full 5-layer passage analysis
  GRAMMAR_ENHANCEMENT: 1,     // Enhanced grammar point analysis
  SENTENCE_RETRANSLATION: 1,  // Single sentence re-translation

  // Question utilities
  QUESTION_EXPLANATION: 1,    // Generate explanation for a question
  QUESTION_MODIFY: 1,         // AI-assisted question modification

  // Student features
  AI_CHAT: 1,                 // Student AI tutoring chat (per message)

  // Content extraction
  TEXT_EXTRACTION: 3,          // PDF/image OCR text extraction

  // Webtoon
  WEBTOON_IMAGE: 5,            // 한 지문 → 멀티패널 단일 9:16 웹툰 이미지
} as const;

export type OperationType = keyof typeof CREDIT_COSTS;

// Display names for UI
export const OPERATION_LABELS: Record<OperationType, string> = {
  QUESTION_GEN_SINGLE: "문제 생성 (단일)",
  QUESTION_GEN_VOCAB: "어휘 문제 생성",
  AUTO_GEN_BATCH: "자동 출제 (배치)",
  LEARNING_QUESTION_GEN: "학습 문제 생성",
  PASSAGE_ANALYSIS: "지문 분석",
  GRAMMAR_ENHANCEMENT: "문법 포인트 분석",
  SENTENCE_RETRANSLATION: "문장 재번역",
  QUESTION_EXPLANATION: "해설 생성",
  QUESTION_MODIFY: "문제 수정",
  AI_CHAT: "AI 튜터링",
  TEXT_EXTRACTION: "텍스트 추출 (OCR)",
  WEBTOON_IMAGE: "웹툰 이미지 생성",
};

// Top-up pricing tiers (KRW per credit pack)
export const TOP_UP_PACKS = [
  { credits: 100, price: 50000, label: "100 크레딧", perCredit: 500 },
  { credits: 300, price: 120000, label: "300 크레딧", perCredit: 400 },
  { credits: 500, price: 175000, label: "500 크레딧", perCredit: 350 },
  { credits: 1000, price: 300000, label: "1,000 크레딧", perCredit: 300 },
] as const;
