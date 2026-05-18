// @ts-nocheck
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreditCard } from "lucide-react";
import { getInvoiceBadge } from "./student-detail-helpers";

interface StudentDetailBillingTabProps {
  stats: any;
}

export function StudentDetailBillingTab({
  stats,
}: StudentDetailBillingTabProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
          <CreditCard className="size-4 text-blue-500" />
          수납 이력
        </CardTitle>
      </CardHeader>
      <CardContent>
        {stats.invoices.length === 0 ? (
          <p className="text-sm text-[#8B95A1] py-8 text-center">
            수납 기록이 없습니다.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
                <TableHead>항목</TableHead>
                <TableHead className="w-[110px]">금액</TableHead>
                <TableHead className="w-[110px]">할인</TableHead>
                <TableHead className="w-[110px]">결제액</TableHead>
                <TableHead className="w-[80px]">상태</TableHead>
                <TableHead className="w-[100px]">납부기한</TableHead>
                <TableHead className="w-[100px]">납부일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.invoices.map((inv: any) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium text-[#191F28]">
                    {inv.title}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatCurrency(inv.amount)}
                  </TableCell>
                  <TableCell className="text-sm text-[#8B95A1]">
                    {inv.discount > 0
                      ? `-${formatCurrency(inv.discount)}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {formatCurrency(inv.finalAmount)}
                  </TableCell>
                  <TableCell>{getInvoiceBadge(inv.status)}</TableCell>
                  <TableCell className="text-xs text-[#8B95A1]">
                    {formatDate(inv.dueDate)}
                  </TableCell>
                  <TableCell className="text-xs text-[#8B95A1]">
                    {inv.paidDate ? formatDate(inv.paidDate) : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
