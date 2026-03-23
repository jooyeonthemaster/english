"use client";

import {
  Users,
  UserCheck,
  UserX,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  isToday,
} from "date-fns";
import { ko } from "date-fns/locale";
import {
  getInitials,
  formatTime,
  getAttendanceStatusLabel,
  cn,
} from "@/lib/utils";

interface TodayRecord {
  id: string;
  student: {
    id: string;
    name: string;
    studentCode: string;
    grade: number;
    avatarUrl: string | null;
  };
  class: { id: string; name: string } | null;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  method: string | null;
  note: string | null;
}

interface Report {
  totalStudents: number;
  todayPresent: number;
  todayAbsent: number;
  todayLate: number;
  todayTotal: number;
  dailyData: Record<
    string,
    { present: number; absent: number; late: number; total: number }
  >;
}

interface MissingStudent {
  id: string;
  name: string;
  studentCode: string;
  grade: number;
  avatarUrl: string | null;
  classes: string[];
}

interface DashboardProps {
  todayData: TodayRecord[];
  report: Report;
  missingStudents: MissingStudent[];
}

function StatCard({
  icon: Icon,
  label,
  value,
  total,
  color,
  bgColor,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  total?: number;
  color: string;
  bgColor: string;
}) {
  const percent = total && total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card kpi-card">
      <div className="flex items-center justify-between mb-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: bgColor }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        {total !== undefined && (
          <span className="text-xs font-semibold text-gray-400">
            {percent}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 animate-count-up">
        {value}
        {total !== undefined && (
          <span className="text-sm font-normal text-gray-400 ml-0.5">
            /{total}
          </span>
        )}
      </p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>

      {/* Mini progress */}
      {total !== undefined && total > 0 && (
        <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${percent}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  );
}

function CalendarHeatmap({
  dailyData,
}: {
  dailyData: Report["dailyData"];
}) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad start with empty cells
  const startDayOfWeek = getDay(monthStart); // 0=Sun

  function getHeatColor(dateStr: string): string {
    const data = dailyData[dateStr];
    if (!data || data.total === 0) return "bg-gray-100";
    const rate = data.present / data.total;
    if (rate >= 0.9) return "bg-emerald-400";
    if (rate >= 0.7) return "bg-emerald-300";
    if (rate >= 0.5) return "bg-amber-300";
    return "bg-red-300";
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <h3 className="text-base font-bold text-gray-900 mb-4">
        {format(now, "yyyy년 M월", { locale: ko })} 출석 현황
      </h3>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-semibold text-gray-400 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for padding */}
        {Array.from({ length: startDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const data = dailyData[dateStr];
          const today = isToday(day);

          return (
            <div
              key={dateStr}
              className={cn(
                "aspect-square rounded-md flex flex-col items-center justify-center text-xs transition-all relative group cursor-default",
                getHeatColor(dateStr),
                today && "ring-2 ring-blue-500 ring-offset-1"
              )}
              title={
                data
                  ? `출석 ${data.present} / 결석 ${data.absent} / 지각 ${data.late}`
                  : "데이터 없음"
              }
            >
              <span
                className={cn(
                  "font-medium",
                  data && data.total > 0 ? "text-white" : "text-gray-400",
                  today && !data && "text-blue-600 font-bold"
                )}
              >
                {format(day, "d")}
              </span>

              {/* Tooltip on hover */}
              {data && data.total > 0 && (
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 bg-gray-800 text-white text-[10px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                  <p>
                    출석 {data.present} &middot; 결석 {data.absent} &middot;
                    지각 {data.late}
                  </p>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-800" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-3 mt-3 text-[10px] text-gray-500">
        <span>낮음</span>
        <div className="flex gap-0.5">
          <div className="h-3 w-3 rounded-sm bg-gray-100" />
          <div className="h-3 w-3 rounded-sm bg-red-300" />
          <div className="h-3 w-3 rounded-sm bg-amber-300" />
          <div className="h-3 w-3 rounded-sm bg-emerald-300" />
          <div className="h-3 w-3 rounded-sm bg-emerald-400" />
        </div>
        <span>높음</span>
      </div>
    </div>
  );
}

export function AttendanceDashboardClient({
  todayData,
  report,
  missingStudents,
}: DashboardProps) {
  const statusColorMap: Record<string, string> = {
    PRESENT: "bg-emerald-100 text-emerald-700",
    ABSENT: "bg-red-100 text-red-700",
    LATE: "bg-amber-100 text-amber-700",
    EARLY_LEAVE: "bg-orange-100 text-orange-700",
    MAKEUP: "bg-blue-100 text-blue-700",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          출결 대시보드
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {format(new Date(), "yyyy년 M월 d일 (EEEE)", { locale: ko })} 기준
        </p>
      </div>

      {/* Today's Overview - KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="전체 학생"
          value={report.totalStudents}
          color="#3B82F6"
          bgColor="#EFF6FF"
        />
        <StatCard
          icon={UserCheck}
          label="출석"
          value={report.todayPresent}
          total={report.totalStudents}
          color="#10B981"
          bgColor="#ECFDF5"
        />
        <StatCard
          icon={UserX}
          label="결석"
          value={report.todayAbsent}
          total={report.totalStudents}
          color="#EF4444"
          bgColor="#FEF2F2"
        />
        <StatCard
          icon={Clock}
          label="지각"
          value={report.todayLate}
          total={report.totalStudents}
          color="#F59E0B"
          bgColor="#FFFBEB"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Real-time board + Missing students */}
        <div className="lg:col-span-2 space-y-6">
          {/* Real-time arrival board */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">
                실시간 등원 현황
              </h3>
              <Badge variant="secondary" className="text-xs">
                {todayData.length}명
              </Badge>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {todayData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <UserCheck className="h-10 w-10 text-gray-300 mb-3" />
                  <p className="text-sm text-gray-500">
                    아직 출석한 학생이 없습니다.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {todayData.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-blue-50 text-blue-600 text-[10px] font-bold">
                            {getInitials(record.student.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {record.student.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {record.class?.name || "미배정"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={cn(
                            "text-[10px] font-semibold border-0",
                            statusColorMap[record.status] || "bg-gray-100"
                          )}
                        >
                          {getAttendanceStatusLabel(record.status)}
                        </Badge>
                        <span className="text-xs text-gray-400 tabular-nums w-12 text-right">
                          {record.checkInTime
                            ? formatTime(record.checkInTime)
                            : "-"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Monthly Calendar Heatmap */}
          <CalendarHeatmap dailyData={report.dailyData} />
        </div>

        {/* Right column: Missing students */}
        <div>
          <div className="rounded-xl border border-gray-200 bg-white shadow-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                미등원 학생
              </h3>
              <Badge
                variant="secondary"
                className={cn(
                  "text-xs",
                  missingStudents.length > 0
                    ? "bg-red-50 text-red-600"
                    : ""
                )}
              >
                {missingStudents.length}명
              </Badge>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {missingStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <UserCheck className="h-10 w-10 text-emerald-300 mb-3" />
                  <p className="text-sm text-gray-500">
                    모든 학생이 출석했습니다!
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {missingStudents.map((student) => (
                    <div
                      key={student.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-red-50/30 transition-colors"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-red-50 text-red-600 text-[10px] font-bold">
                          {getInitials(student.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {student.name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {student.classes.join(", ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
