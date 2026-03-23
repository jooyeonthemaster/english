"use client";

import React, { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CreditCard,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
  Search,
  FileText,
  Bell,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { INVOICE_STATUSES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvoiceFormDialog } from "@/components/billing/invoice-form-dialog";
import { BulkInvoiceDialog } from "@/components/billing/bulk-invoice-dialog";
import { PaymentDialog } from "@/components/billing/payment-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Invoice {
  id: string;
  title: string;
  amount: number;
  discount: number;
  finalAmount: number;
  dueDate: string | Date;
  paidDate: string | Date | null;
  status: string;
  memo: string | null;
  student: { id: string; name: string; grade: number; phone: string | null };
  payments: { id: string; amount: number; method: string; paidAt: string | Date }[];
}

interface OverdueInvoice extends Invoice {
  remaining: number;
  daysOverdue: number;
}

interface BillingSummary {
  totalBilled: number;
  totalCollected: number;
  collectionRate: number;
  outstanding: number;
  refunded: number;
  invoiceCount: number;
  paidCount: number;
  pendingCount: number;
}

interface Props {
  invoices: Invoice[];
  total: number;
  page: number;
  totalPages: number;
  summary: BillingSummary;
  overdueList: OverdueInvoice[];
  currentMonth: string;
  currentStatus: string;
  currentSearch: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BillingDashboardClient({
  invoices,
  total,
  page,
  totalPages,
  summary,
  overdueList,
  currentMonth,
  currentStatus,
  currentSearch,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(currentSearch);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "ALL") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    startTransition(() => {
      router.push(`/director/billing?${params.toString()}`);
    });
  }

  function handleSearch() {
    updateFilter("search", searchValue);
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    startTransition(() => {
      router.push(`/director/billing?${params.toString()}`);
    });
  }

  function getStatusBadge(status: string) {
    const found = INVOICE_STATUSES.find((s) => s.value === status);
    if (!found) return <Badge variant="secondary">{status}</Badge>;
    return (
      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", found.color)}>
        {found.label}
      </span>
    );
  }

  function openPaymentDialog(invoice: Invoice) {
    setSelectedInvoice(invoice);
    setPaymentDialogOpen(true);
  }

  // Generate month options (current month and 11 months back)
  const monthOptions: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    monthOptions.push({ value: val, label });
  }

  const kpiCards = [
    {
      label: "이번 달 청구액",
      value: formatCurrency(summary.totalBilled),
      sub: `${summary.invoiceCount}건`,
      icon: CreditCard,
      color: "#3B82F6",
      bgColor: "#EFF6FF",
    },
    {
      label: "수납 완료",
      value: formatCurrency(summary.totalCollected),
      sub: `${Math.round(summary.collectionRate)}%`,
      icon: CheckCircle,
      color: "#10B981",
      bgColor: "#ECFDF5",
    },
    {
      label: "미납금",
      value: formatCurrency(summary.outstanding),
      sub: `${summary.pendingCount}건`,
      icon: AlertTriangle,
      color: "#EF4444",
      bgColor: "#FEF2F2",
    },
    {
      label: "환불/취소",
      value: formatCurrency(summary.refunded),
      sub: "",
      icon: RefreshCw,
      color: "#6B7280",
      bgColor: "#F9FAFB",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold text-[#191F28]">수납 관리</h1>
          <p className="mt-1 text-[14px] text-[#8B95A1]">
            청구서 생성, 수납 처리, 미납 관리를 한 곳에서 관리하세요.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkDialogOpen(true)}
            className="gap-1.5"
          >
            <Layers className="size-4" />
            일괄 청구
          </Button>
          <Button
            size="sm"
            onClick={() => setInvoiceDialogOpen(true)}
            className="gap-1.5 bg-[#3B82F6] hover:bg-[#2563EB]"
          >
            <Plus className="size-4" />
            청구서 생성
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="flex flex-col gap-3 rounded-xl border border-[#F2F4F6] bg-white p-5"
            >
              <div
                className="flex size-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: card.bgColor }}
              >
                <Icon className="size-5" style={{ color: card.color }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#191F28]">{card.value}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <p className="text-sm text-[#8B95A1]">{card.label}</p>
                  {card.sub && (
                    <span className="text-xs font-medium text-[#3B82F6]">{card.sub}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="flex gap-6">
        {/* Left: Invoice Table */}
        <div className="flex-1 rounded-xl border border-[#F2F4F6] bg-white">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 border-b border-[#F2F4F6] p-4">
            <Select value={currentMonth} onValueChange={(v) => updateFilter("month", v)}>
              <SelectTrigger className="w-[160px]">
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

            <Select value={currentStatus} onValueChange={(v) => updateFilter("status", v)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 상태</SelectItem>
                {INVOICE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#ADB5BD]" />
              <Input
                placeholder="학생 이름으로 검색"
                className="pl-9"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
          </div>

          {/* Table */}
          <div className={cn("transition-opacity", isPending && "opacity-50")}>
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F8F9FA]">
                  <TableHead className="pl-4">학생명</TableHead>
                  <TableHead>청구 내역</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="text-right">할인</TableHead>
                  <TableHead className="text-right">최종 금액</TableHead>
                  <TableHead>납부일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right pr-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-[#8B95A1]">
                        <FileText className="size-8 text-[#ADB5BD]" />
                        <p className="text-sm">청구서가 없습니다.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice) => (
                    <TableRow key={invoice.id} className="cursor-pointer hover:bg-[#F8F9FA]">
                      <TableCell className="pl-4 font-medium text-[#191F28]">
                        {invoice.student.name}
                        <span className="ml-1 text-xs text-[#8B95A1]">
                          {invoice.student.grade}학년
                        </span>
                      </TableCell>
                      <TableCell className="text-[#4E5968]">{invoice.title}</TableCell>
                      <TableCell className="text-right text-[#4E5968]">
                        {formatCurrency(invoice.amount)}
                      </TableCell>
                      <TableCell className="text-right text-[#8B95A1]">
                        {invoice.discount > 0 ? `-${formatCurrency(invoice.discount)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-[#191F28]">
                        {formatCurrency(invoice.finalAmount)}
                      </TableCell>
                      <TableCell className="text-[#8B95A1]">
                        {invoice.paidDate ? formatDate(invoice.paidDate) : "-"}
                      </TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell className="text-right pr-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="size-8 p-0">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => router.push(`/director/billing/${invoice.id}`)}
                            >
                              <FileText className="mr-2 size-4" />
                              상세 보기
                            </DropdownMenuItem>
                            {["PENDING", "PARTIAL", "OVERDUE"].includes(invoice.status) && (
                              <DropdownMenuItem onClick={() => openPaymentDialog(invoice)}>
                                <CreditCard className="mr-2 size-4" />
                                수납 처리
                              </DropdownMenuItem>
                            )}
                            {["PENDING", "OVERDUE"].includes(invoice.status) && (
                              <DropdownMenuItem>
                                <Bell className="mr-2 size-4" />
                                알림 발송
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#F2F4F6] px-4 py-3">
              <p className="text-sm text-[#8B95A1]">
                총 {total}건 중 {(page - 1) * 20 + 1}-{Math.min(page * 20, total)}건
              </p>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "ghost"}
                      size="sm"
                      className={cn(
                        "min-w-8",
                        p === page && "bg-[#3B82F6] hover:bg-[#2563EB]"
                      )}
                      onClick={() => goToPage(p)}
                    >
                      {p}
                    </Button>
                  );
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Overdue Sidebar */}
        <div className="hidden w-[340px] shrink-0 xl:block">
          <div className="rounded-xl border border-[#F2F4F6] bg-white">
            <div className="flex items-center gap-2 border-b border-[#F2F4F6] px-4 py-3">
              <AlertTriangle className="size-4 text-red-500" />
              <h3 className="text-[15px] font-semibold text-[#191F28]">미납자 알림</h3>
              {overdueList.length > 0 && (
                <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  {overdueList.length}명
                </span>
              )}
            </div>

            <div className="max-h-[600px] overflow-y-auto">
              {overdueList.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-[#8B95A1]">
                  <CheckCircle className="size-8 text-emerald-400" />
                  <p className="text-sm">미납자가 없습니다</p>
                </div>
              ) : (
                <div className="divide-y divide-[#F2F4F6]">
                  {overdueList.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-[#191F28]">
                          {item.student.name}
                          <span className="ml-1 text-xs text-[#8B95A1]">
                            {item.student.grade}학년
                          </span>
                        </p>
                        <p className="text-sm font-semibold text-red-600">
                          {formatCurrency(item.remaining)}
                        </p>
                        <p className="text-xs text-[#ADB5BD]">
                          {item.daysOverdue}일 연체
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-xs"
                      >
                        <Bell className="mr-1 size-3" />
                        알림 발송
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <InvoiceFormDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
      />
      <BulkInvoiceDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
      />
      {selectedInvoice && (
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          invoice={selectedInvoice}
        />
      )}
    </div>
  );
}
