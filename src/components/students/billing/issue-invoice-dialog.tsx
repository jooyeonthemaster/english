"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createInvoice } from "@/actions/billing";
import type { StudentInvoice } from "./types";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function lastDay(year: number, month1: number) {
  return new Date(year, month1, 0).getDate();
}

export function IssueInvoiceDialog({
  open,
  onOpenChange,
  studentId,
  invoices,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  invoices: StudentInvoice[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  // Month options: previous, current, next.
  const monthOptions = useMemo(() => {
    const now = new Date();
    return [-1, 0, 1].map((offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      return {
        value: monthKey(d),
        label: `${d.getFullYear()}년 ${d.getMonth() + 1}월`,
        year: d.getFullYear(),
        month1: d.getMonth() + 1,
      };
    });
  }, []);

  const [month, setMonth] = useState(monthOptions[1].value);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [dueDate, setDueDate] = useState("");

  function applyMonth(value: string) {
    setMonth(value);
    const opt = monthOptions.find((m) => m.value === value);
    if (opt) {
      setTitle(`${opt.year}년 ${opt.month1}월 수강료`);
      setDueDate(`${opt.value}-${String(lastDay(opt.year, opt.month1)).padStart(2, "0")}`);
    }
  }

  useEffect(() => {
    if (open) {
      applyMonth(monthOptions[1].value);
      setAmount("");
      setDiscount("0");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const finalAmount = Math.max(0, (Number(amount) || 0) - (Number(discount) || 0));

  function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error("금액을 올바르게 입력하세요.");
      return;
    }
    // Duplicate-month guard (server has none): block when an outstanding invoice
    // already exists for the selected month.
    const dup = invoices.some(
      (inv) =>
        monthKey(new Date(inv.dueDate)) === month &&
        ["PENDING", "PARTIAL", "OVERDUE"].includes(inv.status),
    );
    if (dup) {
      toast.error("이번 달 청구서가 이미 있어요.");
      return;
    }
    startTransition(async () => {
      const result = await createInvoice({
        studentId,
        title: title || `${month} 수강료`,
        amount: amt,
        discount: Number(discount) || 0,
        dueDate,
        memo: undefined,
      });
      if (result.success) {
        toast.success("청구서를 발행했어요.");
        onOpenChange(false);
        onDone();
      } else {
        toast.error(result.error || "발행에 실패했어요.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-[#191F28]">청구서 발행</DialogTitle>
          <DialogDescription className="text-sm font-medium text-[#8B95A1]">
            수강료 청구서를 발행합니다. 실제 결제는 연동되지 않아요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold text-[#6B7684]">청구월</Label>
              <Select value={month} onValueChange={applyMonth}>
                <SelectTrigger className="mt-1.5 h-10 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold text-[#6B7684]">납부기한</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 h-10 rounded-lg"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold text-[#6B7684]">항목</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 h-10 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold text-[#6B7684]">금액</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="300000"
                className="mt-1.5 h-10 rounded-lg"
                min={1}
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-[#6B7684]">할인</Label>
              <Input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="mt-1.5 h-10 rounded-lg"
                min={0}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-[#F7F8FA] px-3 py-2.5">
            <span className="text-xs font-bold text-[#6B7684]">청구 금액</span>
            <span className="text-base font-black text-[#191F28]">{formatCurrency(finalAmount)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            className="h-10 rounded-lg border-[#E5E8EB] font-bold text-[#4E5968]"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <Button
            className="h-10 rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700"
            onClick={submit}
            disabled={isPending}
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            발행하기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
