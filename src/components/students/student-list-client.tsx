// @ts-nocheck
"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { bulkUpdateStudentStatus } from "@/actions/students";
import { StudentFormDialog } from "@/components/students/student-form-dialog";
import { toast } from "sonner";
import { StudentListToolbar } from "./student-list-toolbar";
import { StudentListTable } from "./student-list-table";
import { StudentListPagination } from "./student-list-pagination";

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

export function StudentListClient({
  studentsData,
  schools,
  filters,
  isDirector,
}: StudentListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  function handleSearch(value: string) {
    updateParams({ search: value || undefined });
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

  return (
    <div className="flex flex-col h-full">
      <StudentListToolbar
        total={studentsData.total}
        isDirector={isDirector}
        schools={schools}
        filters={filters}
        selectedCount={selectedIds.size}
        defaultSearch={filters.search ?? ""}
        onSearch={handleSearch}
        onUpdateParams={updateParams}
        onOpenNewStudent={() => {
          setEditingStudent(null);
          setDialogOpen(true);
        }}
        onBulkStatus={handleBulkStatus}
      />

      {/* ===== Data Table ===== */}
      <div className="flex-1 overflow-auto px-8 py-4">
        <StudentListTable
          students={studentsData.students}
          isDirector={isDirector}
          selectedIds={selectedIds}
          basePath={basePath}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onEdit={(student) => {
            setEditingStudent(student);
            setDialogOpen(true);
          }}
        />

        <StudentListPagination
          studentsData={studentsData}
          filters={filters}
          onUpdateParams={updateParams}
        />
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
