// @ts-nocheck
import { formatDate } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import { StatusPill, type PillTone } from "@/components/layout/page-frame";
import { getConsultationTypeLabel } from "./student-detail-helpers";

// 상담 상태 배지 — soft 3톤 (완료 emerald · 예정 blue · 취소 slate · 후속 violet)
const CONSULT_STATUS_META: Record<string, { label: string; tone: PillTone }> = {
  COMPLETED: { label: "완료", tone: "emerald" },
  SCHEDULED: { label: "예정", tone: "blue" },
  CANCELLED: { label: "취소", tone: "slate" },
};

interface StudentDetailConsultationTabProps {
  stats: any;
}

export function StudentDetailConsultationTab({
  stats,
}: StudentDetailConsultationTabProps) {
  return (
    <Card className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-[13px] font-bold text-slate-900">
          <MessageSquare className="size-4 text-blue-600" aria-hidden />
          상담 이력
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {stats.consultations.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-slate-400">
            상담 기록이 없습니다.
          </p>
        ) : (
          <div className="space-y-4">
            {stats.consultations.map((con: any) => {
              const meta = CONSULT_STATUS_META[con.status] ?? {
                label: "후속",
                tone: "violet" as PillTone,
              };
              return (
                <div
                  key={con.id}
                  className="border-l-2 border-blue-600 py-1.5 pl-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-slate-800">
                        {getConsultationTypeLabel(con.type)}
                      </span>
                      <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                    </div>
                    <span className="text-[11.5px] tabular-nums text-slate-400">
                      {formatDate(con.date)}
                    </span>
                  </div>
                  {con.staff && (
                    <p className="mt-0.5 text-[11.5px] text-slate-400">
                      담당: {con.staff.name}
                    </p>
                  )}
                  {con.content && (
                    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
                      {con.content}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
