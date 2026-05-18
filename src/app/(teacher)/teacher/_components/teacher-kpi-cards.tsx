import {
  BookOpen,
  ClipboardList,
  FileWarning,
  Users,
} from "lucide-react";

import { getTeacherKPIs, type TeacherKPIData } from "@/actions/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatNumber } from "@/lib/utils";

export async function TeacherKPICards({
  academyId,
  staffId,
}: {
  academyId: string;
  staffId: string;
}) {
  const kpi: TeacherKPIData = await getTeacherKPIs(academyId, staffId);

  const cards = [
    {
      title: "내 수업",
      value: formatNumber(kpi.myClassesToday),
      suffix: "개",
      description: "오늘 수업",
      icon: BookOpen,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      title: "미채점 시험",
      value: formatNumber(kpi.ungradedExams),
      suffix: "건",
      description: "채점 대기",
      icon: ClipboardList,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      alert: kpi.ungradedExams > 0,
    },
    {
      title: "미제출 과제",
      value: formatNumber(kpi.missingAssignments),
      suffix: "건",
      description: "마감 초과",
      icon: FileWarning,
      iconBg: "bg-red-50",
      iconColor: "text-red-600",
      alert: kpi.missingAssignments > 0,
    },
    {
      title: "담당 학생",
      value: formatNumber(kpi.myStudents),
      suffix: "명",
      description: "전체 담당",
      icon: Users,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={cn(
            "kpi-card border border-gray-200/80 shadow-card animate-float-up",
            card.alert && "border-amber-200/80",
            i === 0 && "stagger-1",
            i === 1 && "stagger-2",
            i === 2 && "stagger-3",
            i === 3 && "stagger-4",
          )}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">{card.title}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-gray-900">
                    {card.value}
                  </span>
                  <span className="text-base font-medium text-gray-500">
                    {card.suffix}
                  </span>
                </div>
              </div>
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  card.iconBg,
                )}
              >
                <card.icon className={cn("h-5 w-5", card.iconColor)} />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
