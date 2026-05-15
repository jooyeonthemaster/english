import type { BaseTask, TaskAdapter, TaskStatus } from "../types";

interface ExtractionJobRow {
  id: string;
  mode: string;
  status: string;
  originalFileName: string | null;
  displayName: string | null;
  totalPages: number;
  successPages: number;
  resultCount?: number;
  draftResultCount?: number;
  createdAt: string;
  m1DraftPipelineError?: boolean;
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

function buildTitle(job: ExtractionJobRow): string {
  if (job.displayName?.trim()) return job.displayName.trim();
  if (job.originalFileName) return job.originalFileName;
  return `${job.totalPages}페이지 이미지`;
}

function buildSubtitle(job: ExtractionJobRow): string {
  if (job.m1DraftPipelineError) return "결과 저장 실패 · 재추출 필요";
  const result = job.resultCount ?? job.draftResultCount ?? 0;
  return `${job.successPages}/${job.totalPages}페이지 · 결과 ${result}`;
}

export const extractionAdapter: TaskAdapter = {
  domain: "extraction",
  async fetchTasks(signal): Promise<BaseTask[]> {
    const res = await fetch("/api/extraction/jobs?limit=50", {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { jobs?: ExtractionJobRow[] };
    const jobs = (data.jobs ?? []).filter((job) => job.mode === "PASSAGE_ONLY");

    return jobs.map<BaseTask>((job) => ({
      id: job.id,
      domain: "extraction",
      title: buildTitle(job),
      subtitle: buildSubtitle(job),
      status: mapStatus(job.status),
      errorBadge: job.m1DraftPipelineError ? "저장 실패" : undefined,
      createdAt: job.createdAt,
      href: `/director/workbench/extraction/jobs?jobId=${job.id}`,
      onDelete: async () => {
        await fetch(`/api/extraction/jobs/${job.id}`, {
          method: "DELETE",
          credentials: "include",
        });
      },
    }));
  },
};
