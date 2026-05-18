"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Registration } from "./types";

interface RejectDialogProps {
  target: Registration | null;
  reason: string;
  onReasonChange: (v: string) => void;
  rejecting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function RejectDialog({
  target,
  reason,
  onReasonChange,
  rejecting,
  onClose,
  onConfirm,
}: RejectDialogProps) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[16px]">가입 거절</DialogTitle>
          <DialogDescription className="text-[13px]">
            <strong>{target?.academyName}</strong>의 가입 신청을 거절합니다.
            사유를 입력해 주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-gray-600">
              거절 사유
            </Label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="거절 사유를 입력하세요..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={rejecting}
          >
            취소
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={onConfirm}
            disabled={!reason.trim() || rejecting}
          >
            {rejecting ? (
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                거절 중...
              </div>
            ) : (
              <>
                <X className="size-3.5" />
                거절
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
