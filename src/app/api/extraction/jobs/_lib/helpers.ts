export const VISIBLE_M1_DRAFT_STATUSES = ["DRAFT", "REVIEWED", "COMMITTED"];

export function hasM1DraftPipelineError(errorSummary: string | null): boolean {
  if (!errorSummary) return false;
  return errorSummary.includes("m1DraftPipeline");
}
