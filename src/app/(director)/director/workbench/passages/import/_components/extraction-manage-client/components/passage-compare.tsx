"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Save, Trash2 } from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";
import { getDraftSourceLabel } from "../utils/draft-source";
import {
  mapChangesToOffsets,
  selectInlineChanges,
} from "../utils/restoration-changes";
import { getDraftDisplayTitle } from "../utils/title";
import { EditableRestoredTextBox } from "./editable-restored-text-box";
import { OriginalProblemBox } from "./original-problem-box";
import { RestorationBadge } from "./restoration-badge";
import { RestorationChangesPanel } from "./restoration-changes-panel";
import { RestorationMethodBadge } from "./restoration-method-badge";

export function PassageCompare({
  draft,
  deleting,
  rerestoring,
  saving,
  promoting,
  onDelete,
  onRerestore,
  onSave,
  onPromote,
  onTextChange,
}: {
  draft: M1PassageDraftWithJob;
  deleting: boolean;
  rerestoring: boolean;
  saving: boolean;
  promoting: boolean;
  onDelete: () => void;
  onRerestore: () => void;
  onSave: () => void;
  onPromote: () => void;
  onTextChange: (value: string) => void;
}) {
  const busy = deleting || rerestoring || saving || promoting;
  const isPromoted =
    draft.savedPassageId != null || draft.reviewStatus === "COMMITTED";

  // ─── Inline change selection (panel ↔ body sync) ───
  // `hoveredChangeId` follows mouse hover on either side; `activeChangeId`
  // is the locked selection from a click. Both panes render highlights from
  // the same state so hovering a card glows the corresponding passage mark
  // (and vice versa).
  const inlineChanges = useMemo(
    () => selectInlineChanges(draft.changes ?? [], draft.rawText, draft.teacherText),
    [draft.changes, draft.rawText, draft.teacherText],
  );
  // Orphan = a change whose `after` string can't be located in the current
  // teacherText. Happens when the teacher overrides AI restoration with
  // their own wording — the side card still surfaces the original AI reason
  // (so the teacher can revert), but the body highlight is gone.
  const orphanChangeIds = useMemo(() => {
    if (inlineChanges.length === 0) return new Set<string>();
    const spans = mapChangesToOffsets(
      draft.teacherText,
      inlineChanges.map((c) => ({ id: c.id, text: c.after })),
    );
    const matched = new Set(spans.map((s) => s.changeId));
    const orphans = new Set<string>();
    for (const change of inlineChanges) {
      if (!matched.has(change.id)) orphans.add(change.id);
    }
    return orphans;
  }, [inlineChanges, draft.teacherText]);
  const [hoveredChangeId, setHoveredChangeId] = useState<string | null>(null);
  const [activeChangeId, setActiveChangeId] = useState<string | null>(null);
  // Show the side panel whenever we have something meaningful to surface,
  // otherwise collapse back to the original two-pane layout.
  const showPanel = inlineChanges.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tabular-nums text-slate-400">
              #{draft.passageOrder + 1}
            </span>
            <h3 className="text-[17px] font-bold text-slate-950">
              {getDraftDisplayTitle(draft)}
            </h3>
            <RestorationBadge status={draft.restorationStatus} />
            <RestorationMethodBadge draft={draft} />
            {isPromoted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                지문 등록 완료
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] text-slate-500">
            출처 {getDraftSourceLabel(draft)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-[12px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {deleting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-3.5" aria-hidden="true" />
            )}
            삭제
          </button>
          <button
            type="button"
            onClick={onRerestore}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-[12px] font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          >
            {rerestoring ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            AI 복원 다시 실행
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-3.5" aria-hidden="true" />
            )}
            수정 저장
          </button>
          <button
            type="button"
            onClick={onPromote}
            disabled={busy || isPromoted}
            className={
              isPromoted
                ? "inline-flex h-9 cursor-default items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-bold text-emerald-700"
                : "inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12px] font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
            }
          >
            {promoting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
            )}
            {isPromoted ? "지문 등록 완료" : "지문으로 등록"}
          </button>
        </div>
      </div>

      <div
        className={
          "grid min-h-0 flex-1 gap-4 [grid-auto-rows:minmax(0,1fr)] " +
          (showPanel
            ? "2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]"
            : "2xl:grid-cols-2")
        }
      >
        <OriginalProblemBox
          draft={draft}
          changes={inlineChanges}
          hoveredChangeId={hoveredChangeId}
          activeChangeId={activeChangeId}
          onHoverChange={setHoveredChangeId}
          onSelectChange={setActiveChangeId}
        />
        <EditableRestoredTextBox
          value={draft.teacherText}
          rawText={draft.rawText}
          onChange={onTextChange}
          changes={inlineChanges}
          hoveredChangeId={hoveredChangeId}
          activeChangeId={activeChangeId}
          onHoverChange={setHoveredChangeId}
          onSelectChange={setActiveChangeId}
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
