import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { getTutorProgramList } from "@/actions/tutor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatTutorStatus } from "@/lib/tutor/ui-copy";

export default async function TutorProgramsPage() {
  const programs = await getTutorProgramList();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">프로그램</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">학습 프로그램</h1>
        </div>
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link href="/director/tutor/programs/new">
            <Plus className="mr-2 size-4" /> 새 프로그램
          </Link>
        </Button>
      </div>

      <div className="grid gap-3">
        {programs.map((program) => (
          <Card key={program.id} className="border-slate-200 bg-white shadow-sm">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
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
              <Button asChild variant="ghost" size="sm">
                <Link href={`/director/tutor/programs/${program.id}/builder`}>
                  열기 <ChevronRight className="ml-1 size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
        {programs.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
            분석 완료 지문을 선택해서 첫 프로그램을 만들어보세요.
          </div>
        )}
      </div>
    </div>
  );
}
