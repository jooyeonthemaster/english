import type { TaskDomain, TaskStatus } from "./types";

export const DOMAIN_LABELS: Record<TaskDomain, string> = {
  extraction: "자료 추출",
  "passage-authoring": "AI 지문 생성",
  "passage-analysis": "학습지 생성",
  "question-generation": "문제 생성",
  "exam-report": "내신 시험 분석",
  "exam-generation": "시험지 생성",
  webtoon: "웹툰 생성",
};

// Stage-specific count units so each workbench layer is visually distinct at a
// glance. Used by task-queue list headers and other count badges. Keep aligned
// with the unit terminology established for each management page:
//   자료 → 권 · 지문 → 편 · 문제 → 문항 · 리포트 → 건 · 시험지 → 부
export const DOMAIN_UNITS: Record<TaskDomain, string> = {
  extraction: "권",
  "passage-authoring": "편",
  "passage-analysis": "편",
  "question-generation": "문항",
  "exam-report": "건",
  "exam-generation": "부",
  webtoon: "편",
};

export const DOMAIN_ORDER: TaskDomain[] = [
  "question-generation",
  "exam-report",
  "exam-generation",
  // AI 지문 생성은 학습지 생성의 상류(지문이 생겨야 학습지가 있다) → 바로 앞에 둔다.
  "passage-authoring",
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
