"use client";

import type { ExamDetail } from "@/components/exams/exam-detail-client-parts/types";
import { ExamDetailPaperPreview } from "@/components/exams/exam-detail-paper-preview";

export type GichulRenderManifestItem = {
  id: string;
  subType: string;
  typeGroup: string;
  direction: string;
  firstOption: string;
  footnotes: string[];
  points: number;
  passageHead: string;
  /** 장문 세트 멤버(§12.2) — 단일 문항은 null */
  setKey?: string | null;
  setLabel?: string | null;
  qNum?: number;
};

/** 이 배치가 그린 장문 세트(§12.2) — 세트 모드(`?sets=1`)에서만 비지 않는다. */
export type GichulRenderManifestSet = {
  key: string;
  label: string;
  qNums: number[];
  memberIds: string[];
  unsupportedQNums: number[];
  layoutType: string;
  blockLabels: string[];
  footnotes: string[];
  passageHead: string;
};

/**
 * 렌더 전수 검증 클라이언트 — 실제 조판기(ExamDetailPaperPreview)를 모든 페이지 즉시 마운트로 띄우고,
 * 하네스가 읽을 매니페스트를 data 속성/JSON 으로 노출한다.
 */
export function GichulRenderClient({
  exam,
  manifest,
  sets = [],
  total,
}: {
  exam: ExamDetail;
  manifest: GichulRenderManifestItem[];
  /** 세트 모드 매니페스트(§12.4 R) — 문항 모드에서는 빈 배열 */
  sets?: GichulRenderManifestSet[];
  total: number;
}) {
  return (
    <div
      className="flex h-dvh flex-col bg-slate-100"
      data-gichul-render
      data-gichul-total={total}
      data-gichul-count={manifest.length}
      data-gichul-set-count={sets.length}
    >
      <script type="application/json" id="gichul-render-manifest" dangerouslySetInnerHTML={{ __html: JSON.stringify(manifest) }} />
      <script type="application/json" id="gichul-render-set-manifest" dangerouslySetInnerHTML={{ __html: JSON.stringify(sets) }} />
      <div className="min-h-0 flex-1">
        <ExamDetailPaperPreview exam={exam} className="h-full" forceMountAllPages />
      </div>
    </div>
  );
}
