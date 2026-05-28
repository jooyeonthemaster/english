import { getTutorProgramList } from "@/actions/tutor";
import { UserResultsDisabled } from "@/components/shared/user-results-disabled";
import { Card, CardContent } from "@/components/ui/card";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import Link from "next/link";

export default async function TutorMonitorIndexPage() {
  if (!FEATURE_FLAGS.SHOW_USER_RESULTS) {
    return <UserResultsDisabled homeHref="/director/tutor" />;
  }

  const programs = await getTutorProgramList();
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-blue-600">학습 현황</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">프로그램별 현황</h1>
      </div>
      <div className="grid gap-3">
        {programs.map((program) => (
          <Link key={program.id} href={`/director/tutor/programs/${program.id}/monitor`}>
            <Card className="border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30">
              <CardContent className="p-4">
                <p className="font-semibold text-slate-950">{program.title}</p>
                <p className="mt-1 text-sm text-slate-500">{program.assignments.length}회 배포</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
