"use client";

import { Check, Mail, Phone } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Plan, Registration } from "./types";

interface ApproveDialogProps {
  target: Registration | null;
  plans: Plan[];
  selectedPlan: string;
  onSelectedPlanChange: (v: string) => void;
  initialCredits: string;
  onInitialCreditsChange: (v: string) => void;
  approving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ApproveDialog({
  target,
  plans,
  selectedPlan,
  onSelectedPlanChange,
  initialCredits,
  onInitialCreditsChange,
  approving,
  onClose,
  onConfirm,
}: ApproveDialogProps) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[16px]">가입 승인</DialogTitle>
          <DialogDescription className="text-[13px]">
            <strong>{target?.academyName}</strong>을(를) 승인하고 구독을
            설정합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-gray-600">
              구독 요금제
            </Label>
            <Select value={selectedPlan} onValueChange={onSelectedPlanChange}>
              <SelectTrigger className="h-9 text-[13px]">
                <SelectValue placeholder="요금제를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem
                    key={plan.tier}
                    value={plan.tier}
                    className="text-[13px]"
                  >
                    {plan.name} (월 {plan.monthlyCredits} 크레딧)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-gray-600">
              초기 크레딧
            </Label>
            <Input
              type="number"
              value={initialCredits}
              onChange={(e) => onInitialCreditsChange(e.target.value)}
              className="h-9 text-[13px]"
              min={0}
            />
            <p className="text-[11px] text-gray-400">
              시작 시 지급되는 일회성 보너스 크레딧
            </p>
          </div>

          <div className="rounded-lg bg-gray-50 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-[12px] text-gray-500">
              <Mail className="size-3.5" />
              {target?.directorEmail}
            </div>
            <div className="flex items-center gap-2 text-[12px] text-gray-500">
              <Phone className="size-3.5" />
              {target?.phone}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={approving}
          >
            취소
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={!selectedPlan || approving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {approving ? (
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                승인 중...
              </div>
            ) : (
              <>
                <Check className="size-3.5" />
                승인
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
