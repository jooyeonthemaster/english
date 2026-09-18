"use client";

// ============================================================================
// ReviewStep — block-level review surface for the bulk extraction pipeline.
//
// Layout (desktop, 1280px+):
//
//   ┌─ Header ───────────────────────────────────────────────────────────────┐
//   │ 리뷰 · <source title> · 모드 <M>     [임시저장]  [저장]                │
//   ├─────────────────┬────────────────────────┬────────────────────────────┤
//   │ BlockTreePanel  │ OriginalViewer         │ StructuredEditor           │
//   │ 320px           │ flex-1 (min 640px)     │ 520px                      │
//   └─────────────────┴────────────────────────┴────────────────────────────┘
//
// Two data paths:
//   (A) items[] is present  → block-level review (M2/M4, or M1 with items).
//   (B) only results[]      → legacy M1 passage-list review (fallback).
//
// Store actions used:
//   setItems, updateItem, setSelectedItemId, setFocusedPageIndex,
//   setEnrichedDrafts, setSourceMeta, setDrafts, updateDraft, removeDraft.
//
// The file was split into ./review-step/* during a mechanical refactor to
// keep each unit under 300 lines. The public contract — named export
// `ReviewStep` with zero props — is preserved.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { getModeConfig } from "@/lib/extraction/modes";
import { useExtractionStore } from "@/lib/extraction/store";

import { BlockTreePanel } from "./review-step/block-tree/block-tree-panel";
import {
  handleMergeWithNext,
  handleSplit,
} from "./review-step/commit/mutations";
import { LegacyReview } from "./review-step/legacy/legacy-review";
import { M2DraftPanel } from "./review-step/m2-drafts/m2-draft-panel";
import { OriginalViewer } from "./review-step/original-viewer";
import {
  buildSourceDraft,
  firstPageOf,
  mergeSourceMatchIntoDraft,
} from "./review-step/source-draft";
import { StructuredEditor } from "./review-step/structured-editor";
import { TopBar } from "./review-step/top-bar";
import { buildTree, statsOf } from "./review-step/tree-utils";
import type {
  EditorTab,
  LoadedPage,
  M2PassageDraftSnapshot,
  SourceMaterialDraft,
} from "./review-step/types";
import { useCommit } from "./review-step/use-commit";
import { useKeyboardShortcuts } from "./review-step/use-keyboard-shortcuts";
import { useLoadJob } from "./review-step/use-load-job";

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export function ReviewStep() {
  const jobId = useExtractionStore((s) => s.jobId);
  const mode = useExtractionStore((s) => s.mode);
  const phase = useExtractionStore((s) => s.phase);
  const setPhase = useExtractionStore((s) => s.setPhase);
  const setLastCommitResult = useExtractionStore((s) => s.setLastCommitResult);
  const setCompletedAt = useExtractionStore((s) => s.setCompletedAt);

  const items = useExtractionStore((s) => s.items);
  const setItems = useExtractionStore((s) => s.setItems);
  const updateItem = useExtractionStore((s) => s.updateItem);
  const setEnrichedDrafts = useExtractionStore((s) => s.setEnrichedDrafts);
  const sourceMaterial = useExtractionStore((s) => s.sourceMaterial);
  const setSourceMaterial = useExtractionStore((s) => s.setSourceMaterial);

  const selectedItemId = useExtractionStore((s) => s.selectedItemId);
  const setSelectedItemId = useExtractionStore((s) => s.setSelectedItemId);
  const focusedPageIndex = useExtractionStore((s) => s.focusedPageIndex);
  const setFocusedPageIndex = useExtractionStore((s) => s.setFocusedPageIndex);

  // Legacy fallback state (no items, only ExtractionResult rows)
  const drafts = useExtractionStore((s) => s.drafts);
  const setDrafts = useExtractionStore((s) => s.setDrafts);
  const updateDraft = useExtractionStore((s) => s.updateDraft);
  const removeDraft = useExtractionStore((s) => s.removeDraft);

  const [pagesData, setPagesData] = useState<LoadedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspectOnly, setSuspectOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("passage");
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);
  const [m2PassageDrafts, setM2PassageDrafts] = useState<
    M2PassageDraftSnapshot[]
  >([]);
  const [sourceDraft, setSourceDraft] = useState<SourceMaterialDraft>(
    buildSourceDraft(null),
  );
  // Legacy-only selection bookkeeping
  const [legacyDraftId, setLegacyDraftId] = useState<string | null>(null);

  const currentMode = mode ?? "PASSAGE_ONLY";
  const modeConfig = getModeConfig(currentMode);

  // ────────────────────────────────────────────────────────────────────
  // Load job data once on mount
  // ────────────────────────────────────────────────────────────────────
  useLoadJob({
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
  });

  // ────────────────────────────────────────────────────────────────────
  // Derived: tree, selected item, suspect filter
  // ────────────────────────────────────────────────────────────────────
  const tree = useMemo(
    () => buildTree(items, suspectOnly),
    [items, suspectOnly],
  );

  const selectedItem = useMemo(
    () => items.find((it) => it.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const selectedDraft = useMemo(
    () => drafts.find((d) => d.id === legacyDraftId) ?? null,
    [drafts, legacyDraftId],
  );

  // When a new block is selected, jump viewer to its page
  useEffect(() => {
    if (!selectedItem) return;
    const pg = firstPageOf(selectedItem);
    setFocusedPageIndex(pg);
  }, [selectedItem, setFocusedPageIndex]);

  // When selected item changes and the current tab is hidden for its type,
  // flip to an appropriate tab.
  useEffect(() => {
    if (!selectedItem) return;
    if (!modeConfig.reviewTabs.includes(activeTab)) {
      setActiveTab(modeConfig.reviewTabs[0] ?? "passage");
    }
    if (
      selectedItem.blockType === "QUESTION_STEM" ||
      selectedItem.blockType === "CHOICE"
    ) {
      if (modeConfig.reviewTabs.includes("question")) setActiveTab("question");
    } else if (selectedItem.blockType === "PASSAGE_BODY") {
      if (modeConfig.reviewTabs.includes("passage")) setActiveTab("passage");
    } else if (selectedItem.blockType === "EXPLANATION") {
      if (modeConfig.reviewTabs.includes("explanation"))
        setActiveTab("explanation");
    } else if (selectedItem.blockType === "EXAM_META") {
      setActiveTab("meta");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.id]);

  useEffect(() => {
    const bestMatch = m2PassageDrafts
      .flatMap((draft) => draft.sourceMatches)
      .find((match) => match.selected);
    if (!bestMatch) return;
    setSourceDraft((prev) => mergeSourceMatchIntoDraft(prev, bestMatch));
  }, [m2PassageDrafts]);

  const onCommit = useCommit({
    jobId,
    phase,
    currentMode,
    items,
    drafts,
    sourceDraft,
    originalFileName,
    setPhase,
    setLastCommitResult,
    setCompletedAt,
    setSelectedItemId,
  });

  const { onBlockTypeChange } = useKeyboardShortcuts({
    items,
    selectedItemId,
    setSelectedItemId,
    suspectOnly,
    updateItem,
    onCommit,
  });

  // ────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-sm text-slate-500">
        원본을 불러오는 중…
      </div>
    );
  }

  const hasItems = items.length > 0;

  return (
    <div className="flex h-[calc(100vh-56px-73px)] min-h-[560px] flex-col">
      <TopBar
        modeLabel={modeConfig.shortLabel}
        modeName={modeConfig.label}
        fileName={originalFileName ?? sourceDraft.title ?? "제목 없음"}
        stats={statsOf(items)}
        onCommit={onCommit}
        committing={phase === "committing"}
      />

      {currentMode === "QUESTION_SET" && m2PassageDrafts.length > 0 ? (
        <M2DraftPanel drafts={m2PassageDrafts} />
      ) : null}

      <div className="flex min-h-0 flex-1">
        {hasItems ? (
          <>
            <BlockTreePanel
              tree={tree}
              selectedId={selectedItemId}
              onSelect={setSelectedItemId}
              onHoverPage={setFocusedPageIndex}
              suspectOnly={suspectOnly}
              onToggleSuspect={() => setSuspectOnly((v) => !v)}
              totals={statsOf(items)}
            />
            <OriginalViewer
              pages={pagesData}
              selectedItem={selectedItem}
              items={items}
              focusedPageIndex={focusedPageIndex}
              onFocus={setFocusedPageIndex}
              suspectOnly={suspectOnly}
            />
            <StructuredEditor
              mode={currentMode}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              availableTabs={modeConfig.reviewTabs}
              items={items}
              selectedItem={selectedItem}
              onChangeContent={(id, content) => updateItem(id, { content })}
              onChangeTitle={(id, title) => updateItem(id, { title })}
              onChangeType={onBlockTypeChange}
              onSplit={(id, caret) => handleSplit(id, caret, items, setItems)}
              onMergeWithNext={(id) =>
                handleMergeWithNext(id, items, setItems, setSelectedItemId)
              }
              onSkipToggle={(id) =>
                updateItem(id, {
                  status:
                    items.find((i) => i.id === id)?.status === "SKIPPED"
                      ? "DRAFT"
                      : "SKIPPED",
                })
              }
              sourceDraft={sourceDraft}
              setSourceDraft={setSourceDraft}
              sourceMaterial={sourceMaterial}
              m2PassageDrafts={m2PassageDrafts}
            />
          </>
        ) : (
          <LegacyReview
            pages={pagesData}
            drafts={drafts}
            selectedId={legacyDraftId}
            focusedPageIndex={focusedPageIndex}
            onSelect={(id) => {
              setLegacyDraftId(id);
              const d = drafts.find((x) => x.id === id);
              if (d) setFocusedPageIndex(d.sourcePageIndex[0] ?? 0);
            }}
            onFocus={setFocusedPageIndex}
            onTitle={(v) => {
              if (legacyDraftId) updateDraft(legacyDraftId, { title: v });
            }}
            onContent={(v) => {
              if (legacyDraftId) updateDraft(legacyDraftId, { content: v });
            }}
            onDelete={() => {
              if (legacyDraftId) {
                removeDraft(legacyDraftId);
                setLegacyDraftId(null);
              }
            }}
            selected={selectedDraft}
          />
        )}
      </div>
    </div>
  );
}
