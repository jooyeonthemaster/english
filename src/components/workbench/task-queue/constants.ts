import type { TaskDomain, TaskStatus } from "./types";

export const DOMAIN_LABELS: Record<TaskDomain, string> = {
  extraction: "자료 추출",
  "passage-analysis": "지문 분석",
  "question-generation": "문제 생성",
  "exam-generation": "시험지 생성",
  webtoon: "웹툰 생성",
};

export const DOMAIN_ORDER: TaskDomain[] = [
  "extraction",
  "passage-analysis",
  "question-generation",
  "exam-generation",
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
