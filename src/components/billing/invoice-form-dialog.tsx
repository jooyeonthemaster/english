"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { createInvoice, getStudentsForInvoice } from "@/actions/billing";
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
import { Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StudentOption {
  id: string;
  name: string;
  grade: number;
  phone: string | null;
}

export function InvoiceFormDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [showStudentList, setShowStudentList] = useState(false);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [memo, setMemo] = useState("");
  const [sendNotification, setSendNotification] = useState(false);

  // Load students on open
  useEffect(() => {
    if (open) {
      getStudentsForInvoice().then(setStudents);
      // Reset form
      setSelectedStudent(null);
      setStudentSearch("");
      setTitle("");
      setAmount("");
      setDiscountValue("");
      setDueDate("");
      setMemo("");
      setSendNotification(false);
    }
  }, [open]);

  const numericAmount = parseInt(amount.replace(/,/g, "")) || 0;
  const discount =
    discountType === "percent"
      ? Math.round(numericAmount * ((parseInt(discountValue) || 0) / 100))
      : parseInt(discountValue.replace(/,/g, "")) || 0;
  const finalAmount = Math.max(0, numericAmount - discount);

  const filteredStudents = students.filter((s) =>
    s.name.includes(studentSearch)
  );

  function formatAmountInput(value: string) {
    const numOnly = value.replace(/[^0-9]/g, "");
    if (!numOnly) return "";
    return parseInt(numOnly).toLocaleString("ko-KR");
  }

  async function handleSubmit() {
    if (!selectedStudent) {
      toast.error("학생을 선택해주세요.");
      return;
    }
    if (!title.trim()) {
      toast.error("청구 내역을 입력해주세요.");
      return;
    }
    if (numericAmount <= 0) {
      toast.error("금액을 입력해주세요.");
      return;
    }
    if (!dueDate) {
      toast.error("납부 기한을 선택해주세요.");
      return;
    }

    startTransition(async () => {
      const result = await createInvoice({
        studentId: selectedStudent.id,
        title: title.trim(),
        amount: numericAmount,
        discount,
        dueDate,
        memo: memo.trim() || undefined,
      });

      if (result.success) {
        toast.success("청구서가 생성되었습니다.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "오류가 발생했습니다.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>청구서 생성</DialogTitle>
          <DialogDescription>학생에게 새 청구서를 발행합니다.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Student Selector */}
          <div className="space-y-1.5">
            <Label>학생 선택</Label>
            {selectedStudent ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm font-medium">
                  {selectedStudent.name}
                  <span className="ml-1 text-xs text-[#8B95A1]">
                    {selectedStudent.grade}학년
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => {
                    setSelectedStudent(null);
                    setStudentSearch("");
                  }}
                >
                  변경
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#ADB5BD]" />
                <Input
                  placeholder="학생 이름을 검색하세요"
                  className="pl-9"
                  value={studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    setShowStudentList(true);
                  }}
                  onFocus={() => setShowStudentList(true)}
                />
                {showStudentList && (
                  <div className="absolute z-10 mt-1 max-h-[200px] w-full overflow-y-auto rounded-md border bg-white shadow-lg">
                    {filteredStudents.length === 0 ? (
                      <p className="px-3 py-4 text-center text-sm text-[#8B95A1]">
                        검색 결과가 없습니다.
                      </p>
                    ) : (
                      filteredStudents.map((s) => (
                        <button
                          key={s.id}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#F8F9FA]"
                          onClick={() => {
                            setSelectedStudent(s);
                            setShowStudentList(false);
                          }}
                        >
                          <span className="font-medium">{s.name}</span>
                          <span className="text-xs text-[#8B95A1]">{s.grade}학년</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label>청구 내역</Label>
            <Input
              placeholder="예: 2026년 3월 수강료"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
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

          {/* Discount */}
          <div className="space-y-1.5">
            <Label>할인 (선택)</Label>
            <div className="flex gap-2">
              <Select
                value={discountType}
                onValueChange={(v) => setDiscountType(v as "amount" | "percent")}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">금액</SelectItem>
                  <SelectItem value="percent">비율(%)</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Input
                  placeholder="0"
                  className="pr-8 text-right"
                  value={discountValue}
                  onChange={(e) =>
                    setDiscountValue(
                      discountType === "percent"
                        ? e.target.value.replace(/[^0-9]/g, "")
                        : formatAmountInput(e.target.value)
                    )
                  }
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#8B95A1]">
                  {discountType === "percent" ? "%" : "원"}
                </span>
              </div>
            </div>
          </div>

          {/* Final Amount Preview */}
          {numericAmount > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-[#F8F9FA] px-4 py-3">
              <span className="text-sm text-[#4E5968]">최종 청구 금액</span>
              <span className="text-lg font-bold text-[#191F28]">
                {formatCurrency(finalAmount)}
              </span>
            </div>
          )}

          {/* Due Date */}
          <div className="space-y-1.5">
            <Label>납부 기한</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {/* Memo */}
          <div className="space-y-1.5">
            <Label>메모 (선택)</Label>
            <Textarea
              placeholder="비고 사항을 입력하세요"
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          {/* Notification Toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="sendNotification"
              checked={sendNotification}
              onCheckedChange={(checked) => setSendNotification(checked === true)}
            />
            <label htmlFor="sendNotification" className="text-sm text-[#4E5968]">
              카카오 알림톡으로 청구서 발송
            </label>
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
            {isPending ? "생성 중..." : "청구서 생성"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
