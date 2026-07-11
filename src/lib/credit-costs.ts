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
  WEBTOON_IMAGE: 5,            // 일반(STANDARD) — Gemini nano-banana-2 로 9:16 웹툰 이미지
  WEBTOON_IMAGE_PREMIUM: 10,   // 프리미엄(PREMIUM) — GPT Image 2 로 9:16 웹툰 이미지
  WEBTOON_EXAM_DOWNLOAD: 3,     // 검수 완료 기출 웹툰 다운로드 — 직접 생성 대비 절반 수준

  // Exam report (학생 시험 리포트)
  EXAM_ANALYSIS: 1,            // 시험지 문항 분석 — 문항당 단가 (최소 15, costOverride 로 청구. 구조화(OCR/vision)는 무료)
  EXAM_STUDENT_REPORT: 5,      // 학생 1명 상담 리포트 생성 (수치는 서버 결정론, 내러티브만 AI)

  // 자체 시험지 배포·응시 (26-07-09 대개편) — 과금 원칙: 모델 × 실호출 수.
  // 할당·응시·결정론 채점·이력 시각화는 AI 0콜 → 전부 무과금(상수 자체가 없음).
  EXAM_ANALYSIS_BOOST: 1,      // 자체 시험지 AI 심층분석 보강 — 문항당 단가(텍스트 배치 분석, vision 프로브 없어 최소 문항수 floor 없음)
  EXAM_TREND_ANALYSIS: 5,      // 학생 1명 AI 추세변화 분석 — 프리미엄 내러티브 1콜(EXAM_STUDENT_REPORT 동급)
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
  PASSAGE_TRANSFORM: "AI 지문 변형",
  PASSAGE_VARIANT: "AI 지문 변형 (전체)",
  WEBTOON_IMAGE: "웹툰 이미지 생성 (일반)",
  WEBTOON_IMAGE_PREMIUM: "웹툰 이미지 생성 (프리미엄)",
  WEBTOON_EXAM_DOWNLOAD: "기출 웹툰 다운로드",
  EXAM_ANALYSIS: "시험지 문항 분석",
  EXAM_STUDENT_REPORT: "학생 시험 리포트",
  EXAM_ANALYSIS_BOOST: "AI 심층분석 보강",
  EXAM_TREND_ANALYSIS: "AI 추세변화 분석",
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
