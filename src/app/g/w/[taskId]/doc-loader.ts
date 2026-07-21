// ============================================================================
// /g/w — 학습지 문서 판별 공용 로더 (서버 전용)
//
// 허브(page.tsx)와 원본 뷰어(doc/page.tsx)가 공유하는 PassageReport →
// WorksheetViewerDoc 판별 정본. 기존 page.tsx 의 분기 로직을 그대로 옮겼다
// (무회귀 — PRIME 마커 → AnalysisReport, 그 외 Phase2 pages, 모양 폴백 구제).
// ============================================================================

import "server-only";
import { PRIME_REPORT_MARKERS } from "@/actions/workbench/passage-constants";
import { parseAnalysisReportForPreview } from "@/lib/passage-report/analysis-report/preview-parse";
import { reportDocumentSchema } from "@/lib/passage-report/schema";
import { prisma } from "@/lib/prisma";
import type { WorksheetViewerDoc } from "./w-viewer-client";

export interface LoadedWorksheetDoc {
  doc: WorksheetViewerDoc;
  reportId: string;
  generationPlan: string;
}

/** refId 로 PassageReport 를 로드해 뷰어 문서로 판별 — 실패 시 null */
export async function loadWorksheetViewerDoc(
  refId: string | null,
  academyId: string,
): Promise<LoadedWorksheetDoc | null> {
  if (!refId) return null;
  const report = await prisma.passageReport.findFirst({
    where: { id: refId, academyId, deletedAt: null },
    select: { id: true, title: true, theme: true, pages: true, generationPlan: true },
  });
  if (!report) return null;

  let doc: WorksheetViewerDoc | null = null;
  if (PRIME_REPORT_MARKERS.includes(report.generationPlan)) {
    const prime = parseAnalysisReportForPreview(report.pages);
    if (prime) doc = { type: "PRIME", report: prime };
  } else {
    const parsed = reportDocumentSchema.safeParse({
      id: report.id,
      title: report.title,
      theme: report.theme,
      pages: report.pages,
    });
    if (parsed.success) {
      doc = { type: "PAGES", document: parsed.data };
    } else {
      // 마커가 어긋난 구버전 대비 — 모양이 PRIME 이면 PRIME 으로 구제.
      const prime = parseAnalysisReportForPreview(report.pages);
      if (prime) doc = { type: "PRIME", report: prime };
    }
  }
  if (!doc) return null;
  return { doc, reportId: report.id, generationPlan: report.generationPlan };
}
