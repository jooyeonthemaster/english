export type TaskDomain =
  | "extraction"
  | "passage-analysis"
  | "question-generation"
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
  createdAt: string;
  href?: string;
  onDelete?: () => Promise<void>;
}

export interface TaskAdapter {
  domain: TaskDomain;
  fetchTasks(signal?: AbortSignal): Promise<BaseTask[]>;
}
