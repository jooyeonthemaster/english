"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { bulkCreateInvoices, getClassesForBulkInvoice } from "@/actions/billing";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Layers, Users } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ClassOption {
  id: string;
  name: string;
  fee: number;
  _count: { enrollments: number };
}

export function BulkInvoiceDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [month, setMonth] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (open) {
      getClassesForBulkInvoice().then(setClasses);
      setSelectedClassIds([]);
      // Default to current month
      const now = new Date();
      setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
      // Default due date: 10th of current month
      setDueDate(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-10`
      );
    }
  }, [open]);

  function toggleClass(classId: string) {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  }

  function selectAll() {
    if (selectedClassIds.length === classes.length) {
      setSelectedClassIds([]);
    } else {
      setSelectedClassIds(classes.map((c) => c.id));
    }
  }

  const selectedClasses = classes.filter((c) => selectedClassIds.includes(c.id));
  const totalStudents = selectedClasses.reduce(
    (sum, c) => sum + c._count.enrollments,
    0
  );
  const totalAmount = selectedClasses.reduce(
    (sum, c) => sum + c.fee * c._count.enrollments,
    0
  );

  async function handleSubmit() {
    if (selectedClassIds.length === 0) {
      toast.error("반을 선택해주세요.");
      return;
    }
    if (!dueDate) {
      toast.error("납부 기한을 선택해주세요.");
      return;
    }

    startTransition(async () => {
      const result = await bulkCreateInvoices(selectedClassIds, month, dueDate);
      if (result.success) {
        toast.success(`${result.count}건의 청구서가 생성되었습니다.`);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "오류가 발생했습니다.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-5 text-[#3B82F6]" />
            일괄 청구서 생성
          </DialogTitle>
          <DialogDescription>
            선택한 반의 재원생에게 자동으로 청구서를 생성합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Month */}
          <div className="space-y-1.5">
            <Label>청구 월</Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>

          {/* Due Date */}
          <div className="space-y-1.5">
            <Label>납부 기한</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {/* Class Selection */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>반 선택</Label>
              <button
                className="text-xs text-[#3B82F6] hover:underline"
                onClick={selectAll}
              >
                {selectedClassIds.length === classes.length ? "전체 해제" : "전체 선택"}
              </button>
            </div>

            {classes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#D5D8DC] py-8 text-center">
                <p className="text-sm text-[#8B95A1]">등록된 반이 없습니다.</p>
              </div>
            ) : (
              <div className="max-h-[240px] space-y-1 overflow-y-auto rounded-lg border p-2">
                {classes.map((cls) => (
                  <label
                    key={cls.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-[#F8F9FA]"
                  >
                    <Checkbox
                      checked={selectedClassIds.includes(cls.id)}
                      onCheckedChange={() => toggleClass(cls.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#191F28]">{cls.name}</p>
                      <p className="text-xs text-[#8B95A1]">
                        월 수강료: {formatCurrency(cls.fee)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-[#8B95A1]">
                      <Users className="size-3" />
                      {cls._count.enrollments}명
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          {selectedClassIds.length > 0 && (
            <div className="rounded-lg bg-[#EFF6FF] px-4 py-3">
              <p className="text-sm font-medium text-[#3B82F6]">미리보기</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="text-[#4E5968]">
                  대상 학생 수: <strong>{totalStudents}명</strong>
                </div>
                <div className="text-[#4E5968]">
                  총 청구 금액: <strong>{formatCurrency(totalAmount)}</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || selectedClassIds.length === 0}
            className="bg-[#3B82F6] hover:bg-[#2563EB]"
          >
            {isPending ? "생성 중..." : `일괄 생성 (${totalStudents}건)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
