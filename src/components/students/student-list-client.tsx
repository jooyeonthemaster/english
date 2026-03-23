// @ts-nocheck
"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { STUDENT_STATUSES, GRADES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  Eye,
  Pencil,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Users,
  UserCheck,
  UserX,
} from "lucide-react";
import { bulkUpdateStudentStatus } from "@/actions/students";
import { StudentFormDialog } from "@/components/students/student-form-dialog";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types — use `any` for Prisma data to avoid serialization mismatches
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */

interface Filters {
  page: number;
  status: string;
  schoolId?: string;
  grade?: number;
  search?: string;
}

interface StudentListClientProps {
  studentsData: any;
  schools: any[];
  filters: Filters;
  isDirector: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function StudentListClient({
  studentsData,
  schools,
  filters,
  isDirector,
}: StudentListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchValue, setSearchValue] = useState(filters.search ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any | null>(null);

  const basePath = isDirector ? "/director/students" : "/teacher/students";

  // ------- URL param helpers -------
  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (val && val !== "ALL" && val !== "") {
        params.set(key, val);
      } else {
        params.delete(key);
      }
    }
    // Reset page when changing filters
    if (!updates.page) params.delete("page");
    startTransition(() => {
      router.push(`${basePath}?${params.toString()}`);
    });
  }

  function handleSearch() {
    updateParams({ search: searchValue || undefined });
  }

  // ------- Selection helpers -------
  function toggleSelectAll() {
    if (selectedIds.size === studentsData.students.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(studentsData.students.map((s: any) => s.id)));
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  // ------- Bulk actions -------
  async function handleBulkStatus(status: string) {
    if (selectedIds.size === 0) return;
    const result = await bulkUpdateStudentStatus(
      Array.from(selectedIds),
      status
    );
    if (result.success) {
      toast.success("상태가 변경되었습니다.");
      setSelectedIds(new Set());
      router.refresh();
    } else {
      toast.error(result.error || "오류가 발생했습니다.");
    }
  }

  // ------- Status badge -------
  function getStatusBadge(status: string) {
    const found = STUDENT_STATUSES.find((s) => s.value === status);
    if (!found) return <Badge variant="secondary">{status}</Badge>;
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
          found.color
        )}
      >
        {found.label}
      </span>
    );
  }

  const allSelected =
    studentsData.students.length > 0 &&
    selectedIds.size === studentsData.students.length;

  return (
    <div className="flex flex-col h-full">
      {/* ===== Top Bar ===== */}
      <div className="border-b border-[#F2F4F6] bg-white px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="size-6 text-[#3182F6]" />
            <h1 className="text-xl font-bold text-[#191F28]">학생 관리</h1>
            <span className="text-sm text-[#8B95A1]">
              총 {studentsData.total}명
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8B95A1]" />
              <Input
                placeholder="이름 또는 학생코드 검색"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-64 pl-9 h-9 text-sm"
              />
            </div>
            {isDirector && (
              <Button
                onClick={() => {
                  setEditingStudent(null);
                  setDialogOpen(true);
                }}
                className="bg-[#3182F6] hover:bg-[#1B64DA] text-white h-9 px-4 text-sm"
              >
                <Plus className="size-4 mr-1.5" />
                학생 등록
              </Button>
            )}
          </div>
        </div>

        {/* ===== Filters Row ===== */}
        <div className="flex items-center gap-3 mt-4">
          {/* Status filter */}
          <div className="flex items-center gap-1">
            {[{ value: "ALL", label: "전체" }, ...STUDENT_STATUSES].map(
              (status) => (
                <button
                  key={status.value}
                  onClick={() => updateParams({ status: status.value })}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    filters.status === status.value
                      ? "bg-[#191F28] text-white"
                      : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB]"
                  )}
                >
                  {status.label}
                </button>
              )
            )}
          </div>

          <div className="h-5 w-px bg-[#E5E8EB]" />

          {/* School filter */}
          <Select
            value={filters.schoolId || "ALL"}
            onValueChange={(val) =>
              updateParams({ schoolId: val === "ALL" ? undefined : val })
            }
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="학교 전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">학교 전체</SelectItem>
              {schools.map((school) => (
                <SelectItem key={school.id} value={school.id}>
                  {school.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Grade filter */}
          <Select
            value={filters.grade?.toString() || "ALL"}
            onValueChange={(val) =>
              updateParams({ grade: val === "ALL" ? undefined : val })
            }
          >
            <SelectTrigger className="h-8 w-[100px] text-xs">
              <SelectValue placeholder="학년 전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">학년 전체</SelectItem>
              {GRADES.map((g) => (
                <SelectItem key={g.value} value={g.value.toString()}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Bulk Actions */}
          {isDirector && selectedIds.size > 0 && (
            <>
              <div className="h-5 w-px bg-[#E5E8EB]" />
              <span className="text-xs text-[#3182F6] font-medium">
                {selectedIds.size}명 선택
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs">
                    상태 변경
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleBulkStatus("ACTIVE")}>
                    <UserCheck className="size-4 mr-2 text-emerald-600" />
                    재원으로 변경
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkStatus("PAUSED")}>
                    <UserX className="size-4 mr-2 text-amber-600" />
                    휴원으로 변경
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkStatus("WITHDRAWN")}>
                    <UserX className="size-4 mr-2 text-gray-500" />
                    퇴원으로 변경
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* ===== Data Table ===== */}
      <div className="flex-1 overflow-auto px-8 py-4">
        <div className="rounded-lg border border-[#F2F4F6] bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
                {isDirector && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="전체 선택"
                    />
                  </TableHead>
                )}
                <TableHead className="min-w-[140px]">이름</TableHead>
                <TableHead className="w-[100px]">학생코드</TableHead>
                <TableHead className="w-[100px]">학교</TableHead>
                <TableHead className="w-[70px]">학년</TableHead>
                <TableHead className="min-w-[120px]">반</TableHead>
                <TableHead className="w-[70px]">상태</TableHead>
                <TableHead className="w-[100px]">입학일</TableHead>
                <TableHead className="w-[70px]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentsData.students.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isDirector ? 9 : 8}
                    className="h-40 text-center text-sm text-[#8B95A1]"
                  >
                    등록된 학생이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                studentsData.students.map((student: any) => (
                  <TableRow
                    key={student.id}
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedIds.has(student.id) && "bg-blue-50/50"
                    )}
                    onClick={() => router.push(`${basePath}/${student.id}`)}
                  >
                    {isDirector && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(student.id)}
                          onCheckedChange={() => toggleSelect(student.id)}
                          aria-label={`${student.name} 선택`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#E8F3FF] text-xs font-semibold text-[#3182F6]">
                          {getInitials(student.name)}
                        </div>
                        <span className="font-medium text-[#191F28]">
                          {student.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs font-mono text-[#6B7684] bg-[#F7F8FA] px-1.5 py-0.5 rounded">
                        {student.studentCode}
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-[#4E5968]">
                      {student.school?.name ?? "-"}
                    </TableCell>
                    <TableCell className="text-sm text-[#4E5968]">
                      {student.grade}학년
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {student.classEnrollments.length > 0 ? (
                          student.classEnrollments.map((ce) => (
                            <span
                              key={ce.class.id}
                              className="inline-flex items-center rounded-md bg-[#F2F4F6] px-2 py-0.5 text-xs font-medium text-[#4E5968]"
                            >
                              {ce.class.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-[#AEB5BC]">미배정</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(student.status)}</TableCell>
                    <TableCell className="text-xs text-[#8B95A1]">
                      {formatDate(student.enrollDate)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`${basePath}/${student.id}`}>
                              <Eye className="size-4 mr-2" />
                              상세보기
                            </Link>
                          </DropdownMenuItem>
                          {isDirector && (
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingStudent(student);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="size-4 mr-2" />
                              수정
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

        {/* ===== Pagination ===== */}
        {studentsData.totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-[#8B95A1]">
              {(studentsData.page - 1) * studentsData.pageSize + 1} -{" "}
              {Math.min(
                studentsData.page * studentsData.pageSize,
                studentsData.total
              )}{" "}
              / {studentsData.total}건
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={studentsData.page <= 1}
                onClick={() =>
                  updateParams({
                    page: (studentsData.page - 1).toString(),
                    status: filters.status,
                    schoolId: filters.schoolId,
                    grade: filters.grade?.toString(),
                    search: filters.search,
                  })
                }
              >
                <ChevronLeft className="size-4" />
              </Button>
              {Array.from({ length: Math.min(studentsData.totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (studentsData.totalPages <= 7) {
                  pageNum = i + 1;
                } else if (studentsData.page <= 4) {
                  pageNum = i + 1;
                } else if (studentsData.page >= studentsData.totalPages - 3) {
                  pageNum = studentsData.totalPages - 6 + i;
                } else {
                  pageNum = studentsData.page - 3 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={pageNum === studentsData.page ? "default" : "outline"}
                    size="icon"
                    className={cn(
                      "size-8 text-xs",
                      pageNum === studentsData.page &&
                        "bg-[#191F28] text-white hover:bg-[#333D4B]"
                    )}
                    onClick={() =>
                      updateParams({
                        page: pageNum.toString(),
                        status: filters.status,
                        schoolId: filters.schoolId,
                        grade: filters.grade?.toString(),
                        search: filters.search,
                      })
                    }
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                disabled={studentsData.page >= studentsData.totalPages}
                onClick={() =>
                  updateParams({
                    page: (studentsData.page + 1).toString(),
                    status: filters.status,
                    schoolId: filters.schoolId,
                    grade: filters.grade?.toString(),
                    search: filters.search,
                  })
                }
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ===== Student Form Dialog ===== */}
      {isDirector && (
        <StudentFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          student={editingStudent}
          schools={schools}
        />
      )}
    </div>
  );
}
