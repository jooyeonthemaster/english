"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface ReportCommentDialogProps {
  open: boolean;
  commentText: string;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onCommentChange: (value: string) => void;
  onSave: () => void;
}

export function ReportCommentDialog({
  open,
  commentText,
  isPending,
  onOpenChange,
  onCommentChange,
  onSave,
}: ReportCommentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>강사 코멘트 추가</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <textarea
            value={commentText}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="학생에 대한 개인적인 코멘트를 작성하세요..."
            className="w-full min-h-[120px] px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending}
            className="gradient-primary text-white"
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            ) : null}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
