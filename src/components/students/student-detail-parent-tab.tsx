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
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-[#8B95A1] text-center">
            등록된 학부모 정보가 없습니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {student.parentLinks.map((pl: any) => (
        <Card key={pl.parent.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
              <Users className="size-4 text-indigo-500" />
              {getRelationLabel(pl.parent.relation)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#8B95A1]">이름</dt>
                <dd className="font-medium text-[#191F28]">{pl.parent.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#8B95A1] flex items-center gap-1">
                  <Phone className="size-3.5" /> 전화번호
                </dt>
                <dd className="font-medium text-[#191F28]">
                  {pl.parent.phone}
                </dd>
              </div>
              {pl.parent.email && (
                <div className="flex justify-between">
                  <dt className="text-[#8B95A1] flex items-center gap-1">
                    <Mail className="size-3.5" /> 이메일
                  </dt>
                  <dd className="font-medium text-[#191F28]">
                    {pl.parent.email}
                  </dd>
                </div>
              )}
              {pl.parent.emergencyContact && (
                <div className="flex justify-between">
                  <dt className="text-[#8B95A1]">긴급연락처</dt>
                  <dd className="font-medium text-[#191F28]">
                    {pl.parent.emergencyContact}
                  </dd>
                </div>
              )}
              {pl.parent.memo && (
                <div className="pt-2 border-t border-[#F2F4F6]">
                  <dt className="text-[#8B95A1] mb-1">메모</dt>
                  <dd className="text-[#4E5968] whitespace-pre-wrap">
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
