import type { TaskDomain, TaskStatus } from "./types";

export const DOMAIN_LABELS: Record<TaskDomain, string> = {
  extraction: "자료 추출",
  "passage-analysis": "학습지 생성",
  "question-generation": "문제 생성",
  "exam-generation": "시험지 생성",
  webtoon: "웹툰 생성",
};

// Stage-specific count units so each workbench layer is visually distinct at a
// glance. Used by task-queue list headers and other count badges. Keep aligned
// with the unit terminology established for each management page:
//   자료 → 권 · 지문 → 편 · 문제 → 문항 · 시험지 → 부
export const DOMAIN_UNITS: Record<TaskDomain, string> = {
  extraction: "권",
  "passage-analysis": "편",
  "question-generation": "문항",
  "exam-generation": "부",
  webtoon: "편",
};

export const DOMAIN_ORDER: TaskDomain[] = [
  "question-generation",
  "exam-generation",
  "passage-analysis",
  "extraction",
  "webtoon",
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "대기중",
  processing: "진행중",
  completed: "완료",
  partial: "부분완료",
  failed: "실패",
  cancelled: "취소",
};

export const ACTIVE_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "pending",
  "processing",
]);

export const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

export const POLL_INTERVAL_MS = 10_000;
