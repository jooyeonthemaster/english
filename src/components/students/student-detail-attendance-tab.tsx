// @ts-nocheck
import { cn, formatDate } from "@/lib/utils";
import { ATTENDANCE_STATUSES } from "@/lib/constants";
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
import { getAttendanceBadge } from "./student-detail-helpers";

interface StudentDetailAttendanceTabProps {
  stats: any;
}

export function StudentDetailAttendanceTab({
  stats,
}: StudentDetailAttendanceTabProps) {
  return (
    <>
      <div className="grid grid-cols-4 gap-4 mb-6">
        {(["PRESENT", "ABSENT", "LATE", "EARLY_LEAVE"] as const).map(
          (status) => {
            const count = stats.recentAttendances.filter(
              (a: any) => a.status === status
            ).length;
            const found = ATTENDANCE_STATUSES.find((s) => s.value === status);
            return (
              <Card key={status}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg",
                      found?.color
                    )}
                  >
                    {status === "PRESENT" && <CheckCircle className="size-4" />}
                    {status === "ABSENT" && <XCircle className="size-4" />}
                    {status === "LATE" && <Clock className="size-4" />}
                    {status === "EARLY_LEAVE" && <Clock className="size-4" />}
                  </div>
                  <div>
                    <p className="text-xs text-[#8B95A1]">{found?.label}</p>
                    <p className="text-lg font-bold text-[#191F28]">
                      {count}회
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          }
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#191F28]">
            최근 30일 출결 기록
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentAttendances.length === 0 ? (
            <p className="text-sm text-[#8B95A1] py-8 text-center">
              출결 기록이 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F7F8FA] hover:bg-[#F7F8FA]">
                  <TableHead>날짜</TableHead>
                  <TableHead className="w-[80px]">상태</TableHead>
                  <TableHead>비고</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentAttendances.map((att: any) => (
                  <TableRow key={att.id}>
                    <TableCell className="text-sm text-[#191F28]">
                      {formatDate(att.date)}
                    </TableCell>
                    <TableCell>{getAttendanceBadge(att.status)}</TableCell>
                    <TableCell className="text-sm text-[#8B95A1]">
                      {att.note || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
