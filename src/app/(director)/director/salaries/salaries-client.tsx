"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Wallet,
  Settings,
  CheckCircle,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { STAFF_ROLES } from "@/lib/constants";
import { updateSalary, markSalaryPaid, bulkMarkSalariesPaid } from "@/actions/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SalaryRecord {
  id: string;
  basePay: number;
  bonus: number;
  deductions: number;
  totalPay: number;
  paidAt: string | Date | null;
  memo: string | null;
}

interface StaffSalary {
  staffId: string;
  name: string;
  role: string;
  salary: SalaryRecord | null;
}

interface Props {
  salaryData: StaffSalary[];
  currentMonth: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SalariesClient({ salaryData, currentMonth }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffSalary | null>(null);

  // Edit form state
  const [basePay, setBasePay] = useState("");
  const [bonus, setBonus] = useState("");
  const [deductions, setDeductions] = useState("");
  const [memo, setMemo] = useState("");

  function getRoleLabel(role: string) {
    return STAFF_ROLES.find((r) => r.value === role)?.label || role;
  }

  function formatAmountInput(value: string) {
    const numOnly = value.replace(/[^0-9]/g, "");
    if (!numOnly) return "";
    return parseInt(numOnly).toLocaleString("ko-KR");
  }

  function navigateMonth(offset: number) {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    startTransition(() => {
      router.push(`/director/salaries?month=${newMonth}`);
    });
  }

  function openEditDialog(staff: StaffSalary) {
    setSelectedStaff(staff);
    setBasePay(staff.salary ? staff.salary.basePay.toLocaleString("ko-KR") : "");
    setBonus(staff.salary?.bonus ? staff.salary.bonus.toLocaleString("ko-KR") : "");
    setDeductions(
      staff.salary?.deductions ? staff.salary.deductions.toLocaleString("ko-KR") : ""
    );
    setMemo(staff.salary?.memo || "");
    setEditDialogOpen(true);
  }

  async function handleSaveSalary() {
    if (!selectedStaff) return;
    const bp = parseInt(basePay.replace(/,/g, "")) || 0;
    if (bp <= 0) {
      toast.error("기본급을 입력해주세요.");
      return;
    }

    startTransition(async () => {
      const result = await updateSalary(selectedStaff.staffId, currentMonth, {
        basePay: bp,
        bonus: parseInt(bonus.replace(/,/g, "")) || 0,
        deductions: parseInt(deductions.replace(/,/g, "")) || 0,
        memo: memo.trim() || undefined,
      });

      if (result.success) {
        toast.success("급여가 저장되었습니다.");
        setEditDialogOpen(false);
        router.refresh();
      } else {
        toast.error(result.error || "오류가 발생했습니다.");
      }
    });
  }

  async function handleMarkPaid(salaryId: string) {
    startTransition(async () => {
      const result = await markSalaryPaid(salaryId);
      if (result.success) {
        toast.success("지급 완료 처리되었습니다.");
        router.refresh();
      } else {
        toast.error(result.error || "오류가 발생했습니다.");
      }
    });
  }

  async function handleBulkPay() {
    if (!confirm("모든 미지급 급여를 일괄 지급 처리하시겠습니까?")) return;

    startTransition(async () => {
      const result = await bulkMarkSalariesPaid(currentMonth);
      if (result.success) {
        toast.success("일괄 지급 처리되었습니다.");
        router.refresh();
      } else {
        toast.error(result.error || "오류가 발생했습니다.");
      }
    });
  }

  const totalPayroll = salaryData.reduce(
    (sum, s) => sum + (s.salary?.totalPay || 0),
    0
  );
  const paidCount = salaryData.filter((s) => s.salary?.paidAt).length;
  const unpaidCount = salaryData.filter(
    (s) => s.salary && !s.salary.paidAt
  ).length;

  const [year, month] = currentMonth.split("-");
  const monthLabel = `${year}년 ${parseInt(month)}월`;

  const numericBasePay = parseInt(basePay.replace(/,/g, "")) || 0;
  const numericBonus = parseInt(bonus.replace(/,/g, "")) || 0;
  const numericDeductions = parseInt(deductions.replace(/,/g, "")) || 0;
  const computedTotal = numericBasePay + numericBonus - numericDeductions;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold text-[#191F28]">급여 관리</h1>
          <p className="mt-1 text-[14px] text-[#8B95A1]">
            직원 급여를 설정하고 지급 상태를 관리하세요.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-[#3B82F6] hover:bg-[#2563EB]"
          onClick={handleBulkPay}
          disabled={isPending || unpaidCount === 0}
        >
          <Wallet className="size-4" />
          일괄 지급
        </Button>
      </div>

      {/* Month Selector + Summary */}
      <div className="grid gap-4 lg:grid-cols-4">
        {/* Month Navigation */}
        <div className="flex items-center gap-3 rounded-xl border border-[#F2F4F6] bg-white px-4 py-5">
          <Button
            variant="ghost"
            size="sm"
            className="size-8 p-0"
            onClick={() => navigateMonth(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="flex-1 text-center text-lg font-bold text-[#191F28]">
            {monthLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="size-8 p-0"
            onClick={() => navigateMonth(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="flex flex-col gap-1 rounded-xl border border-[#F2F4F6] bg-white p-5">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-[#8B95A1]" />
            <span className="text-sm text-[#8B95A1]">직원 수</span>
          </div>
          <p className="text-2xl font-bold text-[#191F28]">{salaryData.length}명</p>
        </div>

        <div className="flex flex-col gap-1 rounded-xl border border-[#F2F4F6] bg-white p-5">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-[#8B95A1]" />
            <span className="text-sm text-[#8B95A1]">총 급여</span>
          </div>
          <p className="text-2xl font-bold text-[#191F28]">{formatCurrency(totalPayroll)}</p>
        </div>

        <div className="flex flex-col gap-1 rounded-xl border border-[#F2F4F6] bg-white p-5">
          <div className="flex items-center gap-2">
            <CheckCircle className="size-4 text-emerald-500" />
            <span className="text-sm text-[#8B95A1]">지급 현황</span>
          </div>
          <p className="text-2xl font-bold text-[#191F28]">
            {paidCount}
            <span className="text-base font-normal text-[#8B95A1]">/{salaryData.length}</span>
          </p>
        </div>
      </div>

      {/* Salary Table */}
      <div className={cn("rounded-xl border border-[#F2F4F6] bg-white transition-opacity", isPending && "opacity-50")}>
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F8F9FA]">
              <TableHead className="pl-4">이름</TableHead>
              <TableHead>직급</TableHead>
              <TableHead className="text-right">기본급</TableHead>
              <TableHead className="text-right">수당</TableHead>
              <TableHead className="text-right">공제</TableHead>
              <TableHead className="text-right">지급액</TableHead>
              <TableHead>지급일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right pr-4"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salaryData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-sm text-[#8B95A1]">
                  등록된 직원이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              salaryData.map((item) => (
                <TableRow key={item.staffId}>
                  <TableCell className="pl-4 font-medium text-[#191F28]">
                    {item.name}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        item.role === "DIRECTOR"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {getRoleLabel(item.role)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-[#4E5968]">
                    {item.salary ? formatCurrency(item.salary.basePay) : "-"}
                  </TableCell>
                  <TableCell className="text-right text-[#4E5968]">
                    {item.salary && item.salary.bonus > 0
                      ? formatCurrency(item.salary.bonus)
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right text-[#8B95A1]">
                    {item.salary && item.salary.deductions > 0
                      ? `-${formatCurrency(item.salary.deductions)}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-[#191F28]">
                    {item.salary ? formatCurrency(item.salary.totalPay) : "-"}
                  </TableCell>
                  <TableCell className="text-[#8B95A1]">
                    {item.salary?.paidAt
                      ? new Date(item.salary.paidAt).toLocaleDateString("ko-KR")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {!item.salary ? (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        미설정
                      </span>
                    ) : item.salary.paidAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <CheckCircle className="size-3" />
                        지급완료
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <Clock className="size-3" />
                        미지급
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => openEditDialog(item)}
                      >
                        <Settings className="mr-1 size-3" />
                        설정
                      </Button>
                      {item.salary && !item.salary.paidAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-emerald-600"
                          onClick={() => handleMarkPaid(item.salary!.id)}
                          disabled={isPending}
                        >
                          <CheckCircle className="mr-1 size-3" />
                          지급
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Salary Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>급여 설정</DialogTitle>
            <DialogDescription>
              {selectedStaff?.name} - {monthLabel}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Base Pay */}
            <div className="space-y-1.5">
              <Label>기본급</Label>
              <div className="relative">
                <Input
                  placeholder="0"
                  className="pr-8 text-right"
                  value={basePay}
                  onChange={(e) => setBasePay(formatAmountInput(e.target.value))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#8B95A1]">
                  원
                </span>
              </div>
            </div>

            {/* Bonus */}
            <div className="space-y-1.5">
              <Label>수당</Label>
              <div className="relative">
                <Input
                  placeholder="0"
                  className="pr-8 text-right"
                  value={bonus}
                  onChange={(e) => setBonus(formatAmountInput(e.target.value))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#8B95A1]">
                  원
                </span>
              </div>
            </div>

            {/* Deductions */}
            <div className="space-y-1.5">
              <Label>공제</Label>
              <div className="relative">
                <Input
                  placeholder="0"
                  className="pr-8 text-right"
                  value={deductions}
                  onChange={(e) => setDeductions(formatAmountInput(e.target.value))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#8B95A1]">
                  원
                </span>
              </div>
            </div>

            {/* Computed Total */}
            <div className="flex items-center justify-between rounded-lg bg-[#F8F9FA] px-4 py-3">
              <span className="text-sm font-medium text-[#4E5968]">지급액</span>
              <span className="text-xl font-bold text-[#191F28]">
                {formatCurrency(computedTotal)}
              </span>
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
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleSaveSalary}
              disabled={isPending}
              className="bg-[#3B82F6] hover:bg-[#2563EB]"
            >
              {isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
