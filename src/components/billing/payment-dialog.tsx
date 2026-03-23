"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/lib/constants";
import { recordPayment } from "@/actions/billing";
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
import { Checkbox } from "@/components/ui/checkbox";

interface Invoice {
  id: string;
  title: string;
  finalAmount: number;
  status: string;
  student: { name: string };
  payments: { amount: number }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
}

export function PaymentDialog({ open, onOpenChange, invoice }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = invoice.finalAmount - totalPaid;

  const [isPartial, setIsPartial] = useState(false);
  const [amount, setAmount] = useState(remaining.toLocaleString("ko-KR"));
  const [method, setMethod] = useState("CARD");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");

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
    if (numericAmount > remaining) {
      toast.error("남은 금액보다 큰 금액을 입력할 수 없습니다.");
      return;
    }

    startTransition(async () => {
      const result = await recordPayment(invoice.id, {
        amount: numericAmount,
        method,
        paidAt,
        reference: reference.trim() || undefined,
        memo: memo.trim() || undefined,
      });

      if (result.success) {
        toast.success("수납이 완료되었습니다.");
        onOpenChange(false);
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
          <DialogTitle>수납 처리</DialogTitle>
          <DialogDescription>
            {invoice.student.name} - {invoice.title}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Invoice Summary */}
          <div className="rounded-lg bg-[#F8F9FA] p-4">
            <div className="flex justify-between text-sm">
              <span className="text-[#8B95A1]">청구 금액</span>
              <span className="font-medium">{formatCurrency(invoice.finalAmount)}</span>
            </div>
            {totalPaid > 0 && (
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-[#8B95A1]">기납부액</span>
                <span className="text-emerald-600">{formatCurrency(totalPaid)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-[#E5E7EB] pt-1 text-sm">
              <span className="font-medium text-[#191F28]">잔액</span>
              <span className="font-bold text-red-600">{formatCurrency(remaining)}</span>
            </div>
          </div>

          {/* Partial Payment Toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="partialPayment"
              checked={isPartial}
              onCheckedChange={(checked) => {
                const val = checked === true;
                setIsPartial(val);
                if (!val) setAmount(remaining.toLocaleString("ko-KR"));
              }}
            />
            <label htmlFor="partialPayment" className="text-sm text-[#4E5968]">
              부분 납부
            </label>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label>납부 금액</Label>
            <div className="relative">
              <Input
                placeholder="0"
                className="pr-8 text-right"
                value={amount}
                onChange={(e) => setAmount(formatAmountInput(e.target.value))}
                disabled={!isPartial}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#8B95A1]">
                원
              </span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <Label>결제 방법</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Date */}
          <div className="space-y-1.5">
            <Label>납부일</Label>
            <Input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <Label>거래 번호 / 참조 (선택)</Label>
            <Input
              placeholder="카드 승인번호 등"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          {/* Memo */}
          <div className="space-y-1.5">
            <Label>메모 (선택)</Label>
            <Textarea
              placeholder="비고"
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-[#10B981] hover:bg-[#059669]"
          >
            {isPending ? "처리 중..." : `${formatCurrency(numericAmount)} 수납`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
