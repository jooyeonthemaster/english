"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { createExpense } from "@/actions/finance";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExpenseFormDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [category, setCategory] = useState("OTHER");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState("");

  function formatAmountInput(value: string) {
    const numOnly = value.replace(/[^0-9]/g, "");
    if (!numOnly) return "";
    return parseInt(numOnly).toLocaleString("ko-KR");
  }

  const numericAmount = parseInt(amount.replace(/,/g, "")) || 0;

  async function handleSubmit() {
    if (numericAmount <= 0) {
      toast.error("금액을 입력해주세요.");
      return;
    }
    if (!date) {
      toast.error("날짜를 선택해주세요.");
      return;
    }

    startTransition(async () => {
      const result = await createExpense({
        category,
        amount: numericAmount,
        date,
        description: description.trim() || undefined,
        receipt: receipt.trim() || undefined,
      });

      if (result.success) {
        toast.success("지출이 등록되었습니다.");
        onOpenChange(false);
        // Reset form
        setCategory("OTHER");
        setAmount("");
        setDescription("");
        setReceipt("");
        router.refresh();
      } else {
        toast.error(result.error || "오류가 발생했습니다.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>지출 등록</DialogTitle>
          <DialogDescription>학원 지출 내역을 기록합니다.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Category */}
          <div className="space-y-1.5">
            <Label>카테고리</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label>금액</Label>
            <div className="relative">
              <Input
                placeholder="0"
                className="pr-8 text-right"
                value={amount}
                onChange={(e) => setAmount(formatAmountInput(e.target.value))}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#8B95A1]">
                원
              </span>
            </div>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>날짜</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>내용</Label>
            <Textarea
              placeholder="지출 내용을 입력하세요"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Receipt URL */}
          <div className="space-y-1.5">
            <Label>영수증 (선택)</Label>
            <Input
              type="url"
              placeholder="영수증 이미지 URL 또는 파일 경로"
              value={receipt}
              onChange={(e) => setReceipt(e.target.value)}
            />
            <p className="text-xs text-[#8B95A1]">
              영수증 이미지의 URL을 입력하세요.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-[#3B82F6] hover:bg-[#2563EB]"
          >
            {isPending ? "등록 중..." : "지출 등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
