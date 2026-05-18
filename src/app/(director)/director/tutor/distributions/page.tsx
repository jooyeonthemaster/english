import { getTutorProgramList } from "@/actions/tutor";
import { Card, CardContent } from "@/components/ui/card";

export default async function TutorDistributionsPage() {
  const programs = await getTutorProgramList();
  const assignments = programs.flatMap((program) =>
    program.assignments.map((assignment) => ({ ...assignment, programTitle: program.title })),
  );
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-blue-600">배포 관리</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">배포 내역</h1>
      </div>
      <div className="grid gap-3">
        {assignments.map((assignment) => (
          <Card key={assignment.id} className="border-slate-200 bg-white shadow-sm">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">{assignment.programTitle}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {assignment.recipients.length}명 · {assignment.status}
                </p>
              </div>
              <span className="text-xs text-slate-400">{assignment.createdAt.toLocaleDateString("ko-KR")}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
