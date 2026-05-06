"use client";

// ============================================================================
// useLoadJob — fetch `/api/extraction/jobs/:id`, populate store and local
// state. Extracted from review-step.tsx during mechanical split.
// ============================================================================

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { EnrichedDraft } from "@/lib/extraction/segmentation";
import { getModeConfig } from "@/lib/extraction/modes";
import type {
  ExtractionItemSnapshot,
  ResultDraft,
  SourceMaterialSnapshot,
} from "@/lib/extraction/types";
import { itemsToDraftSummaries } from "./commit/items-to-drafts";
import { buildSourceDraft, firstPageOf } from "./source-draft";
import type {
  LoadedPage,
  M2PassageDraftSnapshot,
  SourceMaterialDraft,
} from "./types";

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
  setM2PassageDrafts: Dispatch<SetStateAction<M2PassageDraftSnapshot[]>>;
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
    setM2PassageDrafts,
  } = handlers;

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const load = async (attempt = 0) => {
      if (attempt === 0) setLoading(true);
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
        const loadedM2Drafts = (
          (data.passageDrafts ?? []) as M2PassageDraftSnapshot[]
        ).sort((a, b) => a.passageOrder - b.passageOrder);
        setM2PassageDrafts(loadedM2Drafts);

        const jobMode = data.job?.mode ?? "PASSAGE_ONLY";
        const relevantBlockTypes = new Set(
          getModeConfig(jobMode).relevantBlockTypes,
        );
        const rawItems =
          jobMode === "PASSAGE_ONLY"
            ? []
            : ((data.items ?? []) as ExtractionItemSnapshot[]).filter((item) =>
                relevantBlockTypes.has(item.blockType),
              );
        const shouldRetryM2Drafts =
          jobMode === "QUESTION_SET" &&
          loadedM2Drafts.length === 0 &&
          ((data.items ?? []) as ExtractionItemSnapshot[]).some(
            (item) => item.blockType === "PASSAGE_BODY",
          ) &&
          attempt < 8;

        if (shouldRetryM2Drafts) {
          const delayMs = Math.min(1500 + attempt * 750, 5000);
          timers.push(
            setTimeout(() => {
              if (!cancelled) void load(attempt + 1);
            }, delayMs),
          );
        }

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

        const mat = (data.sourceMaterial ??
          null) as SourceMaterialSnapshot | null;
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
        if (!cancelled && attempt === 0) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      for (const timer of timers) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
}
