// ---------------------------------------------------------------------------
// 시험 생성 마법사 공용 상수
// ---------------------------------------------------------------------------

export const STEPS = [
  { label: "기본 정보", num: 1 },
  { label: "문제 추가", num: 2 },
  { label: "설정", num: 3 },
  { label: "미리보기", num: 4 },
];

export const TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "단답형",
  ESSAY: "서술형",
  FILL_BLANK: "빈칸",
  ORDERING: "순서",
  VOCAB: "단어",
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "고난도",
};
