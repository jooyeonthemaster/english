// @ts-nocheck
import { cn, formatDate, getScoreColor } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Award,
  Calendar,
  MessageSquare,
  User,
} from "lucide-react";
import { getAttendanceBadge } from "./student-detail-helpers";

interface StudentDetailOverviewTabProps {
  student: any;
  stats: any;
}

export function StudentDetailOverviewTab({
  student,
  stats,
}: StudentDetailOverviewTabProps) {
  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Recent Exams */}
      {showResults && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
              <Award className="size-4 text-blue-500" />
              최근 시험
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.examSubmissions.length === 0 ? (
              <p className="text-sm text-[#8B95A1] py-4 text-center">
                시험 기록이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {stats.examSubmissions.slice(0, 5).map((exam: any) => (
                  <div
                    key={exam.id}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#191F28]">
                        {exam.exam.title}
                      </p>
                      <p className="text-xs text-[#8B95A1]">
                        {formatDate(exam.submittedAt)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-bold",
                        getScoreColor(
                          exam.score && exam.totalPoints
                            ? (exam.score / exam.totalPoints) * 100
                            : 0
                        )
                      )}
                    >
                      {exam.score ?? "-"}/{exam.totalPoints ?? "-"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Attendance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
            <Calendar className="size-4 text-emerald-500" />
            최근 출결
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentAttendances.length === 0 ? (
            <p className="text-sm text-[#8B95A1] py-4 text-center">
              출결 기록이 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.recentAttendances.slice(0, 5).map((att: any) => (
                <div key={att.id} className="flex items-center justify-between">
                  <span className="text-sm text-[#4E5968]">
                    {formatDate(att.date)}
                  </span>
                  {getAttendanceBadge(att.status)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Student Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
            <User className="size-4 text-gray-500" />
            기본 정보
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-[#8B95A1]">입학일</dt>
              <dd className="font-medium text-[#191F28]">
                {formatDate(student.enrollDate)}
              </dd>
            </div>
            <div>
              <dt className="text-[#8B95A1]">생년월일</dt>
              <dd className="font-medium text-[#191F28]">
                {student.birthDate ? formatDate(student.birthDate) : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-[#8B95A1]">성별</dt>
              <dd className="font-medium text-[#191F28]">
                {student.gender === "MALE"
                  ? "남"
                  : student.gender === "FEMALE"
                  ? "여"
                  : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-[#8B95A1]">전화번호</dt>
              <dd className="font-medium text-[#191F28]">
                {student.phone || "-"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Memo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
            <MessageSquare className="size-4 text-amber-500" />
            특이사항
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#4E5968] whitespace-pre-wrap">
            {student.memo || "등록된 특이사항이 없습니다."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
