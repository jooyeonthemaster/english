"use client";

import type { ExamDetail } from "@/components/exams/exam-detail-client-parts/types";
import { ExamDetailPaperPreview } from "@/components/exams/exam-detail-paper-preview";

/** 넘침 검증 클라이언트 — 실제 조판기를 모든 페이지 즉시 마운트로 띄우고 매니페스트를 노출한다. */
export function PaperOverflowClient({
  exam,
  manifest,
}: {
  exam: ExamDetail;
  manifest: { id: string; subType: string | null; setId: string | null }[];
}) {
  return (
    <div className="flex h-dvh flex-col bg-slate-100" data-paper-overflow data-paper-overflow-count={manifest.length}>
      <script
        type="application/json"
        id="paper-overflow-manifest"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(manifest) }}
      />
      <div className="min-h-0 flex-1">
        <ExamDetailPaperPreview exam={exam} className="h-full" forceMountAllPages />
      </div>
    </div>
  );
}
