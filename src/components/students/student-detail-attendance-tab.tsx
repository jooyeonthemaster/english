// @ts-nocheck
import { cn, formatDate } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { StatusPill, type PillTone } from "@/components/layout/page-frame";

// 출결 상태 색 — 디자인 바이블 §2 (주황/앰버 금지):
// PRESENT emerald · ABSENT rose · LATE violet · EARLY_LEAVE indigo · MAKEUP teal
const ATTENDANCE_META: Record<
  string,
  { label: string; tone: PillTone; chip: string }
> = {
  PRESENT: {
    label: "출석",
    tone: "emerald",
    chip: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  },
  ABSENT: {
    label: "결석",
    tone: "rose",
    chip: "bg-rose-50 text-rose-600 ring-rose-100",
  },
  LATE: {
    label: "지각",
    tone: "violet",
    chip: "bg-violet-50 text-violet-600 ring-violet-100",
  },
  EARLY_LEAVE: {
    label: "조퇴",
    tone: "indigo",
    chip: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  },
  MAKEUP: {
    label: "보강",
    tone: "teal",
    chip: "bg-teal-50 text-teal-600 ring-teal-100",
  },
};

interface StudentDetailAttendanceTabProps {
  stats: any;
}

export function StudentDetailAttendanceTab({
  stats,
}: StudentDetailAttendanceTabProps) {
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["PRESENT", "ABSENT", "LATE", "EARLY_LEAVE"] as const).map(
          (status) => {
            const count = stats.recentAttendances.filter(
              (a: any) => a.status === status
            ).length;
            const meta = ATTENDANCE_META[status];
            return (
              <Card
                key={status}
                className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm"
              >
                <CardContent className="flex items-center gap-3 p-3.5">
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
                      meta.chip
                    )}
                  >
                    {status === "PRESENT" && (
                      <CheckCircle className="size-4" aria-hidden />
                    )}
                    {status === "ABSENT" && (
                      <XCircle className="size-4" aria-hidden />
                    )}
                    {status === "LATE" && (
                      <Clock className="size-4" aria-hidden />
                    )}
                    {status === "EARLY_LEAVE" && (
                      <Clock className="size-4" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-slate-400">
                      {meta.label}
                    </p>
                    <p className="text-lg font-bold leading-tight tabular-nums text-slate-900">
                      {count}회
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          }
        )}
      </div>

      <Card className="gap-0 overflow-hidden rounded-lg border-slate-200 py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 px-4 py-3">
          <CardTitle className="text-[13px] font-bold text-slate-900">
            최근 30일 출결 기록
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stats.recentAttendances.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-slate-400">
              출결 기록이 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 bg-slate-50 hover:bg-slate-50">
                  <TableHead className="px-4 text-[12px] font-medium text-slate-500">
                    날짜
                  </TableHead>
                  <TableHead className="w-[80px] text-[12px] font-medium text-slate-500">
                    상태
                  </TableHead>
                  <TableHead className="text-[12px] font-medium text-slate-500">
                    비고
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentAttendances.map((att: any) => {
                  const meta = ATTENDANCE_META[att.status];
                  return (
                    <TableRow
                      key={att.id}
                      className="border-slate-100 hover:bg-blue-50/40"
                    >
                      <TableCell className="px-4 text-[13px] tabular-nums text-slate-700">
                        {formatDate(att.date)}
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={meta?.tone ?? "slate"}>
                          {meta?.label ?? att.status}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="text-[13px] text-slate-400">
                        {att.note || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
