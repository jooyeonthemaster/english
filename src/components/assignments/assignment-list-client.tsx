"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  Plus,
  Search,
  FileText,
  Calendar,
  ChevronRight,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SubmissionSummary {
  id: string;
  status: string;
}

interface AssignmentItem {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | Date;
  maxScore: number | null;
  targetType: string;
  class: { id: string; name: string } | null;
  submissions: SubmissionSummary[];
  totalStudents: number;
  submittedCount: number;
  isOverdue: boolean;
}

interface ClassOption {
  id: string;
  name: string;
}

interface Props {
  assignments: AssignmentItem[];
  classes: ClassOption[];
  onCreateClick?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AssignmentListClient({ assignments, classes, onCreateClick }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");

  const filtered = assignments.filter((a) => {
    if (search && !a.title.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (statusFilter === "ACTIVE" && a.isOverdue) return false;
    if (statusFilter === "OVERDUE" && !a.isOverdue) return false;
    if (classFilter !== "ALL" && a.class?.id !== classFilter) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-50">
            <FileText className="size-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#191F28]">과제 관리</h1>
            <p className="text-sm text-[#8B95A1]">
              과제 등록, 제출 현황 및 채점
            </p>
          </div>
        </div>
        <Button
          onClick={onCreateClick}
          className="bg-[#3182F6] hover:bg-[#1B64DA]"
        >
          <Plus className="size-4 mr-1.5" />
          과제 등록
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8B95A1]" />
          <Input
            placeholder="과제명 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white border-[#E5E8EB]"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] bg-white border-[#E5E8EB]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체</SelectItem>
            <SelectItem value="ACTIVE">진행중</SelectItem>
            <SelectItem value="OVERDUE">마감</SelectItem>
          </SelectContent>
        </Select>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-[150px] bg-white border-[#E5E8EB]">
            <SelectValue placeholder="반" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 반</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#E5E8EB] bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                과제명
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                반
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                마감일
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                제출 현황
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs">
                상태
              </TableHead>
              <TableHead className="text-[#6B7684] font-semibold text-xs w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-12 text-[#8B95A1]"
                >
                  {assignments.length === 0
                    ? "등록된 과제가 없습니다."
                    : "검색 결과가 없습니다."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => {
                const rate =
                  a.totalStudents > 0
                    ? Math.round(
                        (a.submittedCount / a.totalStudents) * 100
                      )
                    : 0;
                return (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer hover:bg-[#F7F8FA]"
                    onClick={() =>
                      router.push(`/director/assignments/${a.id}`)
                    }
                  >
                    <TableCell className="font-medium text-[#191F28]">
                      {a.title}
                    </TableCell>
                    <TableCell className="text-[#4E5968]">
                      {a.class?.name || "전체"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="size-3.5 text-[#8B95A1]" />
                        <span
                          className={cn(
                            "text-sm",
                            a.isOverdue
                              ? "text-red-500 font-medium"
                              : "text-[#4E5968]"
                          )}
                        >
                          {formatDate(a.dueDate)}
                          {a.isOverdue && " (마감)"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <Progress value={rate} className="h-2 flex-1" />
                        <span className="text-xs text-[#8B95A1] min-w-[48px]">
                          {a.submittedCount}/{a.totalStudents}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                          a.isOverdue
                            ? "bg-red-100 text-red-600"
                            : "bg-emerald-100 text-emerald-700"
                        )}
                      >
                        {a.isOverdue ? "마감" : "진행중"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-[#8B95A1]" />
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
