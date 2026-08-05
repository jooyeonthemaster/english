export type TaskDomain =
  | "extraction"
  | "passage-authoring"
  | "passage-analysis"
  | "question-generation"
  | "exam-report"
  | "exam-generation"
  | "webtoon";

export type TaskScope = TaskDomain | "all";

export type TaskStatus =
  | "pending"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export interface BaseTask {
  id: string;
  domain: TaskDomain;
  title: string;
  subtitle: string;
  status: TaskStatus;
  errorBadge?: string;
  description?: string;
  stats?: Array<{
    label: string;
    value: string;
    tone?: "slate" | "blue" | "emerald" | "amber" | "red";
  }>;
  createdAt: string;
  href?: string;
  /** Optional thumbnail URL (e.g. first-page preview for an extraction job). */
  thumbnailUrl?: string | null;
  onDelete?: () => Promise<void>;
}

export interface TaskAdapter {
  domain: TaskDomain;
  fetchTasks(signal?: AbortSignal): Promise<BaseTask[]>;
}
