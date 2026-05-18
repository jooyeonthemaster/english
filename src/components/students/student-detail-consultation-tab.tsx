// @ts-nocheck
import { cn, formatDate } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import { getConsultationTypeLabel } from "./student-detail-helpers";

interface StudentDetailConsultationTabProps {
  stats: any;
}

export function StudentDetailConsultationTab({
  stats,
}: StudentDetailConsultationTabProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
          <MessageSquare className="size-4 text-amber-500" />
          상담 이력
        </CardTitle>
      </CardHeader>
      <CardContent>
        {stats.consultations.length === 0 ? (
          <p className="text-sm text-[#8B95A1] py-8 text-center">
            상담 기록이 없습니다.
          </p>
        ) : (
          <div className="space-y-4">
            {stats.consultations.map((con: any) => (
              <div
                key={con.id}
                className="border-l-2 border-[#3182F6] pl-4 py-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#191F28]">
                      {getConsultationTypeLabel(con.type)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        con.status === "COMPLETED"
                          ? "bg-emerald-100 text-emerald-700"
                          : con.status === "SCHEDULED"
                          ? "bg-blue-100 text-blue-700"
                          : con.status === "CANCELLED"
                          ? "bg-gray-100 text-gray-500"
                          : "bg-amber-100 text-amber-700"
                      )}
                    >
                      {con.status === "COMPLETED"
                        ? "완료"
                        : con.status === "SCHEDULED"
                        ? "예정"
                        : con.status === "CANCELLED"
                        ? "취소"
                        : "후속"}
                    </span>
                  </div>
                  <span className="text-xs text-[#8B95A1]">
                    {formatDate(con.date)}
                  </span>
                </div>
                {con.staff && (
                  <p className="text-xs text-[#8B95A1] mt-0.5">
                    담당: {con.staff.name}
                  </p>
                )}
                {con.content && (
                  <p className="text-sm text-[#4E5968] mt-2 whitespace-pre-wrap">
                    {con.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
