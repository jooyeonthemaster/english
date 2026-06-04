import type { M1PassageDraftWithJob } from "../types";

export function isDraftAnalysisComplete(
  draft: M1PassageDraftWithJob,
): boolean {
  return draft.analysisStatus === "analyzed" || draft.savedPassageAnalysisId != null;
}

export function compareDraftAnalysisPriority(
  a: M1PassageDraftWithJob,
  b: M1PassageDraftWithJob,
): number {
  return Number(isDraftAnalysisComplete(a)) - Number(isDraftAnalysisComplete(b));
}
