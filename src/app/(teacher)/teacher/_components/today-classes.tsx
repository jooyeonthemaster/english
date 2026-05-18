import { Clock, Users } from "lucide-react";

import {
  getTeacherTodayClasses,
  type TeacherClassItem,
} from "@/actions/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { EmptyState } from "./skeletons";

export async function TodayClassesSection({
  academyId,
  staffId,
}: {
  academyId: string;
  staffId: string;
}) {
  const classes: TeacherClassItem[] = await getTeacherTodayClasses(
    academyId,
    staffId,
  );

  return (
    <Card className="border border-gray-200/80 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold text-gray-900">
            오늘 수업 일정
          </CardTitle>
          <p className="text-xs text-gray-500">{classes.length}개 수업</p>
        </div>
        <Clock className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent className="pt-0">
        {classes.length > 0 ? (
          <div className="space-y-3">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  cls.status === "in-progress"
                    ? "border-blue-200 bg-blue-50/50"
                    : cls.status === "completed"
                      ? "border-gray-100 bg-gray-50/30"
                      : "border-gray-200 bg-white",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold",
                        cls.status === "in-progress"
                          ? "bg-blue-100 text-blue-700"
                          : cls.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-600",
                      )}
                    >
                      {cls.startTime.split(":")[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {cls.name}
                      </p>
                      <p className="text-xs text-gray-500">{cls.time}</p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px]",
                      cls.status === "in-progress" &&
                        "bg-blue-100 text-blue-700",
                      cls.status === "upcoming" && "bg-gray-100 text-gray-600",
                      cls.status === "completed" &&
                        "bg-emerald-100 text-emerald-700",
                    )}
                  >
                    {cls.status === "in-progress"
                      ? "수업 중"
                      : cls.status === "upcoming"
                        ? "예정"
                        : "완료"}
                  </Badge>
                </div>
                <div className="mt-2.5 flex items-center gap-4 text-xs text-gray-500">
                  {cls.room && (
                    <span className="flex items-center gap-1">
                      교실: {cls.room}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {cls.attendedCount}/{cls.studentCount}명 출석
                  </span>
                  <div className="flex-1" />
                  {cls.studentCount > 0 && (
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          cls.status === "completed"
                            ? "bg-emerald-500"
                            : "bg-blue-500",
                        )}
                        style={{
                          width: `${Math.round(
                            (cls.attendedCount / cls.studentCount) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="오늘 예정된 수업이 없습니다." />
        )}
      </CardContent>
    </Card>
  );
}
