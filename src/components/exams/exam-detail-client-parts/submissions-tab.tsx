"use client";

import { Users } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SUB_STATUS_LABELS } from "./constants";
import type { Submission } from "./types";

// ---------------------------------------------------------------------------
// 응시 현황 탭
// ---------------------------------------------------------------------------

export function SubmissionsTab({ submissions }: { submissions: Submission[] }) {
  return (
    <div className="rounded-xl border border-[#E5E8EB] bg-white overflow-hidden">
      {submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#8B95A1]">
          <Users className="size-12 mb-3 opacity-40" />
          <p className="text-sm">아직 응시한 학생이 없습니다.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
              <TableHead className="text-[#6B7684] font-semibold text-xs">학생</TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">상태</TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">점수</TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">응시 시작</TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">제출 시간</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.map((sub) => (
              <TableRow key={sub.id}>
                <TableCell className="font-medium text-[#191F28]">{sub.student.name}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      sub.status === "GRADED"
                        ? "bg-emerald-100 text-emerald-700"
                        : sub.status === "SUBMITTED"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700",
                    )}
                  >
                    {SUB_STATUS_LABELS[sub.status] || sub.status}
                  </span>
                </TableCell>
                <TableCell className="text-[#4E5968]">
                  {sub.score != null
                    ? `${sub.score}/${sub.maxScore} (${Math.round(sub.percent || 0)}%)`
                    : "-"}
                </TableCell>
                <TableCell className="text-[#8B95A1] text-sm">
                  {formatDateTime(sub.startedAt)}
                </TableCell>
                <TableCell className="text-[#8B95A1] text-sm">
                  {sub.submittedAt ? formatDateTime(sub.submittedAt) : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
