"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  Save,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";

import type { M1PassageDraftWithJob } from "../types";
import { getDraftSourceLabel } from "../utils/draft-source";
import { getDraftDisplayTitle } from "../utils/title";
import { PassageCompare } from "./passage-compare";
import { RestorationBadge } from "./restoration-badge";
import { RestorationMethodBadge } from "./restoration-method-badge";

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
  // 검수완료는 명시적 COMMITTED 만 인정 — 생성의 부수효과로 savedPassageId 가
  // 붙어도 사람 검수 전이면 검수필요로 둔다(카드와 동일 기준).
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
                  <RestorationBadge status={draft.restorationStatus} />
                  <RestorationMethodBadge draft={draft} />
                  {isReviewed ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                      검수완료
                    </span>
                  ) : null}
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
              onClick={() => onDelete(draft)}
              disabled={busy}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-[12px] font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
              삭제
            </button>
            <button
              type="button"
              onClick={() => onSave(draft)}
              disabled={busy}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-3.5" aria-hidden="true" />
              )}
              수정 저장
            </button>
            <button
              type="button"
              onClick={() => (isReviewed ? onUnpromote(draft) : onPromote(draft))}
              disabled={busy}
              className={
                isReviewed
                  ? "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  : "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-[12px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              }
              title={
                isReviewed
                  ? "이미 검수가 완료된 자료입니다. 클릭하면 검수를 취소합니다."
                  : undefined
              }
            >
              {isPromoting || isUnpromoting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : isReviewed ? (
                <Undo2 className="size-3.5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              )}
              {isReviewed ? "검수취소" : "검수완료"}
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

        {/* Body — min-h-0 lets the inner panels claim their own scroll
            container instead of overflowing the modal as a whole. */}
        <div className="flex min-h-0 flex-1 flex-col p-5 xl:p-6">
          <PassageCompare
            draft={draft}
            onTextChange={(value) => onTextChange(draft.id, value)}
            onRerestore={() => onRerestore(draft)}
            isRerestoring={isRerestoring}
            rerestoreDisabled={busy}
          />
        </div>
      </div>
    </div>
  );
}
