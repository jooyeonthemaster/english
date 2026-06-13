"use client";

import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { cn, getGradeLabel, getInitials } from "@/lib/utils";
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
import { StudentStatusDot } from "./student-status-dot";
import { InlineClassAssignPopover } from "./inline-class-assign-popover";
import { InlineDevicePopover } from "./inline-device-popover";
import { InlineBillingPopover } from "./inline-billing-popover";
import type { HubClass, HubStudent } from "./types";

export function StudentRosterTable({
  students,
  classes,
  selectedIds,
  showBilling,
  onToggleSelect,
  onToggleSelectAll,
  onEditStudent,
  onDeleteStudent,
}: {
  students: HubStudent[];
  classes: HubClass[];
  selectedIds: Set<string>;
  showBilling: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEditStudent: (student: HubStudent) => void;
  onDeleteStudent: (student: HubStudent) => void;
}) {
  const router = useRouter();
  const allSelected = students.length > 0 && selectedIds.size === students.length;

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-[#F2F4F6] bg-[#F7F8FA] hover:bg-[#F7F8FA]">
          <TableHead className="w-10 px-3">
            <Checkbox
              checked={allSelected}
              onCheckedChange={onToggleSelectAll}
              aria-label="전체 선택"
            />
          </TableHead>
          <TableHead className="min-w-[180px] px-3 text-xs font-bold text-[#8B95A1]">학생</TableHead>
          <TableHead className="w-[64px] px-3 text-xs font-bold text-[#8B95A1]">학년</TableHead>
          <TableHead className="w-[120px] px-3 text-xs font-bold text-[#8B95A1]">학교</TableHead>
          <TableHead className="w-[88px] px-3 text-xs font-bold text-[#8B95A1]">상태</TableHead>
          <TableHead className="min-w-[160px] px-3 text-xs font-bold text-[#8B95A1]">소속 반</TableHead>
          {showBilling && (
            <TableHead className="w-[140px] px-3 text-xs font-bold text-[#8B95A1]">원비</TableHead>
          )}
          <TableHead className="w-[88px] px-3 text-xs font-bold text-[#8B95A1]">기기</TableHead>
          <TableHead className="w-[48px] px-3">
            <span className="sr-only">작업</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student) => {
          const enrolled = student.classEnrollments.map((e) => e.class);
          const enrolledIds = enrolled.map((c) => c.id);
          const selected = selectedIds.has(student.id);
          return (
            <TableRow
              key={student.id}
              role="button"
              tabIndex={0}
              aria-label={`${student.name} 상세 보기`}
              onClick={() => router.push(`/director/students/${student.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/director/students/${student.id}`);
                }
              }}
              className={cn(
                "group h-12 cursor-pointer border-[#F2F4F6] transition-colors hover:bg-[#F9FAFB]",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500",
                selected && "bg-blue-50/50",
              )}
            >
              <TableCell className="px-3" onClick={stop}>
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => onToggleSelect(student.id)}
                  aria-label={`${student.name} 선택`}
                />
              </TableCell>

              <TableCell className="px-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#E8F3FF] text-xs font-bold text-[#3182F6]">
                    {getInitials(student.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#191F28]">{student.name}</p>
                    <span className="inline-block rounded bg-[#F7F8FA] px-1.5 py-0.5 font-mono text-[10px] text-[#8B95A1]">
                      {student.studentCode}
                    </span>
                  </div>
                </div>
              </TableCell>

              <TableCell className="px-3 text-sm font-medium text-[#4E5968]">
                {getGradeLabel(student.grade)}
              </TableCell>

              <TableCell className="px-3 text-sm font-medium text-[#4E5968]">
                <span className="block max-w-[112px] truncate">{student.school?.name ?? "-"}</span>
              </TableCell>

              <TableCell className="px-3">
                <StudentStatusDot status={student.status} />
              </TableCell>

              <TableCell className="px-3" onClick={stop}>
                <div className="flex flex-wrap items-center gap-1">
                  {enrolled.length === 0 ? (
                    <span className="text-xs font-medium text-[#AEB5BC]">미배정</span>
                  ) : (
                    <>
                      {enrolled.slice(0, 2).map((c) => (
                        <span
                          key={c.id}
                          className="max-w-[96px] truncate rounded-md bg-[#F2F4F6] px-2 py-0.5 text-[11px] font-bold text-[#4E5968]"
                        >
                          {c.name}
                        </span>
                      ))}
                      {enrolled.length > 2 && (
                        <span className="rounded-md bg-[#F2F4F6] px-1.5 py-0.5 text-[11px] font-bold text-[#8B95A1]">
                          +{enrolled.length - 2}
                        </span>
                      )}
                    </>
                  )}
                  <InlineClassAssignPopover
                    studentId={student.id}
                    studentName={student.name}
                    classes={classes}
                    enrolledClassIds={enrolledIds}
                  />
                </div>
              </TableCell>

              {showBilling && (
                <TableCell className="px-3" onClick={stop}>
                  <InlineBillingPopover
                    studentId={student.id}
                    studentName={student.name}
                    invoices={student.invoices}
                  />
                </TableCell>
              )}

              <TableCell className="px-3" onClick={stop}>
                <InlineDevicePopover
                  studentId={student.id}
                  studentName={student.name}
                  deviceCount={student._count.tutorStudentSessions}
                />
              </TableCell>

              <TableCell className="px-3" onClick={stop}>
                <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`${student.name} 작업`}
                        className="flex size-7 items-center justify-center rounded-md text-[#AEB5BC] transition hover:bg-[#F2F4F6] hover:text-[#4E5968]"
                      >
                        <MoreVertical className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditStudent(student)}>
                        <Pencil className="size-4" />
                        정보 수정
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => onDeleteStudent(student)}>
                        <Trash2 className="size-4" />
                        퇴원 처리
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
