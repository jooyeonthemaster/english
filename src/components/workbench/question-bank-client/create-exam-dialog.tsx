// @ts-nocheck
"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examTitle: string;
  setExamTitle: (title: string) => void;
  selectedCount: number;
  creating: boolean;
  onCreate: () => void;
}

export function CreateExamDialog({
  open,
  onOpenChange,
  examTitle,
  setExamTitle,
  selectedCount,
  creating,
  onCreate,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
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
