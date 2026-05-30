"use client";

import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";

import { ReportPages } from "./report-pages";

interface Props {
  report: AnalysisReport;
}

/**
 * PRIME ANALYSIS 보고서 — 읽기 전용 A4 렌더러.
 * 보기/편집은 동일한 ReportPages 렌더러를 공유한다 (edit 미지정 = 읽기 전용,
 * 기존과 100% 동일한 DOM·스타일). 편집 모드는 AnalysisReportEditor 참고.
 */
export function AnalysisReportDocument({ report }: Props) {
  return <ReportPages report={report} />;
}
