import type { ExtractionJobStatus } from "@/lib/extraction/types";

export interface QueueJob {
  id: string;
  mode: string;
  status: ExtractionJobStatus;
  originalFileName: string | null;
  totalPages: number;
  successPages: number;
  failedPages: number;
  pendingPages: number;
  createdAt: string;
  completedAt: string | null;
  draftResultCount: number;
  resultCount: number;
  m1DraftPipelineError?: boolean;
}
