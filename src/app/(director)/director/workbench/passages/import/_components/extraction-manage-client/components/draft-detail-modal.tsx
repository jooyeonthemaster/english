"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";

import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";

import type { M1PassageDraftWithJob } from "../types";
import { getDraftSourceLabel } from "../utils/draft-source";
import { getDraftDisplayTitle } from "../utils/title";
import { PassageCompare } from "./passage-compare";

interface DraftDetailModalProps {
  draft: M1PassageDraftWithJob;
  savingId: string | null;
  rerestoringId: string | null;
  deletingDraftId: string | null;
  promotingId: string | null;
  unpromotingId: string | null;
  onClose: () => void;
  onDelete: (draft: M1PassageDraftSnapshot) => void;
  onRerestore: (draft: M1PassageDraftSnapshot) => void;
  onSave: (draft: M1PassageDraftSnapshot) => void;
  onPromote: (draft: M1PassageDraftSnapshot) => void;
  onUnpromote: (draft: M1PassageDraftSnapshot) => void;
  onTextChange: (id: string, value: string) => void;
  onTitleChange: (id: string, value: string | null) => void;
}

export function DraftDetailModal({
  draft,
  savingId,
  rerestoringId,
  deletingDraftId,
  promotingId,
  unpromotingId,
  onClose,
  onDelete,
  onRerestore,
  onSave,
  onPromote,
  onUnpromote,
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
  const isReviewed = draft.reviewStatus === "COMMITTED";
  const isSaving = savingId === draft.id;
  const isRerestoring = rerestoringId === draft.id;
  const isDeleting = deletingDraftId === draft.id;
  const isPromoting = promotingId === draft.id;
  const isUnpromoting = unpromotingId === draft.id;
  const busy =
    isSaving || isRerestoring || isDeleting || isPromoting || isUnpromoting;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-4 my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFB] shadow-2xl">
        {/* Header — single row combining title, source, badges, actions */}
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 shrink-0 xl:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
                  className="h-7 w-full max-w-xl min-w-0 flex-1 rounded-md border border-blue-300 bg-white px-2 text-base font-bold text-slate-900 outline-none ring-2 ring-blue-100 placeholder:font-medium placeholder:text-slate-400"
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setTitleInput(draft.title ?? "");
                      setTitleEditing(true);
                    }}
                    className="group inline-flex min-w-0 max-w-full cursor-text items-center gap-1.5 rounded-md text-left"
                    title="제목 편집"
                  >
                    <h2 className="truncate text-base font-bold text-slate-900 group-hover:text-blue-700">
                      {getDraftDisplayTitle(draft)}
                    </h2>
                    <Pencil
                      className="size-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-blue-500"
                      aria-hidden="true"
                    />
                  </button>
                </>
              )}
            </div>
            <p
              className="mt-0.5 truncate text-xs text-slate-500"
              title={sourceLabel}
            >
              출처 {sourceLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => (isReviewed ? onUnpromote(draft) : onPromote(draft))}
              disabled={busy}
              aria-pressed={isReviewed}
              className={
                "inline-flex size-9 cursor-pointer items-center justify-center rounded-md border bg-white transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60 " +
                (isReviewed
                  ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                  : "border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
              }
              aria-label={isReviewed ? "검수완료" : "미검수"}
              title={
                isReviewed
                  ? "검수완료 — 누르면 검수를 취소합니다"
                  : "검수필요 — 누르면 검수완료로 표시합니다"
              }
            >
              {isPromoting || isUnpromoting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onSave(draft)}
              disabled={busy}
              title="저장"
              aria-label="저장"
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md border border-slate-900 bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onDelete(draft)}
              disabled={busy}
              title="삭제"
              aria-label="삭제"
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="닫기"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body — 모바일(<lg)은 패널을 자연 높이로 펼치고 이 컨테이너(모달 본문)
            하나만 스크롤한다(패널별 개별 스크롤 폐지). 데스크톱(lg+)은 min-h-0로
            내부 패널이 각자 스크롤 컨테이너를 갖는 기존 레이아웃을 복원한다. */}
        <div className="flex flex-1 flex-col overflow-y-auto p-5 lg:min-h-0 lg:overflow-visible xl:p-6">
          <PassageCompare
            draft={draft}
            onTextChange={(value) => onTextChange(draft.id, value)}
            onRerestore={() => onRerestore(draft)}
            isRerestoring={isRerestoring}
            rerestoreDisabled={busy}
            title={titleInput}
            titlePlaceholder={getDraftDisplayTitle(draft)}
            onTitleChange={setTitleInput}
            onTitleCommit={commitTitle}
          />
        </div>
      </div>
    </div>
  );
}
