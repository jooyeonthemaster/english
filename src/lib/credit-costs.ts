// ============================================================================
// Credit Cost Constants — Operation-type → credit cost mapping
// ============================================================================

export const CREDIT_COSTS = {
  // Question generation
  QUESTION_GEN_SINGLE: 2,     // Single MC question generation
  QUESTION_GEN_VOCAB: 1,      // Vocabulary question (simpler prompt)
  AUTO_GEN_BATCH: 2,          // 자동 출제 — 문제 1개당 단가 (문제 수만큼 청구)
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
  TEXT_EXTRACTION: 0,          // Pure OCR / Document AI extraction is free.
  PASSAGE_RESTORATION: 1,      // Opt-in AI 복원 (문제화된 지문 → 원문 재구성) — flash-lite 전환으로 인하 (26-06-10)
  PASSAGE_TRANSFORM: 1,        // AI 지문 변형 — 구간(문장 재작성·앞 맥락 추가) flash-lite 경량 호출
  PASSAGE_VARIANT: 2,          // AI 지문 변형 — 전체(관련/상반 주제·난이도·길이)로 새 지문 한 편 생성

  // Webtoon
  WEBTOON_IMAGE: 5,            // 한 지문 → 멀티패널 단일 9:16 웹툰 이미지
} as const;

export type OperationType = keyof typeof CREDIT_COSTS;

// Display names for UI
export const OPERATION_LABELS: Record<OperationType, string> = {
  QUESTION_GEN_SINGLE: "문제 생성",
  QUESTION_GEN_VOCAB: "어휘 문제",
  AUTO_GEN_BATCH: "자동 출제",
  LEARNING_QUESTION_GEN: "학습 문제 생성",
  PASSAGE_ANALYSIS: "학습지 생성",
  GRAMMAR_ENHANCEMENT: "문법 포인트 분석",
  SENTENCE_RETRANSLATION: "AI 재번역",
  QUESTION_EXPLANATION: "해설 생성",
  QUESTION_MODIFY: "문제 수정",
  AI_CHAT: "AI 튜터링",
  TEXT_EXTRACTION: "텍스트 추출 (OCR 무료)",
  PASSAGE_RESTORATION: "AI 지문 복원",
  PASSAGE_TRANSFORM: "AI 문장 변형",
  PASSAGE_VARIANT: "AI 지문 변형",
  WEBTOON_IMAGE: "웹툰 생성",
};

// Top-up pricing tiers (KRW per credit pack). expiryDays = credit validity from
// purchase; a higher tier both grants more credits and extends the balance-wide
// expiry by (remaining + expiryDays).
export const TOP_UP_PACKS = [
  { credits: 150, price: 19800, label: "스타터", perCredit: 132, expiryDays: 30 },
  { credits: 450, price: 49500, label: "스탠다드", perCredit: 110, expiryDays: 90 },
  { credits: 1500, price: 132000, label: "프리미엄", perCredit: 88, expiryDays: 180 },
  { credits: 4500, price: 330000, label: "엔터프라이즈", perCredit: 73, expiryDays: 365 },
] as const;
