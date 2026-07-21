// ============================================================================
// 학습지 스터디 모드 — 프리셋(모드별 스테이지 구성·캡) 정본
// docs/worksheet-study-spec.md §4. 컴파일러(./compile.ts)만 소비한다.
// ============================================================================

import type { StudyMode, StudyStageId } from "./types";

export interface StudyPresetCaps {
  /** 어휘 시험 문항 수 상한 */
  vocabQuiz: number;
  /** 직독직해 대상 문장 수 상한 */
  chunkSentences: number;
  /** 키워드 빈칸 대상 문장 수 상한 */
  clozeSentences: number;
  /** 어법 문항 수 상한 (0 = 스테이지 제외) */
  grammarItems: number;
  /** 어순 배열 대상 문장 수 상한 (0 = 제외) */
  orderSentences: number;
  /** 해석 쓰기 문장 수 상한 (0 = 제외) */
  translationSentences: number;
  /** 백지 영작 문장 수 상한 (0 = 제외) */
  reproductionSentences: number;
  /** 빈칸 복원에 중첩 라운드(고밀도 2회차) 추가 여부 */
  clozeNestedRound: boolean;
  /** 어휘 빈칸(vocabularyCloze) 문항 상한 */
  vocabClozeItems: number;
  /** 실전 문제에 수능추론(inferenceSet) 포함 여부 */
  examInference: boolean;
  /** challenge tier 어휘를 타이핑 문항으로 승격 (intense) */
  vocabTypingChallenge: boolean;
}

export interface StudyPreset {
  stages: StudyStageId[];
  caps: StudyPresetCaps;
}

export const STUDY_PRESETS: Record<Exclude<StudyMode, "off">, StudyPreset> = {
  // 어휘 카드(vocab-flash)는 코스에서 제외 — 학생은 이미 수업을 들었다는 전제라
  // 암기 단계 없이 바로 시험으로 진단한다(모르는 단어는 오답 피드백·취약 단어장이 잡는다).
  light: {
    stages: ["reading", "vocab-quiz", "chunk", "cloze", "exam"],
    caps: {
      vocabQuiz: 16,
      chunkSentences: 6,
      clozeSentences: 8,
      grammarItems: 0,
      orderSentences: 0,
      translationSentences: 0,
      reproductionSentences: 0,
      clozeNestedRound: false,
      vocabClozeItems: 6,
      examInference: false,
      vocabTypingChallenge: false,
    },
  },
  standard: {
    stages: [
      "reading",
      "vocab-quiz",
      "vocab-match",
      "chunk",
      "grammar",
      "cloze",
      "order",
      "translation",
      "exam",
    ],
    caps: {
      vocabQuiz: 24,
      chunkSentences: 10,
      clozeSentences: 14,
      grammarItems: 12,
      orderSentences: 8,
      translationSentences: 5,
      reproductionSentences: 0,
      clozeNestedRound: false,
      vocabClozeItems: 8,
      examInference: true,
      vocabTypingChallenge: false,
    },
  },
  intense: {
    stages: [
      "reading",
      "vocab-quiz",
      "vocab-match",
      "chunk",
      "grammar",
      "cloze",
      "order",
      "translation",
      "reproduction",
      "exam",
    ],
    caps: {
      vocabQuiz: 40,
      chunkSentences: 16,
      clozeSentences: 20,
      grammarItems: 20,
      orderSentences: 12,
      translationSentences: 8,
      reproductionSentences: 6,
      clozeNestedRound: true,
      vocabClozeItems: 8,
      examInference: true,
      vocabTypingChallenge: true,
    },
  },
};

/** 아이템 수 하드 가드 — 스테이지당·플랜 전체 (spec §4.2) */
export const STAGE_ITEM_CAP = 48;
export const PLAN_ITEM_CAP = 300;

/** 유형별 예상 소요(초) — estMin 계산용 (spec §4.3) */
export const ITEM_EST_SEC: Record<string, number> = {
  read: 12,
  flash: 6,
  mc: 15,
  match: 30,
  order: 25,
  "sentence-order": 60,
  cloze: 30,
  ox: 12,
  "inline-choice": 12,
  "self-grade": 25,
  typing: 60,
};

/** 컴포저 미리보기 문구용 — 모드별 대표 구성 요약 */
export const STUDY_MODE_SUMMARY: Record<Exclude<StudyMode, "off">, string> = {
  light: "지문 통독 · 어휘 시험 · 직독직해 · 빈칸 복원 · 실전 문제 — 핵심만 가볍게",
  standard: "어휘 시험·직독직해·어법·빈칸·어순·해석 쓰기·실전 문제 — 표준 코스",
  intense: "표준 코스 + 백지 영작 · 고밀도 빈칸 — 통암기 최대 훈련",
};
