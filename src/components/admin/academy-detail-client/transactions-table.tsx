"use client";

import { Clock, TrendingDown, TrendingUp } from "lucide-react";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TX_TYPE_CONFIG, type AcademyDetailData } from "./types";

type TxRow = AcademyDetailData["recentTransactions"][number];

export function TransactionsTable({ transactions }: { transactions: TxRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 lg:col-span-2">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
        <Clock className="size-4 text-gray-400" strokeWidth={1.8} />
        <h3 className="text-[14px] font-semibold text-gray-800">
          최근 크레딧 거래 내역
        </h3>
      </div>
      <div className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[12px] text-gray-400 font-medium h-9 pl-5">
                유형
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-9">
                금액
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-9">
                잔액
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-9">
                설명
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-9 pr-5">
                날짜
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-[13px] text-gray-400 py-8"
                >
                  거래 내역이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              transactions.slice(0, 20).map((tx) => {
                const tc =
                  TX_TYPE_CONFIG[tx.type] || TX_TYPE_CONFIG.ADJUSTMENT;
                return (
                  <TableRow key={tx.id} className="hover:bg-gray-50/50">
                    <TableCell className="pl-5">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 border-0 bg-gray-50 ${tc.className}`}
                      >
                        {tc.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {tx.amount > 0 ? (
                          <TrendingUp className="size-3 text-emerald-500" />
                        ) : (
                          <TrendingDown className="size-3 text-red-400" />
                        )}
                        <span
                          className={cn(
                            "text-[13px] font-medium",
                            tx.amount > 0
                              ? "text-emerald-600"
                              : "text-red-500",
                          )}
                        >
                          {tx.amount > 0 ? "+" : ""}
                          {formatNumber(tx.amount)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[13px] text-gray-600">
                      {formatNumber(tx.balanceAfter)}
                    </TableCell>
                    <TableCell className="text-[12px] text-gray-500 max-w-[200px] truncate">
                      {tx.description || "-"}
                    </TableCell>
                    <TableCell className="text-[12px] text-gray-400 pr-5">
                      {formatDateTime(tx.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
