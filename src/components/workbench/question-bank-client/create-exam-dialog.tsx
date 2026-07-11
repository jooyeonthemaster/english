// @ts-nocheck
"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssignContentPreview } from "@/components/study-assignments/assign-content-preview";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examTitle: string;
  setExamTitle: (title: string) => void;
  selectedCount: number;
  /** 선택된 문항 id 목록 — 있으면 "선택 문항 확인" 실물 미리보기 토글이 노출된다. */
  selectedQuestionIds?: string[];
  creating: boolean;
  onCreate: () => void;
}

export function CreateExamDialog({
  open,
  onOpenChange,
  examTitle,
  setExamTitle,
  selectedCount,
  selectedQuestionIds,
  creating,
  onCreate,
}: Props) {
  const [showPreview, setShowPreview] = React.useState(false);

  // 닫힐 때 접힘 상태로 리셋 — 다음에 열 때 기본 접힘 유지.
  React.useEffect(() => {
    if (!open) setShowPreview(false);
  }, [open]);

  const questionIds = selectedQuestionIds ?? [];
  const previewTarget = React.useMemo(
    () =>
      questionIds.length > 0
        ? ({ kind: "QUESTIONS", questionIds } as const)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questionIds.join(",")],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          showPreview && previewTarget ? "sm:max-w-2xl" : "sm:max-w-[400px]",
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">
            시험지 만들기 ({selectedCount}문제)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="시험지 제목"
            value={examTitle}
            onChange={(e) => setExamTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreate();
            }}
            autoFocus
          />
          <p className="text-xs text-slate-500">
            선택한 {selectedCount}문항으로 초안(DRAFT) 시험지를 생성합니다. 생성 후 상세 페이지에서 순서, 배점 등을 편집할 수 있습니다.
          </p>

          {/* 선택 문항 실물 확인 — 기본 접힘, 펼치면 AssignContentPreview 자가 페치 */}
          {previewTarget ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                aria-expanded={showPreview}
                className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <span>선택한 문항 {selectedCount}개 확인하기</span>
                <ChevronDown
                  className={cn(
                    "size-3.5 text-slate-400 transition-transform",
                    showPreview && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
              {showPreview ? (
                <div className="max-h-[360px] overflow-hidden rounded-md border border-slate-200">
                  <AssignContentPreview
                    target={previewTarget}
                    className="h-[360px]"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            size="sm"
            onClick={onCreate}
            disabled={!examTitle.trim() || creating}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {creating ? "생성 중..." : "시험지 생성"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
