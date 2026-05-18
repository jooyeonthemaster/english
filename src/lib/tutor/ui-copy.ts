export const TUTOR_COPY = {
  productName: "튜터",
  productFullName: "학습 튜터",
  ask: "질문하기",
  questionLog: "질문 로그",
  mobileLearning: "모바일 학습",
  todayLearning: "오늘의 학습",
  helperUnavailable: "잠시 질문 기능을 사용할 수 없어요. 학습 활동은 계속할 수 있어요.",
  genericError: "잠시 후 다시 시도해주세요.",
} as const;

export const TUTOR_UI_FORBIDDEN_TERMS = [
  "Gemini",
  "제미나이",
  "Claude",
  "OpenAI",
  "openai",
  "Google",
  "google",
  "Generative AI",
  "generative ai",
  "AI 모델",
  "LLM",
  "llm",
  "model",
  "provider",
  "API",
  "api",
  "token",
  "tokens",
  "토큰",
  "credit",
  "credits",
  "크레딧",
  "cost",
  "Cost",
  "price",
  "pricing",
  "가격",
  "요금",
  "비용",
  "$",
] as const;

export function sanitizeTutorUserText(value: string): string {
  return TUTOR_UI_FORBIDDEN_TERMS.reduce((text, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(escaped, "gi"), TUTOR_COPY.productName);
  }, value);
}

export function formatTutorStatus(status?: string | null): string {
  const map: Record<string, string> = {
    DRAFT: "작성 중",
    PUBLISHED: "배포됨",
    ARCHIVED: "보관됨",
    SCHEDULED: "예약됨",
    OPEN: "진행 중",
    CLOSED: "마감",
    NOT_STARTED: "시작 전",
    LOCKED: "잠김",
    PRACTICING: "학습 중",
    SUBMITTED: "제출 완료",
    GRADED: "채점 완료",
    LATE: "지각",
    MISSED: "미참여",
  };
  return status ? (map[status] ?? status) : "시작 전";
}
