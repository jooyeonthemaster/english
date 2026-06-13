"use client";

import {
  useGenerateExtraction,
  type ExtractionPromotedResult,
  type PendingExtraction,
} from "@/app/(director)/director/workbench/generate/intake/use-generate-extraction";

export type { PendingExtraction, ExtractionPromotedResult };

interface UseCreateExtractionArgs {
  /**
   * Fired once per job after its extraction completes AND its M1 drafts are
   * promoted to Passages. The 학습지 생성 page used to keep drafts un-promoted,
   * but extraction is now UNIFIED: extracting from either tab auto-promotes,
   * so the material shows up as a real 지문 in BOTH the 학습지 자료 탭 and the
   * 문제 생성 내 지문 list. The handler refreshes the embedded 자료 관리 grid.
   */
  onPromoted: (result: ExtractionPromotedResult) => void;
}

/**
 * Create-page extraction hook. Now a thin alias of `useGenerateExtraction` —
 * identical client-token → jobId → poll → promote lifecycle. Kept as a named,
 * page-scoped wrapper so the 학습지 page (and its `PendingExtraction` type
 * consumers) import a stable symbol.
 */
export function useCreateExtraction({ onPromoted }: UseCreateExtractionArgs) {
  return useGenerateExtraction({ onPromoted });
}
