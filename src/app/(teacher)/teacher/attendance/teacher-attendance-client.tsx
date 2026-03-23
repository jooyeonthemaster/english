"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  Save,
  Loader2,
  Users,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  getClassAttendance,
  markAttendance,
  type AttendanceRecord,
} from "@/actions/attendance";
import {
  getInitials,
  getGradeLabel,
  cn,
} from "@/lib/utils";

const ATTENDANCE_STATUSES = [
  { value: "PRESENT", label: "출석", color: "bg-emerald-500" },
  { value: "ABSENT", label: "결석", color: "bg-red-500" },
  { value: "LATE", label: "지각", color: "bg-amber-500" },
  { value: "EARLY_LEAVE", label: "조퇴", color: "bg-orange-500" },
  { value: "MAKEUP", label: "보강", color: "bg-blue-500" },
] as const;

type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]["value"];

interface StudentAttendance {
  student: {
    id: string;
    name: string;
    studentCode: string;
    grade: number;
    avatarUrl: string | null;
  };
  status: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  note: string | null;
  attendanceId: string | null;
}

interface Props {
  academyId: string;
  classes: Array<{ id: string; name: string; schedule: string | null }>;
  staffName: string;
}

export function TeacherAttendanceClient({
  academyId,
  classes,
  staffName,
}: Props) {
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [selectedClassId, setSelectedClassId] = useState(
    classes[0]?.id || ""
  );
  const [students, setStudents] = useState<StudentAttendance[]>([]);
  const [records, setRecords] = useState<Map<string, AttendanceStatus>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadAttendance = useCallback(async () => {
    if (!selectedClassId) return;
    setLoading(true);
    try {
      const data = await getClassAttendance(
        selectedClassId,
        new Date(selectedDate)
      );
      setStudents(data);
      const map = new Map<string, AttendanceStatus>();
      for (const s of data) {
        if (s.status) {
          map.set(s.student.id, s.status as AttendanceStatus);
        }
      }
      setRecords(map);
    } catch {
      toast.error("데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, selectedDate]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  function handleStatusChange(studentId: string, status: AttendanceStatus) {
    setRecords((prev) => {
      const next = new Map(prev);
      if (next.get(studentId) === status) {
        next.delete(studentId);
      } else {
        next.set(studentId, status);
      }
      return next;
    });
  }

  async function handleSave() {
    if (records.size === 0) {
      toast.error("출결 상태를 선택해주세요.");
      return;
    }
    setSaving(true);
    try {
      const attendanceRecords: AttendanceRecord[] = Array.from(
        records.entries()
      ).map(([studentId, status]) => ({
        studentId,
        classId: selectedClassId,
        status,
      }));

      const result = await markAttendance(
        academyId,
        new Date(selectedDate),
        attendanceRecords
      );

      if (result.success) {
        toast.success(
          `${attendanceRecords.length}명의 출결이 저장되었습니다.`
        );
        loadAttendance();
      } else {
        toast.error(result.error || "저장에 실패했습니다.");
      }
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  // Summary counts
  const presentCount = Array.from(records.values()).filter(
    (v) => v === "PRESENT" || v === "MAKEUP"
  ).length;
  const absentCount = Array.from(records.values()).filter(
    (v) => v === "ABSENT"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          출결 관리
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {staffName} 선생님의 수업 출결을 관리합니다.
        </p>
      </div>

      {/* Today summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-gray-900">{students.length}</p>
          <p className="text-xs text-gray-500 mt-1">전체</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-emerald-600">{presentCount}</p>
          <p className="text-xs text-gray-500 mt-1">출석</p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-red-600">{absentCount}</p>
          <p className="text-xs text-gray-500 mt-1">결석</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-gray-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {classes.length > 1 && (
          <Select
            value={selectedClassId}
            onValueChange={setSelectedClassId}
          >
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="반을 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Student list */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardCheck className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">
              배정된 반이 없습니다.
            </p>
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">
              이 반에 등록된 학생이 없습니다.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-50">
              {students.map(({ student }) => {
                const currentStatus = records.get(student.id);

                return (
                  <div
                    key={student.id}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-blue-50 text-blue-600 text-[10px] font-bold">
                          {getInitials(student.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {student.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {getGradeLabel(student.grade)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {ATTENDANCE_STATUSES.map((s) => (
                        <button
                          key={s.value}
                          onClick={() =>
                            handleStatusChange(student.id, s.value)
                          }
                          className={cn(
                            "h-8 px-3 rounded-lg text-xs font-semibold transition-all duration-200 border",
                            currentStatus === s.value
                              ? `${s.color} text-white border-transparent shadow-sm`
                              : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                          )}
                          aria-label={`${student.name} ${s.label}`}
                          aria-pressed={currentStatus === s.value}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Save bar */}
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 bg-gray-50/30">
              <p className="text-xs text-gray-500">
                {records.size}명 선택됨
              </p>
              <Button
                onClick={handleSave}
                disabled={saving || records.size === 0}
                className="h-9 gap-2 bg-blue-500 hover:bg-blue-600"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                저장
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
