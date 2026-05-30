import Link from "next/link";
import { Activity, ChevronRight, PencilLine, Plus, Smartphone } from "lucide-react";
import { getTutorProgramList } from "@/actions/tutor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatTutorStatus } from "@/lib/tutor/ui-copy";

export default async function TutorProgramsPage() {
  const programs = await getTutorProgramList();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">프로그램 관리</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">생성된 모바일 프로그램 관리</h1>
          <p className="mt-2 text-sm text-slate-500">
            이미 생성한 모바일 학습 프로그램의 구성, 학생 화면, 배포 현황을 운영합니다.
          </p>
        </div>
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link href="/director/tutor/programs/new">
            <Plus className="size-4" /> 프로그램 생성
          </Link>
        </Button>
      </div>

      <div className="grid gap-3">
        {programs.map((program) => (
          <Card key={program.id} className="border-slate-200 bg-white shadow-sm">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 sm:flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-bold text-slate-950">{program.title}</h2>
                  <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">
                    {formatTutorStatus(program.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {program.lessons.length}개 지문 · {program.assignments.length}회 배포 ·{" "}
                  {program.assignments.reduce((sum, assignment) => sum + assignment.recipients.length, 0)}명 대상
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/director/tutor/programs/${program.id}/emulator`}>
                    <Smartphone className="size-4" /> 학생 화면
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/director/tutor/programs/${program.id}/monitor`}>
                    <Activity className="size-4" /> 배포 현황
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/director/tutor/programs/${program.id}/builder`}>
                    <PencilLine className="size-4" /> 생성 빌더 <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {programs.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
            아직 관리할 프로그램이 없습니다. 프로그램 생성에서 첫 모바일 프로그램을 만들어보세요.
          </div>
        )}
      </div>
    </div>
  );
}
