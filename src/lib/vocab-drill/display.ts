// 단어 훈련 — 표시 라벨 정본 (학생·디렉터 공용, 서버·클라 공용).
// 어법 display.ts 대응물. 지표·유형 명칭은 반드시 여기서 가져다 쓴다.

import type { VocabDrillMode, VocabItemType } from "./payload";

export const VOCAB_ITEM_TYPE_LABELS: Record<VocabItemType, string> = {
  MEANING_CHOICE: "뜻 고르기",
  WORD_CHOICE: "단어 고르기",
  CONTEXT_FILL: "문맥 채우기",
  SPELL: "철자 쓰기",
  EXAMPLE_MATCH: "예문 짝짓기",
  TRAP_JUDGE: "함정 판별",
  FLASH: "학습 카드",
};

export const VOCAB_MODE_LABELS: Record<VocabDrillMode, string> = {
  learn: "학습",
  drill: "드릴",
  context: "문맥 훈련",
  test: "덱 시험",
  review: "복습",
  weak: "취약 훈련",
  assignment: "선생님 과제",
};

export const VOCAB_TIER_LABELS: Record<string, string> = {
  basic: "기본",
  core: "핵심",
  academic: "학술",
  advanced: "고난도",
};

export const VOCAB_POS_LABELS: Record<string, string> = {
  noun: "명사",
  verb: "동사",
  adjective: "형용사",
  adverb: "부사",
  preposition: "전치사",
  conjunction: "접속사",
  idiom: "숙어",
  phrasal_verb: "구동사",
  collocation: "연어",
};

export const VOCAB_TRAP_KIND_LABELS: Record<string, string> = {
  polysemy: "다의어",
  collocation: "연어 결합",
  syntax: "구문",
  "form-confusion": "형태 혼동",
  "false-friend": "가짜 짝",
  negation: "부정 함정",
  register: "쓰임새",
};

export const VOCAB_STAGE_LABELS: Record<string, string> = {
  LEARN: "학습",
  DRILL: "드릴",
  CONTEXT: "문맥",
  TEST: "시험",
  MASTERED: "완성",
};

/** 숙달 4티어 — 어법 mastery-tiers.tsx:30-31 과 동일 임계(0/50/85). */
export type MasteryTier = "new" | "weak" | "learning" | "mastered";

export function masteryTier(attempts: number, score: number): MasteryTier {
  if (attempts === 0) return "new";
  if (score < 50) return "weak";
  if (score < 85) return "learning";
  return "mastered";
}

export const MASTERY_TIER_LABELS: Record<MasteryTier, string> = {
  new: "새 단어",
  weak: "흔들림",
  learning: "익히는 중",
  mastered: "완성",
};

/** 레벨 곡선 — 학습 OS stats.ts 와 동일(level = floor(sqrt(xp/60))+1). */
export function vocabLevel(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1;
}

export function vocabLevelProgress(xp: number): {
  level: number;
  intoLevel: number;
  toNext: number;
  pct: number;
} {
  const level = vocabLevel(xp);
  const floor = 60 * (level - 1) ** 2;
  const ceil = 60 * level ** 2;
  const intoLevel = xp - floor;
  const toNext = ceil - floor;
  return {
    level,
    intoLevel,
    toNext,
    pct: Math.min(100, Math.round((intoLevel / Math.max(1, toNext)) * 100)),
  };
}
