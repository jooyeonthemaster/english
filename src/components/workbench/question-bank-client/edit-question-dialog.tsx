// @ts-nocheck
"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuestionEditWorkspace } from "../question-ai-edit/question-edit-workspace";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  loadError: string | null;
  editingQuestion: any | null;
  editingQuestionId: string | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onRetry: (id: string) => void;
  onSaved?: () => void;
  onApproved?: () => void;
  /** AI '새 문제로 저장' 성공 시 새 문제 id — 목록 갱신·강조용. */
  onSavedAsNew?: (newQuestionId: string) => void;
  /** 상세 보기에서 들어온 경우에만 전달 — 헤더에 '뒤로' 버튼을 노출한다. */
  onBack?: () => void;
  /** 본문 위에 끼울 바(예: 세트 멤버 1번/2번 토글). 미지정 시 기존 그대로. */
  topBar?: React.ReactNode;
}

export function EditQuestionDialog({
  open,
  onOpenChange,
  loading,
  loadError,
  editingQuestion,
  editingQuestionId,
  onClose,
  onDeleted,
  onRetry,
  onSaved,
  onApproved,
  onSavedAsNew,
  onBack,
  topBar,
}: Props) {
  const body = (
    <>
      {loading ? (
          <div className="flex h-full items-center justify-center bg-white">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              문제를 불러오는 중
            </div>
          </div>
        ) : loadError ? (
          <div className="flex h-full items-center justify-center bg-white">
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium text-slate-700">{loadError}</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  닫기
                </Button>
                {editingQuestionId && (
                  <Button size="sm" onClick={() => onRetry(editingQuestionId)}>
                    다시 불러오기
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : editingQuestion ? (
          <QuestionEditWorkspace
            key={editingQuestion.id}
            question={editingQuestion}
            mode="modal"
            onClose={onClose}
            onDeleted={onDeleted}
            onSaved={onSaved}
            onApproved={onApproved}
            onSavedAsNew={onSavedAsNew}
            onBack={onBack}
          />
        ) : null}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[1680px] gap-0 overflow-hidden rounded-2xl border-slate-200 bg-[#F8FAFB] p-0 shadow-2xl sm:max-w-[1680px]"
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>문제 수정</DialogTitle>
        </DialogHeader>
        {topBar ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0">{topBar}</div>
            <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
          </div>
        ) : (
          body
        )}
      </DialogContent>
    </Dialog>
  );
}
