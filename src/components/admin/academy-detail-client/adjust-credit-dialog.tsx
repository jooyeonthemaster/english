"use client";

import { Minus, Plus } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AdjustCreditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academyName: string;
  currentBalance: number;
  amount: string;
  onAmountChange: (v: string) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  adjusting: boolean;
  onConfirm: () => void;
}

export function AdjustCreditDialog({
  open,
  onOpenChange,
  academyName,
  currentBalance,
  amount,
  onAmountChange,
  reason,
  onReasonChange,
  adjusting,
  onConfirm,
}: AdjustCreditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[16px]">크레딧 조정</DialogTitle>
          <DialogDescription className="text-[13px]">
            <strong>{academyName}</strong>의 크레딧을 추가하거나 차감합니다.
            현재 잔액: <strong>{formatNumber(currentBalance)}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-gray-600">
              금액 (양수 = 추가, 음수 = 차감)
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => {
                  const v = parseInt(amount) || 0;
                  onAmountChange(String(v - 100));
                }}
              >
                <Minus className="size-3.5" />
              </Button>
              <Input
                type="number"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="h-9 text-[13px] text-center flex-1"
                placeholder="0"
              />
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => {
                  const v = parseInt(amount) || 0;
                  onAmountChange(String(v + 100));
                }}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-gray-600">
              사유
            </Label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="크레딧 조정 사유를 입력하세요"
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 resize-none"
            />
          </div>

          {amount && parseInt(amount) !== 0 && (
            <div className="rounded-lg bg-gray-50 p-3 text-[12px] text-gray-500">
              조정 후 잔액:{" "}
              <strong className="text-gray-800">
                {formatNumber(currentBalance + (parseInt(amount) || 0))}
              </strong>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={adjusting}
          >
            취소
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={
              !amount ||
              parseInt(amount) === 0 ||
              !reason.trim() ||
              adjusting
            }
          >
            {adjusting ? (
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                조정 중...
              </div>
            ) : (
              "조정 적용"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
