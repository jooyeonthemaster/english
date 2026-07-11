"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordPayment } from "@/actions/billing";
import { invoiceOutstanding } from "@/lib/billing-status";
import type { StudentInvoice } from "./types";

const METHODS = [
  { value: "CASH", label: "현금" },
  { value: "TRANSFER", label: "이체" },
  { value: "CARD", label: "카드" },
];

function today() {
  return new Date().toISOString().split("T")[0];
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoice,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: StudentInvoice | null;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const outstanding = invoice ? invoiceOutstanding(invoice) : 0;
  const [method, setMethod] = useState("CASH");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(today());
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (open) {
      setMethod("CASH");
      setAmount(String(outstanding));
      setPaidAt(today());
      setMemo("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id]);

  function submit() {
    if (!invoice) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error("금액을 올바르게 입력해 주세요.");
      return;
    }
    if (amt > outstanding) {
      toast.error(`잔액(${formatCurrency(outstanding)})보다 클 수 없습니다.`);
      return;
    }
    startTransition(async () => {
      const result = await recordPayment(invoice.id, {
        amount: amt,
        method,
        paidAt,
        memo: memo || undefined,
      });
      if (result.success) {
        toast.success(amt >= outstanding ? "완납 처리했습니다." : "부분 납부를 기록했습니다.");
        onOpenChange(false);
        onDone();
      } else {
        toast.error(result.error || "처리에 실패했습니다.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">납부 처리</DialogTitle>
          <DialogDescription className="text-[12.5px] font-medium text-slate-400">
            {invoice?.title} · 잔액 {formatCurrency(outstanding)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-slate-500">결제수단</Label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-lg border text-[13px] font-semibold transition-colors",
                    method === m.value
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-500">납부 금액</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1.5 h-10 rounded-lg"
                min={1}
                max={outstanding}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500">납부일</Label>
              <Input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="mt-1.5 h-10 rounded-lg"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-500">메모 (선택)</Label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 6월분 일부"
              className="mt-1.5 h-10 rounded-lg"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            className="h-10 rounded-lg border-slate-200 font-semibold text-slate-600 hover:bg-slate-50"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <Button
            className="h-10 rounded-lg bg-blue-600 font-semibold text-white hover:bg-blue-700"
            onClick={submit}
            disabled={isPending}
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            기록
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
