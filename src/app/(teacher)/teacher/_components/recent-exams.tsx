import { BarChart3 } from "lucide-react";

import {
  getTeacherRecentExams,
  type RecentExamResult,
} from "@/actions/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";

import { EmptyState } from "./skeletons";

export async function RecentExamsSection({
  academyId,
  staffId,
}: {
  academyId: string;
  staffId: string;
}) {
  const exams: RecentExamResult[] = await getTeacherRecentExams(
    academyId,
    staffId,
  );

  return (
    <Card className="border border-gray-200/80 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900">
            최근 시험 결과
          </CardTitle>
        </div>
        <BarChart3 className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent className="pt-0">
        {exams.length > 0 ? (
          <div className="space-y-2.5">
            {exams.map((exam) => (
              <div
                key={exam.id}
                className="group flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 p-3 transition-colors hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">
                      {exam.examTitle}
                    </span>
                    {exam.className && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px]"
                      >
                        {exam.className}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                    <span>{formatDate(exam.date)}</span>
                    <span className="text-gray-300">|</span>
                    <span>
                      {exam.submissionCount}/{exam.totalStudents}명 제출
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {exam.avgScore !== null ? (
                    <p
                      className={cn(
                        "text-lg font-bold",
                        exam.avgScore >= 90
                          ? "text-emerald-600"
                          : exam.avgScore >= 70
                            ? "text-blue-600"
                            : exam.avgScore >= 50
                              ? "text-amber-600"
                              : "text-red-600",
                      )}
                    >
                      {exam.avgScore}
                      <span className="text-xs font-normal text-gray-400">
                        점
                      </span>
                    </p>
                  ) : (
                    <span className="text-xs text-gray-400">미채점</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="최근 시험 기록이 없습니다." />
        )}
      </CardContent>
    </Card>
  );
}
