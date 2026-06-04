"use client";

import { useMemo, useState } from "react";

import type { M1PassageDraftWithJob } from "../types";
import {
  isHighlightableChange,
  mapChangesToOffsets,
  selectInlineChanges,
} from "../utils/restoration-changes";
import { EditableRestoredTextBox } from "./editable-restored-text-box";
import { OriginalProblemBox } from "./original-problem-box";
import { RestorationChangesPanel } from "./restoration-changes-panel";

export function PassageCompare({
  draft,
  onTextChange,
  onRerestore,
  isRerestoring,
  rerestoreDisabled,
}: {
  draft: M1PassageDraftWithJob;
  onTextChange: (value: string) => void;
  onRerestore?: () => void;
  isRerestoring?: boolean;
  rerestoreDisabled?: boolean;
}) {
  // ─── Inline change selection (panel ↔ body sync) ───
  // `hoveredChangeId` follows mouse hover on either side; `activeChangeId`
  // is the locked selection from a click. Both panes render highlights from
  // the same state so hovering a card glows the corresponding passage mark
  // (and vice versa).
  const inlineChanges = useMemo(
    () => selectInlineChanges(draft.changes ?? [], draft.rawText, draft.teacherText),
    [draft.changes, draft.rawText, draft.teacherText],
  );
  // Whole-body cards (source-match) get a side panel card but no inline
  // body highlight. Strip them before handing changes to the comparison
  // panes so the whole passage doesn't paint rose/amber, and skip them in
  // orphan detection so they aren't misclassified as teacher-edited.
  const highlightableChanges = useMemo(
    () => inlineChanges.filter(isHighlightableChange),
    [inlineChanges],
  );
  // Orphan = a change whose `after` string can't be located in the current
  // teacherText. Happens when the teacher overrides AI restoration with
  // their own wording — the side card still surfaces the original AI reason
  // (so the teacher can revert), but the body highlight is gone.
  const orphanChangeIds = useMemo(() => {
    if (highlightableChanges.length === 0) return new Set<string>();
    const spans = mapChangesToOffsets(
      draft.teacherText,
      highlightableChanges.map((c) => ({ id: c.id, text: c.after })),
    );
    const matched = new Set(spans.map((s) => s.changeId));
    const orphans = new Set<string>();
    for (const change of highlightableChanges) {
      if (!matched.has(change.id)) orphans.add(change.id);
    }
    return orphans;
  }, [highlightableChanges, draft.teacherText]);
  const [hoveredChangeId, setHoveredChangeId] = useState<string | null>(null);
  const [activeChangeId, setActiveChangeId] = useState<string | null>(null);
  // Show the side panel whenever we have something meaningful to surface,
  // otherwise collapse back to the original two-pane layout.
  const showPanel = inlineChanges.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div
        className={
          "grid min-h-0 flex-1 gap-4 [grid-auto-rows:minmax(0,1fr)] " +
          (showPanel
            ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]"
            : "grid-cols-2")
        }
      >
        <OriginalProblemBox
          draft={draft}
          changes={highlightableChanges}
          hoveredChangeId={hoveredChangeId}
          activeChangeId={activeChangeId}
          onHoverChange={setHoveredChangeId}
          onSelectChange={setActiveChangeId}
        />
        <EditableRestoredTextBox
          value={draft.teacherText}
          rawText={draft.rawText}
          onChange={onTextChange}
          changes={highlightableChanges}
          hoveredChangeId={hoveredChangeId}
          activeChangeId={activeChangeId}
          onHoverChange={setHoveredChangeId}
          onSelectChange={setActiveChangeId}
          onRerestore={onRerestore}
          isRerestoring={isRerestoring}
          rerestoreDisabled={rerestoreDisabled}
        />
        {showPanel ? (
          <RestorationChangesPanel
            changes={inlineChanges}
            orphanChangeIds={orphanChangeIds}
            hoveredChangeId={hoveredChangeId}
            activeChangeId={activeChangeId}
            onHoverChange={setHoveredChangeId}
            onSelectChange={setActiveChangeId}
          />
        ) : null}
      </div>
    </div>
  );
}
