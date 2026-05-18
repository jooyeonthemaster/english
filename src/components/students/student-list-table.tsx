// @ts-nocheck
"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { STUDENT_STATUSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Eye, MoreHorizontal, Pencil } from "lucide-react";

interface StudentListTableProps {
  students: any[];
  isDirector: boolean;
  selectedIds: Set<string>;
  basePath: string;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEdit: (student: any) => void;
}

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

export function StudentListTable({
  students,
  isDirector,
  selectedIds,
  basePath,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
}: StudentListTableProps) {
  const router = useRouter();
  const allSelected =
    students.length > 0 && selectedIds.size === students.length;

  return (
    <div className="rounded-lg border border-[#F2F4F6] bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
            {isDirector && (
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={onToggleSelectAll}
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
          {students.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={isDirector ? 9 : 8}
                className="h-40 text-center text-sm text-[#8B95A1]"
              >
                등록된 학생이 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            students.map((student: any) => (
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
                      onCheckedChange={() => onToggleSelect(student.id)}
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
                      <Button variant="ghost" size="icon" className="size-8">
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
                        <DropdownMenuItem onClick={() => onEdit(student)}>
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
  );
}
