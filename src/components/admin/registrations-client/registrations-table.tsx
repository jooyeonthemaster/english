"use client";

import { Check, X, Filter, Building2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STATUS_CONFIG, getDistrict } from "./constants";
import type { Registration } from "./types";

interface RegistrationsTableProps {
  rows: Registration[];
  onApproveClick: (reg: Registration) => void;
  onRejectClick: (reg: Registration) => void;
}

export function RegistrationsTable({
  rows,
  onApproveClick,
  onRejectClick,
}: RegistrationsTableProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-[12px] text-gray-400 font-medium h-10 pl-5">
              학원명
            </TableHead>
            <TableHead className="text-[12px] text-gray-400 font-medium h-10">
              원장
            </TableHead>
            <TableHead className="text-[12px] text-gray-400 font-medium h-10">
              구
            </TableHead>
            <TableHead className="text-[12px] text-gray-400 font-medium h-10">
              이메일
            </TableHead>
            <TableHead className="text-[12px] text-gray-400 font-medium h-10">
              전화번호
            </TableHead>
            <TableHead className="text-[12px] text-gray-400 font-medium h-10">
              희망 요금제
            </TableHead>
            <TableHead className="text-[12px] text-gray-400 font-medium h-10">
              상태
            </TableHead>
            <TableHead className="text-[12px] text-gray-400 font-medium h-10">
              날짜
            </TableHead>
            <TableHead className="text-[12px] text-gray-400 font-medium h-10 pr-5 text-right">
              작업
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={9}
                className="text-center text-[13px] text-gray-400 py-16"
              >
                <div className="flex flex-col items-center gap-2">
                  <Filter className="size-8 text-gray-200" strokeWidth={1.5} />
                  <span>가입 신청이 없습니다</span>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((reg) => {
              const sc = STATUS_CONFIG[reg.status] || STATUS_CONFIG.PENDING;
              return (
                <TableRow key={reg.id} className="hover:bg-gray-50/50">
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100">
                        <Building2
                          className="size-4 text-slate-500"
                          strokeWidth={1.7}
                        />
                      </div>
                      <span className="text-[13px] font-medium text-gray-800">
                        {reg.academyName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[13px] text-gray-600">
                    {reg.directorName}
                  </TableCell>
                  <TableCell className="text-[12px]">
                    {(() => {
                      const d = getDistrict(reg);
                      return d ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1d4ed8] text-[11px] font-semibold">
                          <span className="w-1 h-1 rounded-full bg-[#3B82F6]" />
                          {d}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-[12px] text-gray-500">
                    {reg.directorEmail}
                  </TableCell>
                  <TableCell className="text-[12px] text-gray-500">
                    {reg.phone}
                  </TableCell>
                  <TableCell className="text-[12px] text-gray-500">
                    {reg.desiredPlan || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[11px] px-2 ${sc.className}`}
                    >
                      {sc.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[12px] text-gray-400">
                    {formatDateTime(reg.createdAt)}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    {reg.status === "PENDING" && (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => onApproveClick(reg)}
                        >
                          <Check className="size-3.5" />
                          승인
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => onRejectClick(reg)}
                        >
                          <X className="size-3.5" />
                          거절
                        </Button>
                      </div>
                    )}
                    {reg.status === "APPROVED" && reg.reviewedBy && (
                      <span className="text-[11px] text-gray-400">
                        처리: {reg.reviewedBy.name}
                      </span>
                    )}
                    {reg.status === "REJECTED" && reg.reviewNote && (
                      <span
                        className="text-[11px] text-gray-400 truncate max-w-[120px] inline-block"
                        title={reg.reviewNote}
                      >
                        {reg.reviewNote}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
