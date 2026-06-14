"use client";

import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { getGradeLabel, getInitials } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
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

/** Mobile (<md) fallback — one card per student. */
export function StudentCardList({
  students,
  classes,
  selectedIds,
  showBilling,
  onToggleSelect,
  onEditStudent,
  onDeleteStudent,
}: {
  students: HubStudent[];
  classes: HubClass[];
  selectedIds: Set<string>;
  showBilling: boolean;
  onToggleSelect: (id: string) => void;
  onEditStudent: (student: HubStudent) => void;
  onDeleteStudent: (student: HubStudent) => void;
}) {
  const router = useRouter();

  return (
    <div className="space-y-2 p-3">
      {students.map((student) => {
        const enrolled = student.classEnrollments.map((e) => e.class);
        return (
          <div
            key={student.id}
            onClick={() => router.push(`/director/students/${student.id}`)}
            className="rounded-xl border border-[#F2F4F6] bg-white p-3 transition active:bg-[#F9FAFB]"
          >
            <div className="flex items-start gap-2.5">
              <div onClick={(e) => e.stopPropagation()} className="pt-1">
                <Checkbox
                  checked={selectedIds.has(student.id)}
                  onCheckedChange={() => onToggleSelect(student.id)}
                  aria-label={`${student.name} 선택`}
                />
              </div>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#E8F3FF] text-sm font-bold text-[#3182F6]">
                {getInitials(student.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold text-[#191F28]">{student.name}</p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StudentStatusDot status={student.status} />
                    <div onClick={(e) => e.stopPropagation()}>
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
                  </div>
                </div>
                <p className="mt-0.5 text-xs font-medium text-[#8B95A1]">
                  {getGradeLabel(student.grade)} · {student.school?.name ?? "학교 미지정"} ·{" "}
                  <span className="font-mono">{student.studentCode}</span>
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {enrolled.length === 0 ? (
                <span className="text-xs font-medium text-[#AEB5BC]">미배정</span>
              ) : (
                enrolled.map((c) => (
                  <span
                    key={c.id}
                    className="rounded-md bg-[#F2F4F6] px-2 py-0.5 text-[11px] font-bold text-[#4E5968]"
                  >
                    {c.name}
                  </span>
                ))
              )}
              <InlineClassAssignPopover
                studentId={student.id}
                studentName={student.name}
                classes={classes}
                enrolledClassIds={enrolled.map((c) => c.id)}
              />
            </div>

            <div
              className="mt-3 flex items-center justify-between border-t border-[#F2F4F6] pt-2.5"
              onClick={(e) => e.stopPropagation()}
            >
              <InlineDevicePopover
                studentId={student.id}
                studentName={student.name}
                deviceCount={student._count.tutorStudentSessions}
              />
              {showBilling && (
                <InlineBillingPopover
                  studentId={student.id}
                  studentName={student.name}
                  invoices={student.invoices}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
