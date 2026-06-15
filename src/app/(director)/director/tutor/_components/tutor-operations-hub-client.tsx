"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { bulkUpdateStudentStatus, deleteStudent } from "@/actions/students";
import { deleteClass } from "@/actions/classes";
import { StudentFormDialog } from "@/components/students/student-form-dialog";
import { ClassFormDialog } from "@/components/classes/class-form-dialog";
import { StudentListPagination } from "@/components/students/student-list-pagination";
import { HubHeader } from "./hub-header";
import { OnboardingStepper } from "./onboarding-stepper";
import { HubKpiBar } from "./hub-kpi-bar";
import { ClassChipFilter } from "./class-chip-filter";
import { StudentToolbar } from "./student-toolbar";
import { BulkActionBar } from "./bulk-action-bar";
import { StudentRosterTable } from "./student-roster-table";
import { StudentCardList } from "./student-card";
import { StudentQuickAddBar } from "./student-quick-add-bar";
import { StudentBulkImportDialog } from "./student-bulk-import-dialog";
import { RosterEmptyState } from "./roster-empty-state";
import { HubEmptyState } from "./hub-empty-state";
import type {
  HubClass,
  HubFilters,
  HubSchool,
  HubStats,
  HubStudent,
  StudentsResult,
} from "./types";

const BASE_PATH = "/director/tutor";

export function TutorOperationsHubClient({
  academyId,
  studentsData,
  classes,
  schools,
  stats,
  filters,
  isDirector,
  showBilling,
}: {
  academyId: string;
  studentsData: StudentsResult;
  classes: HubClass[];
  schools: HubSchool[];
  stats: HubStats;
  filters: HubFilters;
  isDirector: boolean;
  showBilling: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<HubStudent | null>(null);
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<HubClass | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const students = studentsData.students;
  const noStudentsAtAll = stats.totalStudents === 0;
  const hasActiveFilter =
    !!filters.search ||
    !!filters.classId ||
    !!filters.schoolId ||
    !!filters.grade ||
    !!filters.billing ||
    (!!filters.status && filters.status !== "ALL");

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value && value !== "ALL") params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in updates)) params.delete("page");
    startTransition(() => {
      const query = params.toString();
      router.push(query ? `${BASE_PATH}?${query}` : BASE_PATH);
      // Reset selection atomically with the navigation so the checkboxes don't
      // flash a stale state before the new rows arrive.
      setSelectedIds(new Set());
    });
  }

  function resetFilters() {
    startTransition(() => router.push(BASE_PATH));
  }

  function openNewStudent() {
    setEditingStudent(null);
    setStudentDialogOpen(true);
  }
  function openEditStudent(student: HubStudent) {
    setEditingStudent(student);
    setStudentDialogOpen(true);
  }
  function openNewClass() {
    setEditingClass(null);
    setClassDialogOpen(true);
  }
  function openEditClass(cls: HubClass) {
    setEditingClass(cls);
    setClassDialogOpen(true);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === students.length ? new Set() : new Set(students.map((s) => s.id)),
    );
  }

  async function handleBulkStatus(status: string) {
    if (selectedIds.size === 0) return;
    if (
      status === "WITHDRAWN" &&
      !confirm(`${selectedIds.size}명을 퇴원 처리할까요? 되돌릴 수 없습니다.`)
    ) {
      return;
    }
    const result = await bulkUpdateStudentStatus(Array.from(selectedIds), status);
    if (result.success) {
      toast.success(`${selectedIds.size}명의 상태를 변경했어요.`);
      setSelectedIds(new Set());
      router.refresh();
    } else {
      toast.error(result.error || "상태 변경에 실패했어요.");
    }
  }

  async function handleDeleteStudent(student: HubStudent) {
    if (!confirm(`"${student.name}" 학생을 퇴원 처리할까요?`)) return;
    const result = await deleteStudent(student.id);
    if (result.success) {
      toast.success("퇴원 처리했어요.");
      router.refresh();
    } else {
      toast.error(result.error || "처리에 실패했어요.");
    }
  }

  async function handleDeleteClass(cls: HubClass) {
    if (!confirm(`"${cls.name}" 반을 삭제할까요? 학생의 수강 정보가 함께 해제됩니다.`)) return;
    const result = await deleteClass(cls.id);
    if (result.success) {
      toast.success("반을 삭제했어요.");
      if (filters.classId === cls.id) updateParams({ classId: undefined });
      else router.refresh();
    } else {
      toast.error(result.error || "삭제에 실패했어요.");
    }
  }

  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 max-md:m-0 sm:px-6 xl:px-8">
      <div className="flex w-full min-w-0 flex-col gap-4">
        <HubHeader onAddStudent={openNewStudent} onBulkImport={() => setBulkImportOpen(true)} />

      {noStudentsAtAll ? (
        <HubEmptyState onAddStudent={openNewStudent} />
      ) : (
        <>
          <OnboardingStepper
            onboarding={stats.onboarding}
            onAddStudent={openNewStudent}
            updateParams={updateParams}
          />

          <HubKpiBar
            stats={stats}
            filters={filters}
            updateParams={updateParams}
            showBilling={showBilling}
          />

          {/* Sticky filter + toolbar (swaps to bulk bar when rows selected). */}
          <div className="sticky top-0 z-20 space-y-2.5 rounded-xl border border-[#E5E8EB] bg-white/95 px-3 py-3 shadow-[0_1px_0_#F2F4F6] backdrop-blur">
            <ClassChipFilter
              classes={classes}
              filters={filters}
              updateParams={updateParams}
              onAddClass={openNewClass}
              onEditClass={openEditClass}
              onDeleteClass={handleDeleteClass}
            />
            {selectedIds.size > 0 ? (
              <BulkActionBar
                count={selectedIds.size}
                onClear={() => setSelectedIds(new Set())}
                onBulkStatus={handleBulkStatus}
              />
            ) : (
              <StudentToolbar filters={filters} schools={schools} updateParams={updateParams} />
            )}
          </div>

          <div className="rounded-xl border border-[#E5E8EB] bg-white">
            {students.length === 0 ? (
              <RosterEmptyState onReset={resetFilters} />
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <StudentRosterTable
                    students={students}
                    classes={classes}
                    selectedIds={selectedIds}
                    showBilling={showBilling}
                    onToggleSelect={toggleSelect}
                    onToggleSelectAll={toggleSelectAll}
                    onEditStudent={openEditStudent}
                    onDeleteStudent={handleDeleteStudent}
                  />
                </div>
                <div className="md:hidden">
                  <StudentCardList
                    students={students}
                    classes={classes}
                    selectedIds={selectedIds}
                    showBilling={showBilling}
                    onToggleSelect={toggleSelect}
                    onEditStudent={openEditStudent}
                    onDeleteStudent={handleDeleteStudent}
                  />
                </div>
                {!hasActiveFilter && <StudentQuickAddBar />}
              </>
            )}
            {studentsData.totalPages > 1 && (
              <div className="border-t border-[#F2F4F6] px-4 pb-3">
                <StudentListPagination
                  studentsData={studentsData}
                  filters={filters}
                  onUpdateParams={updateParams}
                />
              </div>
            )}
          </div>

          {!hasActiveFilter && (
            <p className="px-1 text-center text-xs font-medium text-[#AEB5BC]">
              전체 {studentsData.total.toLocaleString()}명 · 행을 클릭하면 학생 상세로 이동해요.
            </p>
          )}
        </>
      )}

      <StudentFormDialog
        open={studentDialogOpen}
        onOpenChange={setStudentDialogOpen}
        student={editingStudent}
        schools={schools}
        classes={classes}
        showBilling={showBilling}
        isDirector={isDirector}
      />

      <ClassFormDialog
        open={classDialogOpen}
        onOpenChange={(open) => {
          setClassDialogOpen(open);
          if (!open) router.refresh();
        }}
        academyId={academyId}
        editData={
          editingClass
            ? {
                id: editingClass.id,
                name: editingClass.name,
                teacherId: editingClass.teacherId,
                capacity: editingClass.capacity,
                fee: editingClass.fee,
                room: editingClass.room,
                schedule: editingClass.schedule,
                isActive: editingClass.isActive,
              }
            : null
        }
      />

      <StudentBulkImportDialog
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        academyId={academyId}
      />
      </div>
    </div>
  );
}
