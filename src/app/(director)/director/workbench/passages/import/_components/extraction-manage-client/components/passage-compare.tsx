"use client";

import { Loader2, RefreshCw, Save, Trash2 } from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";
import { getDraftSourceLabel } from "../utils/draft-source";
import { ComparisonPanel } from "./comparison-panel";
import { EditableRestoredTextBox } from "./editable-restored-text-box";
import { OriginalProblemBox } from "./original-problem-box";
import { RestorationBadge } from "./restoration-badge";
import { RestorationMethodBadge } from "./restoration-method-badge";
import { SourceMatchPanel } from "./source-match-panel";

export function PassageCompare({
  draft,
  deleting,
  rerestoring,
  saving,
  onDelete,
  onRerestore,
  onSave,
  onTextChange,
}: {
  draft: M1PassageDraftWithJob;
  deleting: boolean;
  rerestoring: boolean;
  saving: boolean;
  onDelete: () => void;
  onRerestore: () => void;
  onSave: () => void;
  onTextChange: (value: string) => void;
}) {
  const busy = deleting || rerestoring || saving;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[17px] font-bold text-slate-950">
              지문 {draft.passageOrder + 1}
            </h3>
            <RestorationBadge status={draft.restorationStatus} />
            <RestorationMethodBadge draft={draft} />
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
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-[12px] font-bold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-3.5" aria-hidden="true" />
            )}
            수정 저장
          </button>
        </div>
      </div>

      <SourceMatchPanel draft={draft} />
      <ComparisonPanel draft={draft} />

      <div className="grid min-h-0 flex-1 gap-4 2xl:grid-cols-2">
        <OriginalProblemBox draft={draft} />
        <EditableRestoredTextBox
          value={draft.teacherText}
          changes={draft.changes}
          onChange={onTextChange}
        />
      </div>
    </div>
  );
}
