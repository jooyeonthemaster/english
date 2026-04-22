"use client";

// ============================================================================
// useLoadJob — fetch `/api/extraction/jobs/:id`, populate store and local
// state. Extracted from review-step.tsx during mechanical split.
// ============================================================================

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { EnrichedDraft } from "@/lib/extraction/segmentation";
import type {
  ExtractionItemSnapshot,
  ResultDraft,
  SourceMaterialSnapshot,
} from "@/lib/extraction/types";
import { itemsToDraftSummaries } from "./commit/items-to-drafts";
import { buildSourceDraft, firstPageOf } from "./source-draft";
import type { LoadedPage, SourceMaterialDraft } from "./types";

interface LoadJobHandlers {
  jobId: string | null;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setPagesData: Dispatch<SetStateAction<LoadedPage[]>>;
  setOriginalFileName: Dispatch<SetStateAction<string | null>>;
  setItems: (items: ExtractionItemSnapshot[]) => void;
  setEnrichedDrafts: (drafts: EnrichedDraft[]) => void;
  setSelectedItemId: (id: string | null) => void;
  setFocusedPageIndex: (page: number) => void;
  setDrafts: (drafts: ResultDraft[]) => void;
  setLegacyDraftId: Dispatch<SetStateAction<string | null>>;
  setSourceMaterial: (mat: SourceMaterialSnapshot | null) => void;
  setSourceDraft: Dispatch<SetStateAction<SourceMaterialDraft>>;
}

export function useLoadJob(handlers: LoadJobHandlers) {
  const {
    jobId,
    setLoading,
    setPagesData,
    setOriginalFileName,
    setItems,
    setEnrichedDrafts,
    setSelectedItemId,
    setFocusedPageIndex,
    setDrafts,
    setLegacyDraftId,
    setSourceMaterial,
    setSourceDraft,
  } = handlers;

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/extraction/jobs/${jobId}`);
        if (!res.ok) {
          toast.error("작업 불러오기에 실패했습니다.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        const loadedPages: LoadedPage[] = (data.pages ?? []).map(
          (p: LoadedPage) => ({
            pageIndex: p.pageIndex,
            imageUrl: p.imageUrl ?? null,
            extractedText: p.extractedText ?? null,
            status: p.status,
          }),
        );
        setPagesData(loadedPages);
        setOriginalFileName(data.job?.originalFileName ?? null);

        const rawItems = (data.items ?? []) as ExtractionItemSnapshot[];
        const rawResults = (data.results ?? []) as Array<{
          id: string;
          passageOrder: number;
          sourcePageIndex: number[];
          title: string | null;
          content: string;
          confidence: number | null;
          status: "DRAFT" | "REVIEWED" | "SAVED" | "SKIPPED";
          meta: ResultDraft["meta"];
        }>;

        if (rawItems.length > 0) {
          // Block-level path (items present).
          const sorted = [...rawItems].sort((a, b) => a.order - b.order);
          setItems(sorted);
          // Keep enrichedDrafts in sync with items (one draft per passage group)
          setEnrichedDrafts(itemsToDraftSummaries(sorted));

          const firstPassage =
            sorted.find((it) => it.blockType === "PASSAGE_BODY") ?? sorted[0];
          if (firstPassage) {
            setSelectedItemId(firstPassage.id);
            setFocusedPageIndex(firstPageOf(firstPassage));
          }
        } else if (rawResults.length > 0) {
          // Legacy M1 fallback. items[]가 비어 있고 ExtractionResult만 있는 경우
          // 호출된다. 구체적 원인은 (a) 파이프라인이 M1로만 저장됐거나 (b) 신
          // 파이프라인이 items 저장 전에 중단됐을 가능성.
          console.info(
            "[review-step] Entering legacy M1 review: items=0, results=%d",
            rawResults.length,
          );
          const sorted = rawResults
            .sort((a, b) => a.passageOrder - b.passageOrder)
            .map((r) => ({
              id: r.id,
              passageOrder: r.passageOrder,
              sourcePageIndex: r.sourcePageIndex,
              title: r.title ?? `지문 ${r.passageOrder + 1}`,
              content: r.content,
              confidence: r.confidence,
              status: r.status,
              meta: r.meta ?? null,
            }));
          setDrafts(sorted);
          setItems([]);
          if (sorted.length > 0) {
            setLegacyDraftId(sorted[0].id);
            setFocusedPageIndex(sorted[0].sourcePageIndex[0] ?? 0);
          }
        }

        const mat = (data.sourceMaterial ?? null) as SourceMaterialSnapshot | null;
        if (mat) {
          setSourceMaterial(mat);
          setSourceDraft(buildSourceDraft(mat));
        } else {
          setSourceDraft((prev) => ({
            ...prev,
            title: prev.title || data.job?.originalFileName || "",
          }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
}
