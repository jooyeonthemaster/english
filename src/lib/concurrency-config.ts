function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;

  const integer = Math.floor(value);
  return integer > 0 ? integer : fallback;
}

function capConcurrency(perAcademy: number, queueBudget: number): number {
  return Math.max(1, Math.min(perAcademy, queueBudget));
}

export const WORKBENCH_QUESTION_GENERATION_QUEUE_NAME =
  process.env.TRIGGER_WORKBENCH_QUESTION_QUEUE_NAME || "wb-question-generation";
export const WORKBENCH_PASSAGE_ANALYSIS_QUEUE_NAME =
  process.env.TRIGGER_WORKBENCH_ANALYSIS_QUEUE_NAME || "wb-passage-analysis";
export const TUTOR_PROGRAM_GENERATION_QUEUE_NAME =
  process.env.TRIGGER_TUTOR_PROGRAM_QUEUE_NAME || "tutor-program-generation";
export const EXTRACTION_PAGE_QUEUE_NAME =
  process.env.TRIGGER_EXTRACTION_PAGE_QUEUE_NAME || "extraction-page";
export const EXTRACTION_ORCHESTRATOR_QUEUE_NAME =
  process.env.TRIGGER_EXTRACTION_ORCHESTRATOR_QUEUE_NAME ||
  "extraction-orchestrator";
export const EXTRACTION_FINALIZE_QUEUE_NAME =
  process.env.TRIGGER_EXTRACTION_FINALIZE_QUEUE_NAME || "extraction-finalize";
export const SIMILAR_EXAM_GENERATION_QUEUE_NAME =
  process.env.TRIGGER_SIMILAR_EXAM_QUEUE_NAME || "similar-exam-generation";

export const WORKBENCH_QUESTION_GENERATION_CONCURRENCY =
  readPositiveIntegerEnv("TRIGGER_WORKBENCH_QUESTION_CONCURRENCY", 4);
export const WORKBENCH_QUESTION_GENERATION_PER_ACADEMY_CONCURRENCY =
  readPositiveIntegerEnv("TRIGGER_WORKBENCH_QUESTION_PER_ACADEMY", 4);
export const WORKBENCH_QUESTION_GENERATION_QUEUE_CONCURRENCY = capConcurrency(
  WORKBENCH_QUESTION_GENERATION_PER_ACADEMY_CONCURRENCY,
  WORKBENCH_QUESTION_GENERATION_CONCURRENCY,
);

export const WORKBENCH_PASSAGE_ANALYSIS_CONCURRENCY = readPositiveIntegerEnv(
  "TRIGGER_WORKBENCH_ANALYSIS_CONCURRENCY",
  2,
);
export const WORKBENCH_PASSAGE_ANALYSIS_PER_ACADEMY_CONCURRENCY =
  readPositiveIntegerEnv("TRIGGER_WORKBENCH_ANALYSIS_PER_ACADEMY", 2);
export const WORKBENCH_PASSAGE_ANALYSIS_QUEUE_CONCURRENCY = capConcurrency(
  WORKBENCH_PASSAGE_ANALYSIS_PER_ACADEMY_CONCURRENCY,
  WORKBENCH_PASSAGE_ANALYSIS_CONCURRENCY,
);

export const TUTOR_PROGRAM_GENERATION_CONCURRENCY = readPositiveIntegerEnv(
  "TRIGGER_TUTOR_PROGRAM_CONCURRENCY",
  2,
);
export const TUTOR_PROGRAM_GENERATION_PER_ACADEMY_CONCURRENCY =
  readPositiveIntegerEnv("TRIGGER_TUTOR_PROGRAM_PER_ACADEMY", 1);
export const TUTOR_PROGRAM_GENERATION_QUEUE_CONCURRENCY = capConcurrency(
  TUTOR_PROGRAM_GENERATION_PER_ACADEMY_CONCURRENCY,
  TUTOR_PROGRAM_GENERATION_CONCURRENCY,
);

// 페이지 OCR 동시성. extraction-page는 `concurrencyKey: academy`로 트리거되므로
// 큐의 concurrencyLimit이 "학원별"로 적용된다 → 이 값이 곧 "한 학원의 한 잡이
// 동시에 돌릴 수 있는 페이지 수". 기존 2는 5장 업로드를 3웨이브로 직렬화하는
// 주 병목이었다(페이지당 Gemini ~11s × 3웨이브 ≈ 66s). Gemini 티어3 한도가
// 넉넉해 20으로 상향 — 통상 업로드(≤20p)는 1웨이브로 끝난다(≈18s).
// 전역 상한(_CONCURRENCY)은 학원별 값의 천장일 뿐(키 분리라 진짜 전역캡 아님);
// 진짜 cross-academy 상한은 trigger.dev 환경 동시성 한도가 잡는다.
export const EXTRACTION_PAGE_CONCURRENCY = readPositiveIntegerEnv(
  "TRIGGER_EXTRACTION_PAGE_CONCURRENCY",
  40,
);
export const EXTRACTION_PAGE_PER_ACADEMY_CONCURRENCY = readPositiveIntegerEnv(
  "TRIGGER_EXTRACTION_PAGE_PER_ACADEMY",
  20,
);
export const EXTRACTION_PAGE_QUEUE_CONCURRENCY = capConcurrency(
  EXTRACTION_PAGE_PER_ACADEMY_CONCURRENCY,
  EXTRACTION_PAGE_CONCURRENCY,
);

export const EXTRACTION_ORCHESTRATOR_CONCURRENCY = readPositiveIntegerEnv(
  "TRIGGER_EXTRACTION_ORCHESTRATOR_CONCURRENCY",
  1,
);
export const EXTRACTION_ORCHESTRATOR_PER_ACADEMY_CONCURRENCY =
  readPositiveIntegerEnv("TRIGGER_EXTRACTION_ORCHESTRATOR_PER_ACADEMY", 1);
export const EXTRACTION_ORCHESTRATOR_QUEUE_CONCURRENCY = capConcurrency(
  EXTRACTION_ORCHESTRATOR_PER_ACADEMY_CONCURRENCY,
  EXTRACTION_ORCHESTRATOR_CONCURRENCY,
);

export const EXTRACTION_FINALIZE_CONCURRENCY = readPositiveIntegerEnv(
  "TRIGGER_EXTRACTION_FINALIZE_CONCURRENCY",
  1,
);
export const EXTRACTION_FINALIZE_PER_ACADEMY_CONCURRENCY =
  readPositiveIntegerEnv("TRIGGER_EXTRACTION_FINALIZE_PER_ACADEMY", 1);
export const EXTRACTION_FINALIZE_QUEUE_CONCURRENCY = capConcurrency(
  EXTRACTION_FINALIZE_PER_ACADEMY_CONCURRENCY,
  EXTRACTION_FINALIZE_CONCURRENCY,
);
export const SIMILAR_EXAM_GENERATION_CONCURRENCY = readPositiveIntegerEnv(
  "TRIGGER_SIMILAR_EXAM_CONCURRENCY",
  1,
);
export const SIMILAR_EXAM_GENERATION_PER_ACADEMY_CONCURRENCY =
  readPositiveIntegerEnv("TRIGGER_SIMILAR_EXAM_PER_ACADEMY", 1);
export const SIMILAR_EXAM_GENERATION_QUEUE_CONCURRENCY = capConcurrency(
  SIMILAR_EXAM_GENERATION_PER_ACADEMY_CONCURRENCY,
  SIMILAR_EXAM_GENERATION_CONCURRENCY,
);

export const WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS =
  readPositiveIntegerEnv("TRIGGER_WORKBENCH_QUESTION_MAX_ATTEMPTS", 2);
export const WORKBENCH_PASSAGE_ANALYSIS_TRIGGER_MAX_ATTEMPTS =
  readPositiveIntegerEnv("TRIGGER_WORKBENCH_ANALYSIS_MAX_ATTEMPTS", 2);
export const TUTOR_PROGRAM_GENERATION_TRIGGER_MAX_ATTEMPTS =
  readPositiveIntegerEnv("TRIGGER_TUTOR_PROGRAM_MAX_ATTEMPTS", 2);
export const EXTRACTION_PAGE_MAX_ATTEMPTS = readPositiveIntegerEnv(
  "TRIGGER_EXTRACTION_PAGE_MAX_ATTEMPTS",
  3,
);
export const EXTRACTION_FINALIZE_MAX_ATTEMPTS = readPositiveIntegerEnv(
  "TRIGGER_EXTRACTION_FINALIZE_MAX_ATTEMPTS",
  2,
);
export const SIMILAR_EXAM_GENERATION_MAX_ATTEMPTS = readPositiveIntegerEnv(
  "TRIGGER_SIMILAR_EXAM_MAX_ATTEMPTS",
  1,
);
export const GEMINI_QUESTION_MAX_RETRIES = readPositiveIntegerEnv(
  "GEMINI_QUESTION_MAX_RETRIES",
  2,
);
export const GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS =
  readPositiveIntegerEnv("GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS", 2);
export const QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS =
  readPositiveIntegerEnv("QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS", 30_000);

export function academyConcurrencyKey(academyId: string): string {
  return `academy:${academyId}`;
}
