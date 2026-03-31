// ============================================================================
// 듀오링고 스타일 학습 서비스 — 상수 & 타입
// ============================================================================

// ---------------------------------------------------------------------------
// 1. 시즌 타입
// ---------------------------------------------------------------------------

export type SeasonType = "EXAM_PREP" | "REGULAR";

export const SEASON_TYPES = [
  { value: "EXAM_PREP" as const, label: "내신 집중" },
  { value: "REGULAR" as const, label: "평상시" },
] as const;

// ---------------------------------------------------------------------------
// 2. 세션 타입
// ---------------------------------------------------------------------------

export type SessionType =
  | "MIX_1"
  | "MIX_2"
  | "STORIES"
  | "VOCAB_FOCUS"
  | "GRAMMAR_FOCUS"
  | "WEAKNESS_FOCUS";

export const SESSION_TYPES = {
  MIX_1: { label: "종합 믹스 1", required: true, order: 1 },
  MIX_2: { label: "종합 믹스 2", required: true, order: 2 },
  STORIES: { label: "Stories", required: true, order: 3 },
  VOCAB_FOCUS: { label: "어휘 집중", required: false, order: 4 },
  GRAMMAR_FOCUS: { label: "문법 집중", required: false, order: 5 },
  WEAKNESS_FOCUS: { label: "약점 집중", required: false, order: 6 },
} as const;

// ---------------------------------------------------------------------------
// 3. 학습 카테고리 (Question.learningCategory)
// ---------------------------------------------------------------------------

export type LearningCategory = "VOCAB" | "INTERPRETATION" | "GRAMMAR" | "COMPREHENSION";

export const LEARNING_CATEGORIES = [
  { value: "VOCAB" as const, label: "어휘" },
  { value: "INTERPRETATION" as const, label: "해석" },
  { value: "GRAMMAR" as const, label: "문법" },
  { value: "COMPREHENSION" as const, label: "이해" },
] as const;

/** subType → learningCategory 매핑 (듀오링고 스타일 23종) */
export const SUBTYPE_TO_CATEGORY: Record<string, LearningCategory> = {
  // 어휘 (9종)
  WORD_MEANING: "VOCAB",
  WORD_MEANING_REVERSE: "VOCAB",
  WORD_FILL: "VOCAB",
  WORD_MATCH: "VOCAB",
  WORD_SPELL: "VOCAB",
  VOCAB_SYNONYM: "VOCAB",
  VOCAB_DEFINITION: "VOCAB",
  VOCAB_COLLOCATION: "VOCAB",
  VOCAB_CONFUSABLE: "VOCAB",

  // 해석 (5종)
  SENTENCE_INTERPRET: "INTERPRETATION",
  SENTENCE_COMPLETE: "INTERPRETATION",
  WORD_ARRANGE: "INTERPRETATION",
  KEY_EXPRESSION: "INTERPRETATION",
  SENT_CHUNK_ORDER: "INTERPRETATION",

  // 문법 (5종)
  GRAMMAR_SELECT: "GRAMMAR",
  ERROR_FIND: "GRAMMAR",
  ERROR_CORRECT: "GRAMMAR",
  GRAM_TRANSFORM: "GRAMMAR",
  GRAM_BINARY: "GRAMMAR",

  // 이해 (4종)
  TRUE_FALSE: "COMPREHENSION",
  CONTENT_QUESTION: "COMPREHENSION",
  PASSAGE_FILL: "COMPREHENSION",
  CONNECTOR_FILL: "COMPREHENSION",
};

/** subType → 인터랙션 패턴 매핑 */
export const SUBTYPE_TO_INTERACTION: Record<string, string> = {
  WORD_MEANING: "FOUR_CHOICE",
  WORD_MEANING_REVERSE: "FOUR_CHOICE",
  WORD_FILL: "THREE_CHOICE",
  WORD_MATCH: "MATCHING",
  WORD_SPELL: "TEXT_INPUT",
  VOCAB_SYNONYM: "THREE_CHOICE",
  VOCAB_DEFINITION: "FOUR_CHOICE",
  VOCAB_COLLOCATION: "THREE_CHOICE",
  VOCAB_CONFUSABLE: "THREE_CHOICE",
  SENTENCE_INTERPRET: "FOUR_CHOICE",
  SENTENCE_COMPLETE: "FOUR_CHOICE",
  WORD_ARRANGE: "WORD_BANK",
  KEY_EXPRESSION: "THREE_CHOICE",
  SENT_CHUNK_ORDER: "WORD_BANK",
  GRAMMAR_SELECT: "THREE_CHOICE",
  ERROR_FIND: "TAP_TEXT",
  ERROR_CORRECT: "TEXT_INPUT",
  GRAM_TRANSFORM: "TEXT_INPUT",
  GRAM_BINARY: "BINARY_CHOICE",
  TRUE_FALSE: "BINARY_CHOICE",
  CONTENT_QUESTION: "FOUR_CHOICE",
  PASSAGE_FILL: "THREE_CHOICE",
  CONNECTOR_FILL: "THREE_CHOICE",
};

/** UI 표시용 한국어 라벨 */
export const LEARNING_SUBTYPE_LABELS: Record<string, string> = {
  WORD_MEANING: "단어 뜻 (영→한)",
  WORD_MEANING_REVERSE: "단어 뜻 (한→영)",
  WORD_FILL: "빈칸 채우기",
  WORD_MATCH: "매칭",
  WORD_SPELL: "스펠링",
  VOCAB_SYNONYM: "유의어/반의어",
  VOCAB_DEFINITION: "영영풀이",
  VOCAB_COLLOCATION: "연어",
  VOCAB_CONFUSABLE: "혼동 단어",
  SENTENCE_INTERPRET: "해석 고르기",
  SENTENCE_COMPLETE: "영문 고르기",
  WORD_ARRANGE: "단어 배열",
  KEY_EXPRESSION: "핵심 표현",
  SENT_CHUNK_ORDER: "끊어읽기",
  GRAMMAR_SELECT: "문법 고르기",
  ERROR_FIND: "오류 찾기",
  ERROR_CORRECT: "오류 수정",
  GRAM_TRANSFORM: "문장 전환",
  GRAM_BINARY: "문법 O/X",
  TRUE_FALSE: "O/X",
  CONTENT_QUESTION: "내용 이해",
  PASSAGE_FILL: "지문 빈칸",
  CONNECTOR_FILL: "연결어",
};

// ---------------------------------------------------------------------------
// 4. 세션별 문제 구성 (15문제)
// ---------------------------------------------------------------------------

export const SESSION_COMPOSITION: Record<
  Exclude<SessionType, "STORIES">,
  Record<LearningCategory, number>
> = {
  MIX_1: { VOCAB: 5, INTERPRETATION: 5, GRAMMAR: 3, COMPREHENSION: 2 },
  MIX_2: { VOCAB: 5, INTERPRETATION: 5, GRAMMAR: 3, COMPREHENSION: 2 },
  VOCAB_FOCUS: { VOCAB: 10, INTERPRETATION: 3, GRAMMAR: 2, COMPREHENSION: 0 },
  GRAMMAR_FOCUS: { VOCAB: 3, INTERPRETATION: 2, GRAMMAR: 10, COMPREHENSION: 0 },
  WEAKNESS_FOCUS: { VOCAB: 4, INTERPRETATION: 4, GRAMMAR: 4, COMPREHENSION: 3 },
};

export const QUESTIONS_PER_SESSION = 15;
export const STORIES_QUESTIONS_COUNT = 5; // Stories 모드 중간 문제 수

// ---------------------------------------------------------------------------
// 5. XP 보상
// ---------------------------------------------------------------------------

export const LEARNING_XP = {
  SESSION_COMPLETE: 15,
  STORIES_COMPLETE: 20,
  PERFECT_SESSION: 10, // 보너스 (전문 정답)
  DAILY_EASY_MULTIPLIER: 1.2,
  DAILY_HARD_MULTIPLIER: 2.0,
  MULTIPLIER_DURATION_MS: 10 * 60 * 1000, // 10분
} as const;

// ---------------------------------------------------------------------------
// 6. 스트릭 & 프리즈
// ---------------------------------------------------------------------------

export const STREAK_CONFIG = {
  MAX_FREEZE_COUNT: 3,
  FREEZE_RECHARGE_DAYS: 7, // 연속 7일 출석 시 1개 충전
} as const;

// ---------------------------------------------------------------------------
// 7. 데일리 퀘스트 (듀오링고 스타일)
// ---------------------------------------------------------------------------

export type QuestMissionType =
  | "XP_EARN"
  | "SESSION_COUNT"
  | "PERFECT"
  | "STREAK_KEEP"
  | "ACCURACY"
  | "VOCAB_TEST"
  | "CATEGORY_FOCUS";

export type QuestDifficulty = "EASY" | "MEDIUM" | "HARD";

export interface QuestTemplate {
  missionType: QuestMissionType;
  difficulty: QuestDifficulty;
  label: string;
  target: number;
  rewardType: "MULTIPLIER" | "BONUS_XP";
  rewardValue: number;
}

/** 퀘스트 풀 — 매일 EASY 1개 + HARD 1개 = 총 2개 선택 (전부 배율 보상, 10분) */
export const QUEST_POOL: QuestTemplate[] = [
  // EASY (1개 선택) — x1.2 ~ x1.3
  { missionType: "SESSION_COUNT", difficulty: "EASY", label: "세션 1개 완료하기", target: 1, rewardType: "MULTIPLIER", rewardValue: 1.2 },
  { missionType: "XP_EARN", difficulty: "EASY", label: "XP 20 이상 획득하기", target: 20, rewardType: "MULTIPLIER", rewardValue: 1.2 },
  { missionType: "STREAK_KEEP", difficulty: "EASY", label: "오늘도 학습해서 스트릭 유지", target: 1, rewardType: "MULTIPLIER", rewardValue: 1.2 },
  { missionType: "VOCAB_TEST", difficulty: "EASY", label: "단어 시험 1회 완료하기", target: 1, rewardType: "MULTIPLIER", rewardValue: 1.3 },
  // HARD (1개 선택) — x1.5 ~ x2.0
  { missionType: "CATEGORY_FOCUS", difficulty: "HARD", label: "문법 세션 1개 완료하기", target: 1, rewardType: "MULTIPLIER", rewardValue: 1.5 },
  { missionType: "SESSION_COUNT", difficulty: "HARD", label: "세션 3개 완료하기", target: 3, rewardType: "MULTIPLIER", rewardValue: 1.8 },
  { missionType: "ACCURACY", difficulty: "HARD", label: "평균 정답률 90% 이상 달성", target: 90, rewardType: "MULTIPLIER", rewardValue: 2.0 },
  { missionType: "PERFECT", difficulty: "HARD", label: "만점 세션 1개 달성하기", target: 1, rewardType: "MULTIPLIER", rewardValue: 2.0 },
];

/** 레거시 호환용 — 기존 코드에서 참조하는 경우 */
export const DAILY_MISSION_TYPES = {
  EASY: {
    label: "세션 1개 완료하기",
    description: "아무 세션 1개를 완료하세요",
    condition: { sessionsRequired: 1 },
    rewardMultiplier: 1.2,
  },
  HARD: {
    label: "세션 3개 완료 + 정답률 80%",
    description: "세션 3개를 완료하고 평균 정답률 80% 이상을 달성하세요",
    condition: { sessionsRequired: 3, minAccuracy: 80 },
    rewardMultiplier: 2.0,
  },
} as const;

// ---------------------------------------------------------------------------
// 8. AI 문제 생성 목표량 (지문당)
// ---------------------------------------------------------------------------

export const QUESTION_GENERATION_TARGET: Record<LearningCategory, number> = {
  VOCAB: 80,
  INTERPRETATION: 70,
  GRAMMAR: 60,
  COMPREHENSION: 50,
};

// 지문당 총 목표: 260개 (자동채우기 모드에서 사용)

/** 커스텀 생성 시 전체 유형 합산 최대 개수 */
export const MAX_CUSTOM_TOTAL = 50;

// ---------------------------------------------------------------------------
// 9. 난이도 (학년 기반)
// ---------------------------------------------------------------------------

export const GRADE_LEVELS = [
  { value: 7, label: "중1" },
  { value: 8, label: "중2" },
  { value: 9, label: "중3" },
  { value: 10, label: "고1" },
  { value: 11, label: "고2" },
  { value: 12, label: "고3" },
] as const;
