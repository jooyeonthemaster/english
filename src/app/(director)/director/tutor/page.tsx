import Link from "next/link";
import { Activity, BookOpenCheck, ChevronRight, Send, Users } from "lucide-react";
import { getTutorDashboardData } from "@/actions/tutor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { formatTutorStatus } from "@/lib/tutor/ui-copy";

export default async function DirectorTutorPage() {
  const data = await getTutorDashboardData();
  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;
  const completed = showResults
    ? data.progress.find((item) => item.status === "SUBMITTED" || item.status === "GRADED")?._count ?? 0
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">모바일 학습</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">튜터 운영 홈</h1>
          <p className="mt-2 text-sm text-slate-500">
            {showResults
              ? "지문 묶음 프로그램을 만들고, 학생들의 모바일 학습 진행을 한 곳에서 확인합니다."
              : "지문 묶음 프로그램을 만들고 모바일 학습 배포를 관리합니다."}
          </p>
        </div>
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link href="/director/tutor/programs/new">새 프로그램 만들기</Link>
        </Button>
      </div>

      <div className={showResults ? "grid gap-3 md:grid-cols-4" : "grid gap-3 md:grid-cols-3"}>
        <MetricCard icon={BookOpenCheck} label="프로그램" value={data.programCount} />
        <MetricCard icon={Send} label="진행 중 배포" value={data.openAssignments} />
        <MetricCard icon={Users} label="활성 학생" value={data.activeStudents} />
        {showResults && <MetricCard icon={Activity} label="완료 기록" value={completed} />}
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">최근 프로그램</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/director/tutor/programs">
              전체 보기 <ChevronRight className="ml-1 size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-slate-100">
            {data.recentPrograms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                아직 만든 프로그램이 없습니다.
              </div>
            ) : (
              data.recentPrograms.map((program) => (
                <Link
                  key={program.id}
                  href={`/director/tutor/programs/${program.id}/builder`}
                  className="flex items-center justify-between gap-4 py-4 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{program.title}</p>
                      <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">
                        {formatTutorStatus(program.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {program.lessons.length}개 지문 ·{" "}
                      {program.lessons.reduce((sum, link) => sum + link.lesson.activities.length, 0)}개 활동
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-slate-400" />
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpenCheck;
  label: string;
  value: number;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-950">{value.toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  );
}
