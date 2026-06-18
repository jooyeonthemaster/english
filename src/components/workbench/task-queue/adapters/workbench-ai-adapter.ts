import type { BaseTask, TaskAdapter, TaskDomain, TaskStatus } from "../types";

interface WorkbenchAiJobRow {
  id: string;
  domain: string;
  status: string;
  title: string;
  passageId: string | null;
  mode: string | null;
  questionType: string | null;
  requestedCount: number;
  successCount: number;
  failedCount: number;
  resultCount: number;
  errorMessage: string | null;
  createdAt: string;
  config?: Record<string, unknown> | null;
}

function isFastTrackJob(job: WorkbenchAiJobRow): boolean {
  const cfg = job.config;
  if (!cfg || typeof cfg !== "object") return false;
  return (cfg as { fastTrack?: unknown }).fastTrack === true;
}

function mapStatus(raw: string): TaskStatus {
  switch (raw) {
    case "PENDING":
      return "pending";
    case "PROCESSING":
      return "processing";
    case "COMPLETED":
      return "completed";
    case "PARTIAL":
      return "partial";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

function buildSubtitle(job: WorkbenchAiJobRow, domain: TaskDomain): string {
  const prefix = isFastTrackJob(job) ? "[빠른] " : "";
  if (domain === "passage-analysis") {
    if (job.status === "COMPLETED") return `${prefix}분석 완료`;
    if (job.status === "FAILED") return `${prefix}분석 실패`;
    if (job.status === "PENDING") return `${prefix}분석 대기 중`;
    return `${prefix}학습지 생성 진행 중`;
  }

  const typeLabel = job.questionType || "수동 생성";
  if (job.status === "COMPLETED") return `${prefix}${typeLabel} 완료`;
  if (job.status === "FAILED") return `${prefix}${typeLabel} 실패`;
  if (job.status === "PENDING") return `${prefix}${typeLabel} 대기 중`;
  return `${prefix}${typeLabel} 진행 중`;
}

function buildDescription(job: WorkbenchAiJobRow, domain: TaskDomain): string {
  if (job.errorMessage) return job.errorMessage;
  if (domain === "passage-analysis") {
    return job.status === "COMPLETED"
      ? "분석 결과가 저장되었습니다."
      : "Trigger.dev에서 학습지 생성을 처리하고 있습니다.";
  }
  return job.status === "COMPLETED"
    ? "생성된 문제는 문제관리에 저장되었습니다."
    : "Trigger.dev에서 문제 생성을 처리하고 있습니다.";
}

function createWorkbenchAiAdapter(
  domain: TaskDomain,
  apiDomain: "PASSAGE_ANALYSIS" | "QUESTION_GENERATION",
): TaskAdapter {
  return {
    domain,
    async fetchTasks(signal): Promise<BaseTask[]> {
      // This adapter renders only scalar counts/status — request the scalar-only
      // projection so the heavy passage.questions/result payload is never sent.
      const res = await fetch(
        `/api/workbench/ai-jobs?domain=${apiDomain}&limit=50&view=summary`,
        {
          credentials: "include",
          cache: "no-store",
          signal,
        },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { jobs?: WorkbenchAiJobRow[] };

      return (data.jobs ?? []).map((job) => {
        const status = mapStatus(job.status);
        const href =
          domain === "passage-analysis"
            ? "/director/workbench/passages/create"
            : "/director/workbench/questions/generate";
        return {
          id: job.id,
          domain,
          title: job.title,
          subtitle: buildSubtitle(job, domain),
          description: buildDescription(job, domain),
          stats: [
            {
              label: domain === "passage-analysis" ? "분석" : "요청 문제",
              value:
                domain === "passage-analysis"
                  ? `${job.successCount}/${job.requestedCount}`
                  : `${job.requestedCount}`,
              tone: status === "failed" ? "red" : "blue",
            },
            {
              label: domain === "passage-analysis" ? "결과" : "생성 문제",
              value: `${job.resultCount}건`,
              tone: job.resultCount > 0 ? "emerald" : "slate",
            },
          ],
          status,
          errorBadge: status === "failed" ? "오류" : undefined,
          createdAt: job.createdAt,
          href,
        };
      });
    },
  };
}

export const workbenchPassageAnalysisAdapter = createWorkbenchAiAdapter(
  "passage-analysis",
  "PASSAGE_ANALYSIS",
);
export const workbenchQuestionGenerationAdapter = createWorkbenchAiAdapter(
  "question-generation",
  "QUESTION_GENERATION",
);
