"use client";

import { FileImage, Loader2 } from "lucide-react";

import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";

import type { M1PassageDraftWithJob } from "../types";
import { EmptyState } from "./empty-state";
import { PassageCompare } from "./passage-compare";

interface DetailPanelProps {
  selectedDraft: M1PassageDraftWithJob | null;
  loading: boolean;
  busy: boolean;
  savingId: string | null;
  rerestoringId: string | null;
  deletingDraftId: string | null;
  onDelete: (draft: M1PassageDraftSnapshot) => void;
  onRerestore: (draft: M1PassageDraftSnapshot) => void;
  onSave: (draft: M1PassageDraftSnapshot) => void;
  onTextChange: (id: string, teacherText: string) => void;
}

export function DetailPanel({
  selectedDraft,
  loading,
  busy,
  savingId,
  rerestoringId,
  deletingDraftId,
  onDelete,
  onRerestore,
  onSave,
  onTextChange,
}: DetailPanelProps) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-[13px] font-bold text-slate-900">자료 추출 결과</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            선택한 지문의 문제 원문과 복원문을 비교하고 수정합니다.
          </p>
        </div>
        {selectedDraft ? (
          <span className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
            지문 {selectedDraft.passageOrder + 1}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <EmptyState
            icon={<Loader2 className="size-7 animate-spin" />}
            title="결과를 불러오는 중"
          />
        ) : selectedDraft ? (
          <PassageCompare
            draft={selectedDraft}
            saving={savingId === selectedDraft.id}
            rerestoring={rerestoringId === selectedDraft.id}
            deleting={deletingDraftId === selectedDraft.id}
            onDelete={() => onDelete(selectedDraft)}
            onRerestore={() => onRerestore(selectedDraft)}
            onSave={() => onSave(selectedDraft)}
            onTextChange={(value) => onTextChange(selectedDraft.id, value)}
          />
        ) : (
          <EmptyState
            icon={<FileImage className="size-7" />}
            title={
              busy
                ? "추출 결과를 기다리는 중입니다."
                : "왼쪽 목록에서 자료를 선택하세요"
            }
            description="선택된 지문의 원문과 복원문을 여기서 비교·수정할 수 있습니다."
          />
        )}
      </div>
    </section>
  );
}
