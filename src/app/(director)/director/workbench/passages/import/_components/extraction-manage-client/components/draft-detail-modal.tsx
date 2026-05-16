"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Pencil, X } from "lucide-react";

import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";

import type { M1PassageDraftWithJob } from "../types";
import { getDraftSourceLabel } from "../utils/draft-source";
import { getDraftDisplayTitle, hasExplicitTitle } from "../utils/title";
import { PassageCompare } from "./passage-compare";

interface DraftDetailModalProps {
  draft: M1PassageDraftWithJob;
  savingId: string | null;
  rerestoringId: string | null;
  deletingDraftId: string | null;
  promotingId: string | null;
  onClose: () => void;
  onDelete: (draft: M1PassageDraftSnapshot) => void;
  onRerestore: (draft: M1PassageDraftSnapshot) => void;
  onSave: (draft: M1PassageDraftSnapshot) => void;
  onPromote: (draft: M1PassageDraftSnapshot) => void;
  onTextChange: (id: string, value: string) => void;
  onTitleChange: (id: string, value: string | null) => void;
}

export function DraftDetailModal({
  draft,
  savingId,
  rerestoringId,
  deletingDraftId,
  promotingId,
  onClose,
  onDelete,
  onRerestore,
  onSave,
  onPromote,
  onTextChange,
  onTitleChange,
}: DraftDetailModalProps) {
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(draft.title ?? "");

  // Reset edit state when switching to a different draft
  useEffect(() => {
    setTitleEditing(false);
    setTitleInput(draft.title ?? "");
  }, [draft.id, draft.title]);

  const commitTitle = useCallback(() => {
    const trimmed = titleInput.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    const current = draft.title ?? null;
    if (next !== current) {
      onTitleChange(draft.id, next);
    }
    setTitleEditing(false);
  }, [titleInput, draft.id, draft.title, onTitleChange]);

  const cancelTitleEdit = useCallback(() => {
    setTitleInput(draft.title ?? "");
    setTitleEditing(false);
  }, [draft.title]);
  // ESC to close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Body scroll lock
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const sourceLabel = getDraftSourceLabel(draft);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-4 my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFB] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3.5 shrink-0 xl:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <FileText className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              {titleEditing ? (
                <input
                  autoFocus
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitTitle();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelTitleEdit();
                    }
                  }}
                  placeholder={getDraftDisplayTitle(draft)}
                  maxLength={200}
                  className="h-7 w-full max-w-xl rounded-md border border-blue-300 bg-white px-2 text-base font-bold text-slate-900 outline-none ring-2 ring-blue-100 placeholder:font-medium placeholder:text-slate-400"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTitleInput(draft.title ?? "");
                    setTitleEditing(true);
                  }}
                  className="group inline-flex max-w-full cursor-text items-center gap-1.5 rounded-md text-left"
                  title="제목 편집"
                >
                  <h2 className="truncate text-base font-bold text-slate-900 group-hover:text-blue-700">
                    {getDraftDisplayTitle(draft)}
                  </h2>
                  {!hasExplicitTitle(draft) ? (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-500">
                      자동
                    </span>
                  ) : null}
                  <Pencil
                    className="size-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-blue-500"
                    aria-hidden="true"
                  />
                </button>
              )}
              <p className="mt-0.5 truncate text-xs text-slate-500" title={sourceLabel}>
                출처 {sourceLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body — min-h-0 lets the inner panels claim their own scroll
            container instead of overflowing the modal as a whole. */}
        <div className="flex min-h-0 flex-1 flex-col p-5 xl:p-6">
          <PassageCompare
            draft={draft}
            saving={savingId === draft.id}
            rerestoring={rerestoringId === draft.id}
            deleting={deletingDraftId === draft.id}
            promoting={promotingId === draft.id}
            onDelete={() => onDelete(draft)}
            onRerestore={() => onRerestore(draft)}
            onSave={() => onSave(draft)}
            onPromote={() => onPromote(draft)}
            onTextChange={(value) => onTextChange(draft.id, value)}
          />
        </div>
      </div>
    </div>
  );
}
