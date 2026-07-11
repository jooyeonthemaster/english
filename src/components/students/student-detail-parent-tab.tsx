// @ts-nocheck
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Mail, Phone, Users } from "lucide-react";
import { getRelationLabel } from "./student-detail-helpers";

interface StudentDetailParentTabProps {
  student: any;
}

export function StudentDetailParentTab({
  student,
}: StudentDetailParentTabProps) {
  if (student.parentLinks.length === 0) {
    return (
      <Card className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm">
        <CardContent className="py-10">
          <p className="text-center text-[13px] text-slate-400">
            등록된 학부모 정보가 없습니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {student.parentLinks.map((pl: any) => (
        <Card
          key={pl.parent.id}
          className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm"
        >
          <CardHeader className="border-b border-slate-100 px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-[13px] font-bold text-slate-900">
              <Users className="size-4 text-blue-600" aria-hidden />
              {getRelationLabel(pl.parent.relation)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <dl className="space-y-3 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">이름</dt>
                <dd className="font-medium text-slate-900">{pl.parent.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1 text-slate-400">
                  <Phone className="size-3.5" aria-hidden /> 전화번호
                </dt>
                <dd className="font-medium tabular-nums text-slate-900">
                  {pl.parent.phone}
                </dd>
              </div>
              {pl.parent.email && (
                <div className="flex justify-between gap-3">
                  <dt className="flex items-center gap-1 text-slate-400">
                    <Mail className="size-3.5" aria-hidden /> 이메일
                  </dt>
                  <dd className="min-w-0 truncate font-medium text-slate-900">
                    {pl.parent.email}
                  </dd>
                </div>
              )}
              {pl.parent.emergencyContact && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">긴급연락처</dt>
                  <dd className="font-medium tabular-nums text-slate-900">
                    {pl.parent.emergencyContact}
                  </dd>
                </div>
              )}
              {pl.parent.memo && (
                <div className="border-t border-slate-100 pt-2">
                  <dt className="mb-1 text-slate-400">메모</dt>
                  <dd className="whitespace-pre-wrap leading-relaxed text-slate-600">
                    {pl.parent.memo}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
