import type { ExtractionJobStatus } from "@/lib/extraction/types";

export const TERMINAL = new Set<ExtractionJobStatus>([
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);
