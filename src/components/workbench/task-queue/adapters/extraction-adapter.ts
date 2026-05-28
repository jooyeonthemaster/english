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
  savedResultCount?: number;
  createdAt: string;
  m1DraftPipelineError?: boolean;
  firstPageImageUrl?: string | null;
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

function buildDescription(job: ExtractionJobRow, status: TaskStatus): string {
  if (job.m1DraftPipelineError) {
    return "복원 결과 저장 중 오류가 발생했습니다. 작업을 열어 결과를 확인하거나 다시 처리하세요.";
  }
  if (status === "processing" || status === "pending") {
    return "페이지 OCR과 지문 복원을 처리하고 있습니다. 완료되면 자료 관리에서 검수하고 등록할 수 있습니다.";
  }
  if (status === "failed") {
    return "추출 작업이 실패했습니다. 작업을 열어 오류 내용을 확인하고 다시 시도하세요.";
  }
  if (status === "partial") {
    return "일부 페이지만 복원되었습니다. 누락된 페이지를 확인하고 필요한 결과만 검수하세요.";
  }
  return "추출과 복원이 완료되었습니다. 자료 관리에서 결과를 비교, 수정, 저장할 수 있습니다.";
}

/**
 * Best-effort cancel-then-delete for jobs that may still have workers in
 * flight. PROCESSING rows must be cancelled before DELETE (the server
 * refuses to drop an in-flight job to avoid FK violations on worker
 * writes). PENDING rows can technically delete directly, but we still
 * cancel first to clean up the page-row state in case a worker is about
 * to pick the job up. CANCELLED/TERMINAL rows go straight to delete.
 */
async function deleteExtractionJob(jobId: string, status: TaskStatus) {
  if (status === "processing" || status === "pending") {
    try {
      await fetch(`/api/extraction/jobs/${jobId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Cancel is best-effort; proceed to delete regardless.
    }
  }
  await fetch(`/api/extraction/jobs/${jobId}`, {
    method: "DELETE",
    credentials: "include",
  });
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

    return jobs.map<BaseTask>((job) => {
      const status = mapStatus(job.status);
      const result = job.resultCount ?? job.draftResultCount ?? 0;
      const reviewNeeded = job.draftResultCount ?? 0;
      const reviewCompleted = job.savedResultCount ?? 0;
      const reviewTotal = reviewCompleted + reviewNeeded;
      const reviewTone =
        reviewTotal > 0
          ? reviewCompleted === reviewTotal
              ? "emerald"
              : "red"
          : status === "failed"
            ? "red"
            : status === "processing" || status === "pending"
              ? "blue"
              : "slate";
      return {
        id: job.id,
        domain: "extraction",
        title: buildTitle(job),
        subtitle: buildSubtitle(job),
        description: buildDescription(job, status),
        stats: [
          {
            label: "처리 페이지",
            value: `${job.successPages}/${job.totalPages}`,
            tone: "slate",
          },
          {
            label: "복원 결과",
            value: `${result}개`,
            tone: "slate",
          },
          {
            label: "전체 페이지",
            value: `${job.totalPages}p`,
            tone: "slate",
          },
          {
            label: "검수 상태",
            value: `검수완료 ${reviewCompleted}/${reviewTotal}`,
            tone: reviewTone,
          },
        ],
        status,
        errorBadge: job.m1DraftPipelineError ? "저장 실패" : undefined,
        createdAt: job.createdAt,
        href: `/director/workbench/extraction/jobs?jobId=${job.id}`,
        thumbnailUrl: job.firstPageImageUrl ?? null,
        onDelete: () => deleteExtractionJob(job.id, status),
      };
    });
  },
};
