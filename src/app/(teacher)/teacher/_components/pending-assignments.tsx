import { CheckCircle2 } from "lucide-react";

import {
  getTeacherPendingAssignments,
  type PendingAssignmentItem,
} from "@/actions/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";

import { EmptyState } from "./skeletons";

export async function PendingAssignmentsSection({
  academyId,
  staffId,
}: {
  academyId: string;
  staffId: string;
}) {
  const assignments: PendingAssignmentItem[] =
    await getTeacherPendingAssignments(academyId, staffId);

  return (
    <Card className="border border-gray-200/80 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900">
            과제 현황
          </CardTitle>
        </div>
        <CheckCircle2 className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent className="pt-0">
        {assignments.length > 0 ? (
          <div className="space-y-2.5">
            {assignments.map((a) => {
              const rate =
                a.totalStudents > 0
                  ? Math.round((a.submittedCount / a.totalStudents) * 100)
                  : 0;
              const isPastDue = new Date(a.dueDate) < new Date();

              return (
                <div
                  key={a.id}
                  className="group flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 p-3 transition-colors hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {a.title}
                      </span>
                      {a.className && (
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px]"
                        >
                          {a.className}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <span
                        className={cn(isPastDue && "font-medium text-red-500")}
                      >
                        마감: {formatDate(a.dueDate)}
                      </span>
                      <span className="text-gray-300">|</span>
                      <span>
                        {a.submittedCount}/{a.totalStudents}명 제출
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          rate >= 80
                            ? "bg-emerald-500"
                            : rate >= 50
                              ? "bg-amber-500"
                              : "bg-red-500",
                        )}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                  </div>
                  <div className="ml-3 shrink-0">
                    <span
                      className={cn(
                        "text-lg font-bold",
                        rate >= 80
                          ? "text-emerald-600"
                          : rate >= 50
                            ? "text-amber-600"
                            : "text-red-600",
                      )}
                    >
                      {rate}
                      <span className="text-xs font-normal text-gray-400">
                        %
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="과제 현황이 없습니다." />
        )}
      </CardContent>
    </Card>
  );
}
