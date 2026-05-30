"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpenCheck,
  CalendarClock,
  ChevronRight,
  CreditCard,
  GraduationCap,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { bulkUpdateStudentStatus } from "@/actions/students";
import { deleteClass, removeStudent } from "@/actions/classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClassFormDialog } from "@/components/classes/class-form-dialog";
import { EnrollStudentDialog } from "@/components/classes/enroll-student-dialog";
import { StudentFormDialog } from "@/components/students/student-form-dialog";
import { StudentListPagination } from "@/components/students/student-list-pagination";
import { StudentListTable } from "@/components/students/student-list-table";
import { GRADES, STUDENT_STATUSES } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatDate,
  formatScheduleLabel,
  getGradeLabel,
  getInitials,
} from "@/lib/utils";

export function StudentClassManagementClient({
  academyId,
  studentsData,
  schools,
  filters,
  classes,
  selectedClassData,
}: {
  academyId: string;
  studentsData: any;
  schools: any[];
  filters: any;
  classes: any[];
  selectedClassData: any | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<any | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(filters.search ?? "");

  const activeClasses = classes.filter((item) => item.isActive);
  const classStudentTotal = classes.reduce((sum, item) => sum + item.enrolledCount, 0);
  const selectedClass = selectedClassData;
  const basePath = "/director/students";

  const classById = useMemo(() => new Map(classes.map((item) => [item.id, item])), [classes]);
  const selectedClassListItem = filters.classId ? classById.get(filters.classId) : null;

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value && value !== "ALL") params.set(key, value);
      else params.delete(key);
    }
    if (!updates.page) params.delete("page");
    startTransition(() => {
      const query = params.toString();
      router.push(query ? `${basePath}?${query}` : basePath);
    });
  }

  function openNewStudent() {
    setEditingStudent(null);
    setStudentDialogOpen(true);
  }

  function openNewClass() {
    setEditingClass(null);
    setClassDialogOpen(true);
  }

  function editClass(item: any) {
    setEditingClass(item);
    setClassDialogOpen(true);
  }

  async function handleDeleteClass(item: any) {
    if (!confirm(`"${item.name}" 반을 삭제하시겠습니까?`)) return;
    const result = await deleteClass(item.id);
    if (result.success) {
      toast.success("반이 삭제되었습니다.");
      if (filters.classId === item.id) updateParams({ classId: undefined });
      router.refresh();
    } else {
      toast.error(result.error || "삭제에 실패했습니다.");
    }
  }

  function toggleSelectAll() {
    if (selectedIds.size === studentsData.students.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(studentsData.students.map((student: any) => student.id)));
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function handleBulkStatus(status: string) {
    if (selectedIds.size === 0) return;
    const result = await bulkUpdateStudentStatus(Array.from(selectedIds), status);
    if (result.success) {
      toast.success("상태가 변경되었습니다.");
      setSelectedIds(new Set());
      router.refresh();
    } else {
      toast.error(result.error || "오류가 발생했습니다.");
    }
  }

  async function handleRemoveStudent(studentId: string, studentName: string) {
    if (!selectedClass) return;
    if (!confirm(`"${studentName}" 학생을 ${selectedClass.name}에서 제외하시겠습니까?`)) return;
    const result = await removeStudent(selectedClass.id, studentId);
    if (result.success) {
      toast.success("학생이 반에서 제외되었습니다.");
      router.refresh();
    } else {
      toast.error(result.error || "처리에 실패했습니다.");
    }
  }

  const classFillRate =
    selectedClass && selectedClass.capacity > 0
      ? Math.round((selectedClass.enrolled.length / selectedClass.capacity) * 100)
      : 0;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F7F8FA]">
      <header className="border-b border-[#E5E8EB] bg-white px-5 py-4 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-8 items-center gap-2 rounded-full bg-blue-50 px-3 text-xs font-black text-blue-700">
                <Users className="size-3.5" />
                Student & Class Hub
              </span>
              {selectedClassListItem && (
                <button
                  type="button"
                  onClick={() => updateParams({ classId: undefined })}
                  className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  {selectedClassListItem.name} 필터 해제
                </button>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-[#191F28]">학생·클래스 통합 관리</h1>
            <p className="mt-1 text-sm font-medium text-[#6B7684]">
              학생 등록, 반 편성, 수강 인원 확인을 한 화면에서 처리합니다.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
            <SummaryMetric label="학생" value={`${studentsData.total}`} />
            <SummaryMetric label="운영 반" value={`${activeClasses.length}`} />
            <SummaryMetric label="수강 배정" value={`${classStudentTotal}`} />
          </div>
        </div>
      </header>

      <div className="grid gap-5 px-5 py-5 lg:px-8 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-xl border border-[#E5E8EB] bg-white">
            <div className="flex items-center justify-between border-b border-[#F2F4F6] px-4 py-3">
              <div>
                <p className="text-sm font-black text-[#191F28]">클래스</p>
                <p className="mt-0.5 text-xs font-medium text-[#8B95A1]">{classes.length}개 반</p>
              </div>
              <Button onClick={openNewClass} size="sm" className="h-8 rounded-lg bg-blue-600 text-xs font-bold hover:bg-blue-700">
                <Plus className="size-3.5" />
                반 추가
              </Button>
            </div>

            <div className="max-h-[460px] space-y-2 overflow-y-auto p-3">
              <button
                type="button"
                onClick={() => updateParams({ classId: undefined })}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition",
                  !filters.classId
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : "border-transparent bg-[#F7F8FA] text-[#4E5968] hover:bg-[#F2F4F6]",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-black">
                  <BookOpenCheck className="size-4" />
                  전체 학생
                </span>
                <ChevronRight className="size-4" />
              </button>

              {classes.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-lg border bg-white transition",
                    filters.classId === item.id ? "border-blue-300 shadow-sm" : "border-[#F2F4F6]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => updateParams({ classId: item.id })}
                    className="w-full px-3 py-3 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-black text-[#191F28]">{item.name}</p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 rounded-full px-2 text-[10px]",
                              item.isActive
                                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-500",
                            )}
                          >
                            {item.isActive ? "운영" : "비활성"}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs font-medium text-[#8B95A1]">
                          {item.teacherName || "강사 미지정"} · {formatScheduleLabel(item.schedule)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-[#F2F4F6] px-2 py-1 text-xs font-black text-[#4E5968]">
                        {item.enrolledCount}/{item.capacity}
                      </span>
                    </div>
                    <Progress
                      value={item.capacity > 0 ? Math.round((item.enrolledCount / item.capacity) * 100) : 0}
                      className="mt-3 h-1.5"
                    />
                  </button>
                  <div className="flex items-center justify-between border-t border-[#F2F4F6] px-3 py-2">
                    <span className="text-[11px] font-semibold text-[#8B95A1]">{item.room || "교실 미지정"}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7">
                          <MoreVertical className="size-4 text-[#8B95A1]" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => editClass(item)}>
                          <Pencil className="size-4" />
                          수정
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => handleDeleteClass(item)}>
                          <Trash2 className="size-4" />
                          삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ClassRosterPanel
            selectedClass={selectedClass}
            classFillRate={classFillRate}
            onEnroll={() => setEnrollOpen(true)}
            onRemove={handleRemoveStudent}
          />
        </aside>

        <main className="min-w-0 space-y-4">
          <section className="rounded-xl border border-[#E5E8EB] bg-white">
            <div className="border-b border-[#F2F4F6] px-4 py-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <GraduationCap className="size-5" />
                  </div>
                  <div>
                    <p className="text-base font-black text-[#191F28]">
                      {selectedClassListItem ? `${selectedClassListItem.name} 학생` : "전체 학생"}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-[#8B95A1]">총 {studentsData.total}명</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8B95A1]" />
                    <Input
                      placeholder="이름 또는 학생코드 검색"
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") updateParams({ search: searchValue || undefined });
                      }}
                      className="h-9 w-full min-w-[220px] pl-9 text-sm sm:w-64"
                    />
                  </div>
                  <Button
                    onClick={() => updateParams({ search: searchValue || undefined })}
                    variant="outline"
                    className="h-9 rounded-lg text-sm font-bold"
                  >
                    검색
                  </Button>
                  <Button onClick={openNewStudent} className="h-9 rounded-lg bg-blue-600 text-sm font-bold hover:bg-blue-700">
                    <Plus className="size-4" />
                    학생 등록
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {[{ value: "ALL", label: "전체" }, ...STUDENT_STATUSES].map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    onClick={() => updateParams({ status: status.value })}
                    className={cn(
                      "h-8 rounded-full px-3 text-xs font-bold transition",
                      filters.status === status.value
                        ? "bg-[#191F28] text-white"
                        : "bg-[#F2F4F6] text-[#6B7684] hover:bg-[#E5E8EB]",
                    )}
                  >
                    {status.label}
                  </button>
                ))}

                <div className="mx-1 h-5 w-px bg-[#E5E8EB]" />

                <Select
                  value={filters.schoolId || "ALL"}
                  onValueChange={(value) => updateParams({ schoolId: value === "ALL" ? undefined : value })}
                >
                  <SelectTrigger className="h-8 w-[140px] rounded-lg text-xs font-bold">
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

                <Select
                  value={filters.grade?.toString() || "ALL"}
                  onValueChange={(value) => updateParams({ grade: value === "ALL" ? undefined : value })}
                >
                  <SelectTrigger className="h-8 w-[110px] rounded-lg text-xs font-bold">
                    <SelectValue placeholder="학년 전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">학년 전체</SelectItem>
                    {GRADES.map((grade) => (
                      <SelectItem key={grade.value} value={grade.value.toString()}>
                        {grade.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedIds.size > 0 && (
                  <>
                    <div className="mx-1 h-5 w-px bg-[#E5E8EB]" />
                    <span className="text-xs font-black text-blue-600">{selectedIds.size}명 선택</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-bold">
                          상태 변경
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleBulkStatus("ACTIVE")}>재원으로 변경</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleBulkStatus("PAUSED")}>휴원으로 변경</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleBulkStatus("WITHDRAWN")}>퇴원으로 변경</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-auto p-4">
              <StudentListTable
                students={studentsData.students}
                isDirector
                selectedIds={selectedIds}
                basePath={basePath}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                onEdit={(student) => {
                  setEditingStudent(student);
                  setStudentDialogOpen(true);
                }}
              />
              <StudentListPagination studentsData={studentsData} filters={filters} onUpdateParams={updateParams} />
            </div>
          </section>
        </main>
      </div>

      <StudentFormDialog
        open={studentDialogOpen}
        onOpenChange={setStudentDialogOpen}
        student={editingStudent}
        schools={schools}
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

      {selectedClass && (
        <EnrollStudentDialog
          open={enrollOpen}
          onOpenChange={setEnrollOpen}
          classId={selectedClass.id}
          academyId={academyId}
          enrolledStudentIds={selectedClass.enrolled.map((item: any) => item.student.id)}
          onEnrolled={() => router.refresh()}
        />
      )}
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E5E8EB] bg-[#F7F8FA] px-3 py-2">
      <p className="text-[10px] font-black uppercase text-[#8B95A1]">{label}</p>
      <p className="mt-0.5 text-lg font-black text-[#191F28]">{value}</p>
    </div>
  );
}

function ClassRosterPanel({
  selectedClass,
  classFillRate,
  onEnroll,
  onRemove,
}: {
  selectedClass: any | null;
  classFillRate: number;
  onEnroll: () => void;
  onRemove: (studentId: string, studentName: string) => void;
}) {
  if (!selectedClass) {
    return (
      <div className="rounded-xl border border-dashed border-[#DDE2E7] bg-white px-4 py-8 text-center">
        <Users className="mx-auto size-7 text-[#AEB5BC]" />
        <p className="mt-3 text-sm font-black text-[#4E5968]">반을 선택하면 수강생 현황이 열립니다.</p>
        <p className="mt-1 text-xs font-medium leading-5 text-[#8B95A1]">왼쪽 클래스 목록에서 반을 누르면 학생 목록도 함께 필터링됩니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#E5E8EB] bg-white">
      <div className="border-b border-[#F2F4F6] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-black text-[#191F28]">{selectedClass.name}</p>
            <p className="mt-1 text-xs font-medium text-[#8B95A1]">
              {selectedClass.teacherName || "강사 미지정"} · {formatScheduleLabel(selectedClass.schedule)}
            </p>
          </div>
          <Button onClick={onEnroll} size="sm" className="h-8 shrink-0 rounded-lg bg-blue-600 text-xs font-bold hover:bg-blue-700">
            <UserPlus className="size-3.5" />
            등록
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <InfoPill icon={Users} label="인원" value={`${selectedClass.enrolled.length}/${selectedClass.capacity}명`} />
          <InfoPill icon={MapPin} label="교실" value={selectedClass.room || "-"} />
          <InfoPill icon={CalendarClock} label="대기" value={`${selectedClass.waitlisted.length}명`} />
          <InfoPill icon={CreditCard} label="수강료" value={formatCurrency(selectedClass.fee)} />
        </div>

        <Progress value={classFillRate} className="mt-4 h-2" />
      </div>

      <div className="max-h-[320px] overflow-y-auto p-3">
        {selectedClass.enrolled.length === 0 ? (
          <div className="rounded-lg bg-[#F7F8FA] px-4 py-8 text-center">
            <p className="text-sm font-bold text-[#6B7684]">수강생이 없습니다.</p>
            <p className="mt-1 text-xs text-[#8B95A1]">학생 등록 버튼으로 바로 추가하세요.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedClass.enrolled.map(({ student, enrolledAt }: any) => (
              <div key={student.id} className="flex items-center gap-3 rounded-lg border border-[#F2F4F6] px-3 py-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-blue-600">
                  {getInitials(student.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#191F28]">{student.name}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-[#8B95A1]">
                    {getGradeLabel(student.grade)} · {student.studentCode} · {formatDate(enrolledAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-[#AEB5BC] hover:text-red-500"
                  onClick={() => onRemove(student.id, student.name)}
                  aria-label={`${student.name} 반 제외`}
                >
                  <UserMinus className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoPill({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#F7F8FA] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-black text-[#8B95A1]">
        <Icon className="size-3" />
        {label}
      </div>
      <p className="mt-1 truncate text-xs font-black text-[#191F28]">{value}</p>
    </div>
  );
}
