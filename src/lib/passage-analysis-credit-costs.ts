import { CREDIT_COSTS } from "@/lib/credit-costs";

export const PASSAGE_ANALYSIS_BASE_CREDIT_COST =
  CREDIT_COSTS.PASSAGE_ANALYSIS;
export const PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST =
  CREDIT_COSTS.PASSAGE_ANALYSIS;

export function getPassageAnalysisCreditCost(options?: {
  includeWorksheet?: boolean;
}): number {
  return (
    PASSAGE_ANALYSIS_BASE_CREDIT_COST +
    (options?.includeWorksheet
      ? PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST
      : 0)
  );
}

export function getPassageAnalysisWorksheetCreditCost(
  includeWorksheet: boolean,
): number {
  return includeWorksheet ? PASSAGE_ANALYSIS_WORKSHEET_EXTRA_CREDIT_COST : 0;
}
